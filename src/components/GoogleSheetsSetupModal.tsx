import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { 
  FileSpreadsheet, 
  ExternalLink, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle,
  Camera,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { testGoogleSheetsWebhook } from '../services/googleSheetsService';

export const APPS_SCRIPT_CODE = `/**
 * Snapped.gs - SOIE Fit Comment & Multi-Photo Snapshots Sync
 * 
 * Features:
 * 1. Handles 1 to 10 photos per round.
 * 2. Uploads all individual photos + composite grid thumbnail to Google Drive.
 * 3. Uses official Google CDN URL (https://lh3.googleusercontent.com/d/FILE_ID) for =IMAGE() so photos ALWAYS display inside Google Sheets cells.
 * 4. Wraps image in =HYPERLINK() so clicking the thumbnail in Google Sheets opens full-resolution zoom in Google Drive!
 * 5. Adds Cell Notes with direct links to all individual photos (Photo 1 to 10).
 * 6. Target Columns:
 *    - Round 1: Column BI (61)
 *    - Round 2: Column BJ (62)
 *    - Round 3: Column BK (63)
 *    - Round 4: Column BL (64)
 *    - Round 5: Column BM (65)
 *    - Assignment ID: Column AX (50)
 */

// Web app health check
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    file: "Snapped.gs",
    message: "Snapped.gs is active and ready for Fit Comments & Photo Snaps!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 1. Acquire lock for up to 30 seconds to prevent race conditions during parallel submissions
    lock.waitLock(30000);
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("Error: No post data received").setMimeType(ContentService.MimeType.TEXT);
    }

    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    
    // 2. Identify the Spreadsheet
    var ss;
    if (data.sheetId) {
      ss = SpreadsheetApp.openById(data.sheetId);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    if (!ss) {
      throw new Error("Spreadsheet not found. Check ID or binding.");
    }
    
    // 3. Handle explicit EMAIL trigger
    if (data.type === 'SEND_MAIL') {
      return sendMail(data);
    }
    
    // 4. Identify the target sheet (Series based)
    var sheetName = data.tabName || "General";
    var sheet = getSheetWithHeaders(ss, sheetName);
    
    // Ensure sheet has at least 70 columns for all rounds + attachments (BI to BM)
    if (sheet.getMaxColumns() < 70) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 70 - sheet.getMaxColumns());
    }

    // 5. Find or create the row
    var assignmentId = data.assignmentId || data.id || data.AX;
    var row = -1;
    
    // Search for existing record if assignmentId is present (Column AX = 50)
    if (assignmentId) {
       row = findRow(sheet, assignmentId);
    }
    
    // Fallback: search by Style No (Col D) and Model Name (Col B)
    if (row === -1 && (data.styleNo || data.D)) {
       row = findRowByStyle(sheet, data.styleNo || data.D, data.modelName || data.B);
    }
    
    if (row === -1) {
      // NEW SUBMISSION: Append a new row at the bottom
      row = sheet.getLastRow() + 1;
      
      // Initialize basic identifying markers
      updateCell(sheet, row, "AX", assignmentId); // ID in column AX (50)
      updateCell(sheet, row, "A", data.timestamp || new Date());
    } else {
      if (assignmentId) {
        updateCell(sheet, row, "AX", assignmentId);
      }
    }
    
    // 6. UPDATE GENERAL FIELDS (B-F)
    updateCell(sheet, row, "B", data.modelName || data.model_name || data.B);
    updateCell(sheet, row, "C", data.sampleType || data.typeOfSample || data.type_of_sample || data.C);
    updateCell(sheet, row, "D", data.styleNo || data.style_number || data.D);
    updateCell(sheet, row, "E", data.description || data.Instructions || data.E);
    updateCell(sheet, row, "F", data.size || data.F);
    
    // 7. Update round-specific data (Rounds 1 to 5)
    var round = String(data.round || "1");
    
    if (round === "1") {
      updateCell(sheet, row, "G", data.color || data.G);
      updateCell(sheet, row, "H", data.givenForFitDate || data.H);
      updateCell(sheet, row, "I", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.I);
      updateCell(sheet, row, "J", data.receivedDate || data.received_date || data.J);
      updateCell(sheet, row, "K", data.beforeWash || data.before_wash || data.K);
      updateCell(sheet, row, "L", data.afterWash || data.after_wash || data.L);
      updateCell(sheet, row, "M", data.fabricComments || data.fabricTrims || data.fabric_trims || data.M);
    } 
    else if (round === "2") {
      updateCell(sheet, row, "O", data.color || data.O);
      updateCell(sheet, row, "P", data.givenForFitDate || data.P); 
      updateCell(sheet, row, "Q", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Q); 
      updateCell(sheet, row, "R", data.receivedDate || data.received_date || data.R);
      updateCell(sheet, row, "S", data.beforeWash || data.before_wash || data.S);
      updateCell(sheet, row, "T", data.afterWash || data.after_wash || data.T);
      updateCell(sheet, row, "U", data.fabricComments || data.fabricTrims || data.fabric_trims || data.U);
    } 
    else if (round === "3") {
      updateCell(sheet, row, "W", data.color || data.W); 
      updateCell(sheet, row, "X", data.givenForFitDate || data.X); 
      updateCell(sheet, row, "Y", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Y); 
      updateCell(sheet, row, "Z", data.receivedDate || data.received_date || data.Z);
      updateCell(sheet, row, "AA", data.beforeWash || data.before_wash || data.AA);
      updateCell(sheet, row, "AB", data.afterWash || data.after_wash || data.AB);
      updateCell(sheet, row, "AC", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AC);
    }
    else if (round === "4") {
      updateCell(sheet, row, "AE", data.color || data.AE); 
      updateCell(sheet, row, "AF", data.givenForFitDate || data.AF); 
      updateCell(sheet, row, "AG", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AG); 
      updateCell(sheet, row, "AH", data.receivedDate || data.received_date || data.AH);
      updateCell(sheet, row, "AI", data.beforeWash || data.before_wash || data.AI);
      updateCell(sheet, row, "AJ", data.afterWash || data.after_wash || data.AJ);
      updateCell(sheet, row, "AK", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AK);
    }
    else if (round === "5") {
      updateCell(sheet, row, "AM", data.color || data.AM); 
      updateCell(sheet, row, "AN", data.givenForFitDate || data.AN); 
      updateCell(sheet, row, "AO", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AO); 
      updateCell(sheet, row, "AP", data.receivedDate || data.received_date || data.AP);
      updateCell(sheet, row, "AQ", data.beforeWash || data.before_wash || data.AQ);
      updateCell(sheet, row, "AR", data.afterWash || data.after_wash || data.AR);
      updateCell(sheet, row, "AS", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AS);
    }
    
    // 8. Handle Fit Photos & Cell Snapshot (Columns BI to BM)
    if (data.attachments || data.collageAttachment || data.allImages || data.images) {
      try {
        handleAttachments(data, sheet, row);
      } catch (photoErr) {
        Logger.log("Non-blocking photo error: " + photoErr.message);
      }
    }

    // 9. Handle automatic email notification
    if (data.triggerEmail) {
      sendMail(data);
    }
    
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    
  } catch (err) {
    Logger.log("doPost Error: " + err.message);
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    lock.releaseLock();
  }
}

// Uploads photos to Google Drive and embeds snapshot directly into the cell
function handleAttachments(data, sheet, rowIndex) {
  if (!data || !sheet || !rowIndex) return;

  var round = String(data.round || "1");
  var colMap = { "1": "BI", "2": "BJ", "3": "BK", "4": "BL", "5": "BM" };
  var targetCol = data.attachmentColumn || colMap[round] || "BI";
  var colIdx = colNameToIndex(targetCol);
  if (colIdx <= 0) return;

  if (sheet.getMaxColumns() < colIdx) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), colIdx - sheet.getMaxColumns());
  }

  // 1. Get or create root Drive Folder
  var folder = getOrCreatePhotoFolder(data.folderId);
  if (!folder) {
    folder = DriveApp.getRootFolder();
  }

  var cleanStyle = String(data.styleNo || data.D || "Sample").replace(/[^a-zA-Z0-9_-]/g, "_");
  var cleanModel = String(data.modelName || data.B || "Model").replace(/[^a-zA-Z0-9_-]/g, "_");
  var subFolderName = cleanStyle + "_R" + round + "_" + cleanModel;
  var targetFolder = folder;

  // 2. Create subfolder for this Style + Round
  try {
    var subIter = folder.getFoldersByName(subFolderName);
    if (subIter.hasNext()) {
      targetFolder = subIter.next();
    } else {
      targetFolder = folder.createFolder(subFolderName);
      try {
        targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {}
    }
  } catch (errSub) {
    targetFolder = folder;
  }

  var imageToEmbedUrl = null;
  var primaryViewUrl = null;
  var photoViewLinks = [];

  // 3. Upload Collage / Grid Snapshot if present (Contains all 1-10 photos in a clean thumbnail grid!)
  if (data.collageAttachment && data.collageAttachment.data) {
    try {
      var cData = data.collageAttachment.data;
      if (cData.indexOf(",") > -1) cData = cData.split(",")[1];
      var cBytes = Utilities.base64Decode(cData);
      var cFileName = cleanStyle + "_R" + round + "_Grid_Thumbnail.jpg";
      var cBlob = Utilities.newBlob(cBytes, "image/jpeg", cFileName);
      var cFile = targetFolder.createFile(cBlob);
      try {
        cFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {}
      
      var cFileId = cFile.getId();
      // CRITICAL: Google Sheets =IMAGE() MUST use https://lh3.googleusercontent.com/d/FILE_ID
      imageToEmbedUrl = "https://lh3.googleusercontent.com/d/" + cFileId;
      primaryViewUrl = "https://drive.google.com/file/d/" + cFileId + "/view?usp=sharing";
    } catch (cErr) {
      Logger.log("Collage creation error: " + cErr.message);
    }
  }

  // 4. Upload Individual Photos (1 to 10 photos)
  var list = [];
  if (data.allImages && data.allImages.length > 0) list = data.allImages;
  else if (data.attachments && data.attachments.length > 0) list = data.attachments;
  else if (data.images && data.images.length > 0) list = data.images;

  for (var i = 0; i < list.length; i++) {
    try {
      var att = list[i];
      if (!att) continue;
      var rawData = att.data || att.dataUrl || att.base64;
      if (!rawData) continue;
      if (rawData.indexOf(",") > -1) rawData = rawData.split(",")[1];
      
      var bytes = Utilities.base64Decode(rawData);
      var ext = (att.type && att.type.indexOf("png") > -1) ? ".png" : ".jpg";
      var mime = (att.type && att.type.indexOf("png") > -1) ? "image/png" : "image/jpeg";
      var fName = cleanStyle + "_R" + round + "_Photo_" + (i + 1) + ext;
      var blob = Utilities.newBlob(bytes, mime, fName);
      var file = targetFolder.createFile(blob);
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {}

      var fileId = file.getId();
      var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
      var viewLink = "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing";
      photoViewLinks.push(viewLink);

      if (!imageToEmbedUrl) {
        imageToEmbedUrl = directUrl;
        primaryViewUrl = viewLink;
      }
    } catch (attErr) {
      Logger.log("File " + i + " upload error: " + attErr.message);
    }
  }

  // 5. Embed Image Formula in the Target Cell with Direct Click to Zoom
  var cell = sheet.getRange(rowIndex, colIdx);
  if (imageToEmbedUrl) {
    try {
      var destinationUrl = targetFolder.getUrl() || primaryViewUrl;
      // Formula: =HYPERLINK("drive_link", IMAGE("lh3_link", 1))
      cell.setFormula('=HYPERLINK("' + destinationUrl + '", IMAGE("' + imageToEmbedUrl + '", 1))');
      
      // Formatting for clean visibility
      sheet.setRowHeight(rowIndex, 85);
      sheet.setColumnWidth(colIdx, 115);
      cell.setHorizontalAlignment("center").setVerticalAlignment("middle");

      // Cell Note with direct links to every single photo
      var totalPhotos = photoViewLinks.length || (data.attachmentsCount || 1);
      var note = "📸 Fit Photos (" + totalPhotos + " Photos Attached):\\n";
      note += "👉 Click cell to open & zoom full HD in Google Drive\\n\\n";
      for (var k = 0; k < photoViewLinks.length; k++) {
        note += "• Photo " + (k + 1) + ": " + photoViewLinks[k] + "\\n";
      }
      note += "\\n📁 All Photos Folder: " + targetFolder.getUrl();
      cell.setNote(note);

    } catch (imgErr) {
      Logger.log("Error setting image cell formula: " + imgErr.message);
      if (primaryViewUrl) {
        cell.setValue(primaryViewUrl);
      }
    }
  } else if (data.attachmentsCount && data.attachmentsCount > 0) {
    cell.setValue(data.attachmentsCount + " photos attached");
  }
}

// Converts column letters like A, Z, AX, BI, BJ to 1-based numeric column indices
function colNameToIndex(colName) {
  if (!colName) return 0;
  var col = String(colName).trim().toUpperCase();
  var num = 0;
  for (var i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

function getOrCreatePhotoFolder(folderId) {
  if (folderId) {
    try {
      var f = DriveApp.getFolderById(folderId);
      if (f) return f;
    } catch (e) {}
  }
  try {
    var folders = DriveApp.getFoldersByName("SOIE_Fit_Attachments");
    if (folders.hasNext()) {
      var existing = folders.next();
      try { existing.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
      return existing;
    }
    var created = DriveApp.createFolder("SOIE_Fit_Attachments");
    try { created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    return created;
  } catch (err) {
    return DriveApp.getRootFolder();
  }
}

function getSheetWithHeaders(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = [
      "Timestamp", "Model Name", "Type of sample", "Style no", "Description", "Size", 
      "R1 Color", "R1 Fit Date", "R1 Comments Date", "R1 Received", "R1 Before Wash", "R1 After Wash", "R1 Fabric/Trims", "R1 Feedback",
      "R2 Color", "R2 Fit Date", "R2 Comments Date", "R2 Received", "R2 Before Wash", "R2 After Wash", "R2 Fabric/Trims", "R2 Feedback",
      "R3 Color", "R3 Fit Date", "R3 Comments Date", "R3 Received", "R3 Before Wash", "R3 After Wash", "R3 Fabric/Trims", "R3 Feedback",
      "R4 Color", "R4 Fit Date", "R4 Comments Date", "R4 Received", "R4 Before Wash", "R4 After Wash", "R4 Fabric/Trims", "R4 Feedback",
      "R5 Color", "R5 Fit Date", "R5 Comments Date", "R5 Received", "R5 Before Wash", "R5 After Wash", "R5 Fabric/Trims", "R5 Feedback"
    ];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#f3f4f6").setFontWeight("bold");
  }

  // Ensure headers for photo columns BI to BM exist
  try {
    if (sheet.getMaxColumns() < 70) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 70 - sheet.getMaxColumns());
    }
    var photoHeaders = {
      "BI": "R1 Fit Photos",
      "BJ": "R2 Fit Photos",
      "BK": "R3 Fit Photos",
      "BL": "R4 Fit Photos",
      "BM": "R5 Fit Photos"
    };
    for (var colKey in photoHeaders) {
      var cIdx = colNameToIndex(colKey);
      var currentVal = sheet.getRange(1, cIdx).getValue();
      if (!currentVal) {
        sheet.getRange(1, cIdx).setValue(photoHeaders[colKey]).setBackground("#e0e7ff").setFontWeight("bold");
      }
    }
  } catch (e) {}

  return sheet;
}

function findRow(sheet, assignmentId) {
  if (!assignmentId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  var ids = sheet.getRange(1, 50, lastRow, 1).getValues();
  var targetId = String(assignmentId).trim().toLowerCase();
  
  for (var i = 1; i < ids.length; i++) {
    var sheetId = String(ids[i][0]).trim().toLowerCase();
    if (sheetId === targetId) return i + 1;
  }
  return -1;
}

function findRowByStyle(sheet, styleNo, modelName) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var targetStyle = String(styleNo).trim().toLowerCase();
  var targetModel = modelName ? String(modelName).trim().toLowerCase() : "";
  var data = sheet.getRange(2, 2, lastRow - 1, 3).getValues(); // Cols B (2), C (3), D (4)
  for (var i = 0; i < data.length; i++) {
    var mName = String(data[i][0]).trim().toLowerCase();
    var sNo = String(data[i][2]).trim().toLowerCase();
    if (sNo === targetStyle) {
      if (!targetModel || mName === targetModel) {
        return i + 2;
      }
    }
  }
  return -1;
}

function updateCell(sheet, row, colName, value) {
  if (value === undefined || value === null || value === "") return;
  var colIndex = colNameToIndex(colName);
  if (colIndex > 0) {
    if (sheet.getMaxColumns() < colIndex) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colIndex - sheet.getMaxColumns());
    }
    sheet.getRange(row, colIndex).setValue(value);
  }
}

function sendMail(data) {
  var recipient = data.modelEmail || data.senderEmail;
  if (!recipient || (!data.link && !data.responseUrl)) return ContentService.createTextOutput("Email missing recipient or link").setMimeType(ContentService.MimeType.TEXT);
  
  var link = data.link || data.responseUrl;
  var round = data.round || "1";
  var subject = "Action Required: Fit Comments for Style " + (data.styleNo || "New") + " (Round " + round + ")";
  
  var htmlBody = 
    "<div style='font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;'>" +
      "<div style='background-color: #4f46e5; padding: 30px; text-align: center; color: white;'>" +
        "<h1 style='margin: 0; font-size: 24px;'>Fit Feedback Required</h1>" +
        "<p style='margin: 10px 0 0; opacity: 0.9;'>Round " + round + " Request</p>" +
      "</div>" +
      "<div style='padding: 30px; background-color: white;'>" +
        "<p>Hello <strong>" + (data.modelName || "Model") + "</strong>,</p>" +
        "<p>You have a new sample fit request that requires your feedback. Please click the button below to provide your comments:</p>" +
        "<div style='text-align: center; margin: 40px 0;'>" +
          "<a href='" + link + "' style='background-color: #4338ca; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);'>Open Feedback Form</a>" +
        "</div>" +
        "<hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;'>" +
        "<p style='color: #4f46e5; font-size: 13px; word-break: break-all;'>" + link + "</p>" +
      "</div>" +
    "</div>";

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: htmlBody,
    replyTo: data.senderEmail,
    name: (data.senderName || "Fit Comment System")
  });
  
  return ContentService.createTextOutput("Email Sent").setMimeType(ContentService.MimeType.TEXT);
}

// Function to test and authorize permissions in Apps Script IDE
function testRun() {
  Logger.log("=== 1. Checking Spreadsheet Access ===");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("Spreadsheet: " + (ss ? ss.getName() : "None"));

  Logger.log("=== 2. Checking Google Drive Access ===");
  var folder = getOrCreatePhotoFolder();
  Logger.log("Google Drive Folder: " + (folder ? folder.getName() : "None"));

  Logger.log("=== SUCCESS: Permissions authorized successfully! ===");
}`;

export function GoogleSheetsSetupModal() {
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID || "1cBuUaoIh_-uWnwmtijsEX2JcZGTbhNirbVdQXjKyQ2o";
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || "";

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testGoogleSheetsWebhook();
      setTestResult(result);
      if (result.success) {
        toast.success("Webhook connection test successful!");
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Failed to reach webhook." });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    toast.success("Google Apps Script copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 gap-1.5 text-xs font-medium border-slate-300 hover:bg-slate-50 text-slate-700 shadow-xs cursor-pointer"
          />
        }
      >
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
        <span>Google Sheets & Photos</span>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Google Sheets & Photo Snapshots Setup
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Sync fit evaluation comments and live photo snapshots to your spreadsheet
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Target Sheet Info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Active Google Sheet ID</span>
              <a 
                href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} 
                target="_blank" 
                rel="noreferrer" 
                className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1 font-medium"
              >
                Open Google Sheet
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="font-mono text-xs text-slate-800 bg-white p-2 rounded-md border select-all truncate">
              {sheetId}
            </div>
          </div>

          {/* Webhook Status & Test */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Apps Script Webhook Status</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleTestConnection} 
                disabled={testing}
                className="h-7 text-xs gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>

            {testResult && (
              <div className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                testResult.success 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{testResult.success ? 'Connected Successfully' : 'Action Required'}</p>
                  <p className="text-[11px] mt-0.5 opacity-90">{testResult.message}</p>
                </div>
              </div>
            )}
          </div>

          {/* Key Columns Guide */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-1">
              <div className="font-semibold text-indigo-900 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                Column AX (Col 50)
              </div>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                Stores unique <strong>Assignment ID</strong>. Keeps Rounds 1 to 5 synchronized in the exact same row.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-1">
              <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                Columns BI – BM (Cols 61–65)
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Live <strong>=IMAGE(...)</strong> thumbnail grid for <strong>1 to 10 photos</strong>. Click cell to open &amp; zoom in full HD on Google Drive!
              </p>
            </div>
          </div>

          {/* Snapped.gs Instructions */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2 text-xs">
            <div className="font-bold text-amber-900 flex items-center gap-1.5">
              <span>⚠️ Important: Using <code>Snapped.gs</code> with existing <code>Code.gs</code></span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Google Apps Script shares one global namespace. If <code>Code.gs</code> and <code>Snapped.gs</code> both have <code>function doPost</code>, Apps Script gets confused.
            </p>
            <ol className="text-[11px] text-amber-900 space-y-1.5 list-decimal pl-4 leading-relaxed font-medium">
              <li>
                In <code>Code.gs</code>, change line 1 from <code>function doPost(e)</code> to <code>function doPost_original(e)</code>. <em>(Keeps your original code 100% safe!)</em>
              </li>
              <li>
                In <code>Snapped.gs</code>, paste the complete code copied below and click <strong>Save</strong>.
              </li>
              <li>
                In the function dropdown, select <strong><code>testRun</code></strong> and click <strong>Run</strong>. Click <em>Review Permissions &gt; Allow</em> to authorize Drive &amp; Sheets access.
              </li>
              <li>
                Click <strong>Deploy &gt; New Deployment</strong> (or Edit latest version), select <strong>Web app</strong>, Execute as <strong>Me</strong>, Who has access: <strong>Anyone</strong>.
              </li>
            </ol>
          </div>

          {/* Code Copy Button */}
          <div className="pt-1">
            <Button 
              className="w-full gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 shadow-sm"
              onClick={handleCopyCode}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied to Clipboard!' : 'Copy Complete Snapped.gs Script Code'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
