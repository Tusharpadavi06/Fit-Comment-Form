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
  Layers,
  Download,
  ZoomIn
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
 *    - Round 1: Sample Column BI (61), Fit Photos Column BJ (62)
 *    - Round 2: Sample Column BK (63), Fit Photos Column BL (64)
 *    - Round 3: Sample Column BM (65), Fit Photos Column BN (66)
 *    - Round 4: Sample Column BO (67), Fit Photos Column BP (68)
 *    - Round 5: Sample Column BQ (69), Fit Photos Column BR (70)
 *    - Assignment ID: Column AX (50)
 */

// Web app health check & Interactive Photo Zoom Lightbox
function doGet(e) {
  if (e && e.parameter && (e.parameter.zoom || e.parameter.folder)) {
    return renderPhotoZoomViewer(e.parameter);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    file: "Snapped.gs",
    message: "Snapped.gs is active and ready for Fit Comments & Photo Snaps!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// Dual entry point: supports both doPost(e) and doPost_original(e)
function doPost(e) {
  return doPost_original(e);
}

function doPost_original(e) {
  var lock = LockService.getScriptLock();
  try {
    // 1. Acquire lock for 30 seconds to prevent race conditions during parallel submissions
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
    var sheetName = data.tabName || data.series || "General";
    var sheet = ss.getSheetByName(sheetName);
    var assignmentId = data.assignmentId || data.id || data.AX;
    var row = -1;
    
    // Search for existing assignment across the spreadsheet if assignmentId is present (Column AX = 50)
    if (assignmentId) {
      if (sheet) {
        row = findRow(sheet, assignmentId);
      }
      // If not found in designated tab, search ALL tabs in the spreadsheet to avoid duplicate rows
      if (row === -1) {
        var allSheets = ss.getSheets();
        for (var s = 0; s < allSheets.length; s++) {
          var candidateSheet = allSheets[s];
          var candidateRow = findRow(candidateSheet, assignmentId);
          if (candidateRow !== -1) {
            sheet = candidateSheet;
            row = candidateRow;
            break;
          }
        }
      }
    }
    
    // Fallback: search by Style No (Col D) and Model Name (Col B) across sheets
    if (row === -1 && (data.styleNo || data.D)) {
      if (sheet) {
        row = findRowByStyle(sheet, data.styleNo || data.D, data.modelName || data.B);
      }
      if (row === -1) {
        var allSheets = ss.getSheets();
        for (var s = 0; s < allSheets.length; s++) {
          var candidateSheet = allSheets[s];
          var candidateRow = findRowByStyle(candidateSheet, data.styleNo || data.D, data.modelName || data.B);
          if (candidateRow !== -1) {
            sheet = candidateSheet;
            row = candidateRow;
            break;
          }
        }
      }
    }

    // If still no sheet found, ensure the target sheet exists with headers
    if (!sheet) {
      sheet = getSheetWithHeaders(ss, sheetName);
    }
    
    // Ensure sheet has enough columns for all rounds + sample & fit photos (BI to BR = 61 to 70)
    if (sheet.getMaxColumns() < 72) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 72 - sheet.getMaxColumns());
    }

    if (row === -1) {
      // NEW SUBMISSION: Append a truly new row at the bottom
      row = sheet.getLastRow() + 1;
      
      // Initialize basic identifying markers
      updateCell(sheet, row, "AX", assignmentId); // ID in column AX (50)
      updateCell(sheet, row, "A", data.timestamp || new Date());
    } else {
      if (assignmentId) {
        updateCell(sheet, row, "AX", assignmentId);
      }
    }
    
    // 6. UPDATE FIELDS (B-F are general)
    updateCell(sheet, row, "B", data.modelName || data.model_name || data.B);
    updateCell(sheet, row, "C", data.sampleType || data.typeOfSample || data.type_of_sample || data.C);
    updateCell(sheet, row, "D", data.styleNo || data.style_number || data.D);
    updateCell(sheet, row, "E", data.description || data.Instructions || data.E);
    updateCell(sheet, row, "F", data.size || data.F);
    
    // 7. Update round-specific data (Revised to match user requested mapping)
    var round = String(data.round || "1");
    
    if (round === "1") {
      updateCell(sheet, row, "G", data.color || data.G);
      updateCell(sheet, row, "H", data.givenForFitDate || data.H);
      updateCell(sheet, row, "I", data.receivedDate || data.received_date || data.I);
      updateCell(sheet, row, "J", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.J);
      updateCell(sheet, row, "K", data.beforeWash || data.before_wash || data.K);
      updateCell(sheet, row, "L", data.afterWash || data.after_wash || data.L);
      updateCell(sheet, row, "M", data.fabricComments || data.fabricTrims || data.fabric_trims || data.M);
      updateCell(sheet, row, "N", data.feedback || data.comments || data.N);
    } 
    else if (round === "2") {
      updateCell(sheet, row, "O", data.color || data.O);
      updateCell(sheet, row, "P", data.givenForFitDate || data.P); 
      updateCell(sheet, row, "Q", data.receivedDate || data.received_date || data.Q);
      updateCell(sheet, row, "R", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.R);
      updateCell(sheet, row, "S", data.beforeWash || data.before_wash || data.S);
      updateCell(sheet, row, "T", data.afterWash || data.after_wash || data.T);
      updateCell(sheet, row, "U", data.fabricComments || data.fabricTrims || data.fabric_trims || data.U);
      updateCell(sheet, row, "V", data.feedback || data.comments || data.V);
    } 
    else if (round === "3") {
      updateCell(sheet, row, "W", data.color || data.W); 
      updateCell(sheet, row, "X", data.givenForFitDate || data.X); 
      updateCell(sheet, row, "Y", data.receivedDate || data.received_date || data.Y);
      updateCell(sheet, row, "Z", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.Z); 
      updateCell(sheet, row, "AA", data.beforeWash || data.before_wash || data.AA);
      updateCell(sheet, row, "AB", data.afterWash || data.after_wash || data.AB);
      updateCell(sheet, row, "AC", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AC);
      updateCell(sheet, row, "AD", data.feedback || data.comments || data.AD);
    }
    else if (round === "4") {
      updateCell(sheet, row, "AE", data.color || data.AE); 
      updateCell(sheet, row, "AF", data.givenForFitDate || data.AF); 
      updateCell(sheet, row, "AG", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AG); 
      updateCell(sheet, row, "AH", data.receivedDate || data.received_date || data.AH);
      updateCell(sheet, row, "AI", data.beforeWash || data.before_wash || data.AI);
      updateCell(sheet, row, "AJ", data.afterWash || data.after_wash || data.AJ);
      updateCell(sheet, row, "AK", data.fabricComments || data.fabricTrims || data.fabric_trims || data.AK);
      updateCell(sheet, row, "AL", data.feedback || data.comments || data.AL);
    }
    else if (round === "5") {
      updateCell(sheet, row, "AM", data.color || data.AM); 
      updateCell(sheet, row, "AN", data.givenForFitDate || data.AN); 
      updateCell(sheet, row, "AO", data.commentsDate || data.commentsReceivedDate || data.comments_received_date || data.AO); 
      updateCell(sheet, row, "AP", data.receivedDate || data.received_date || data.AP);
      updateCell(sheet, row, "AQ", data.beforeWash || data.before_wash || data.AQ);
      updateCell(sheet, row, "AR", data.afterWash || data.after_wash || data.AR);
      updateCell(sheet, row, "AS", data.fabricComments || data.fabricTrims || data.AS);
      updateCell(sheet, row, "AT", data.feedback || data.comments || data.AT);
    }
    
    // 8. Handle Sample Garment Photo (Columns BI, BK, BM, BO, BQ)
    if (data.samplePhoto || data.samplePhotoUrl || data.sample_photo) {
      try {
        handleSamplePhotoAttachment(data, sheet, row);
      } catch (sampleErr) {
        Logger.log("Sample photo handle error: " + sampleErr.message);
      }
    }

    // 8b. Handle Model Feedback Fit Photos / Attachments (Columns BJ, BL, BN, BP, BR)
    if (data.attachments || data.collageAttachment || data.allImages || data.images || data.attachment || data.photos) {
      try {
        handleAttachments(data, sheet, row);
      } catch (photoErr) {
        Logger.log("Attachment photo handle error: " + photoErr.message);
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
    // 10. Always release the lock
    lock.releaseLock();
  }
}

// Uploads sample garment photo to Google Drive and embeds into Columns BI, BK, BM, BO, BQ
function handleSamplePhotoAttachment(data, sheet, rowIndex) {
  if (!data || !sheet || !rowIndex) return;

  var round = String(data.round || "1");
  var sampleColMap = { "1": "BI", "2": "BK", "3": "BM", "4": "BO", "5": "BQ" };
  var targetCol = data.samplePhotoColumn || sampleColMap[round] || "BI";
  var colIdx = colNameToIndex(targetCol);
  if (colIdx <= 0) return;

  if (sheet.getMaxColumns() < colIdx) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), colIdx - sheet.getMaxColumns());
  }

  var cell = sheet.getRange(rowIndex, colIdx);

  if (data.samplePhotoUrl && (!data.samplePhoto || !data.samplePhoto.data)) {
    cell.setFormula('=HYPERLINK("' + data.samplePhotoUrl + '", IMAGE("' + data.samplePhotoUrl + '", 1))');
    sheet.setRowHeight(rowIndex, 85);
    sheet.setColumnWidth(colIdx, 115);
    cell.setHorizontalAlignment("center").setVerticalAlignment("middle");
    cell.setNote("📸 Sample Garment Photo (Round " + round + "):\\n" + data.samplePhotoUrl);
    return;
  }

  if (!data.samplePhoto) return;
  var att = data.samplePhoto;
  var rawData = att.data || att.dataUrl || att.base64;
  if (!rawData && data.samplePhotoUrl) {
    cell.setFormula('=HYPERLINK("' + data.samplePhotoUrl + '", IMAGE("' + data.samplePhotoUrl + '", 1))');
    sheet.setRowHeight(rowIndex, 85);
    sheet.setColumnWidth(colIdx, 115);
    cell.setHorizontalAlignment("center").setVerticalAlignment("middle");
    return;
  }
  if (!rawData) return;
  if (rawData.indexOf(",") > -1) rawData = rawData.split(",")[1];

  try {
    var folder = getOrCreatePhotoFolder(data.folderId);
    var cleanStyle = String(data.styleNo || data.D || "Sample").replace(/[^a-zA-Z0-9_-]/g, "_");
    var subFolderName = cleanStyle + "_Samples";
    var targetFolder = folder;

    try {
      var subIter = folder.getFoldersByName(subFolderName);
      if (subIter.hasNext()) {
        targetFolder = subIter.next();
      } else {
        targetFolder = folder.createFolder(subFolderName);
        try { targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
      }
    } catch (errSub) {
      targetFolder = folder;
    }

    var bytes = Utilities.base64Decode(rawData);
    var isPng = (att.type && att.type.indexOf("png") > -1);
    var ext = isPng ? ".png" : ".jpg";
    var mime = isPng ? "image/png" : "image/jpeg";
    var fName = cleanStyle + "_R" + round + "_Sample" + ext;
    var blob = Utilities.newBlob(bytes, mime, fName);
    var file = targetFolder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}

    var fileId = file.getId();
    var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    var directZoomLink = "https://lh3.googleusercontent.com/d/" + fileId + "=s0";

    var scriptUrl = "";
    try { scriptUrl = ScriptApp.getService().getUrl(); } catch (e) {}

    var zoomDestinationUrl = "";
    if (data.appUrl && data.appUrl.indexOf("http") === 0) {
      zoomDestinationUrl = data.appUrl + "/?mode=zoom&fileId=" + fileId + "&url=" + encodeURIComponent(directZoomLink) + "&style=" + encodeURIComponent(cleanStyle) + "&round=" + round + "&subId=" + encodeURIComponent(data.assignmentId || "");
    } else if (scriptUrl && scriptUrl.indexOf("http") === 0) {
      zoomDestinationUrl = scriptUrl + "?zoom=" + fileId + "&folder=" + targetFolder.getId() + "&style=" + encodeURIComponent(cleanStyle) + "&round=" + round;
    } else {
      zoomDestinationUrl = directZoomLink;
    }

    cell.setFormula('=HYPERLINK("' + zoomDestinationUrl + '", IMAGE("' + directUrl + '", 1))');
    sheet.setRowHeight(rowIndex, 85);
    sheet.setColumnWidth(colIdx, 115);
    cell.setHorizontalAlignment("center").setVerticalAlignment("middle");

    var note = "📸 Sample Garment Photo (Round " + round + "):\\n";
    note += "👉 CLICK CELL LINK to Zoom Sample Photo in Full HD!\\n";
    note += "• File: " + directZoomLink + "\\n";
    note += "• Folder: https://drive.google.com/drive/folders/" + targetFolder.getId();
    cell.setNote(note);

    if (!data.samplePhotoUrl) {
      data.samplePhotoUrl = directUrl;
    }
  } catch (sampleErr) {
    Logger.log("Error in handleSamplePhotoAttachment: " + sampleErr.message);
  }
}

// Uploads photos to Google Drive and embeds snapshot directly into the cell (Columns BJ, BL, BN, BP, BR)
function handleAttachments(data, sheet, rowIndex) {
  if (!data || !sheet || !rowIndex) return;

  var round = String(data.round || "1");
  var colMap = { "1": "BJ", "2": "BL", "3": "BN", "4": "BP", "5": "BR" };
  var targetCol = data.attachmentColumn || colMap[round] || "BJ";
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
      primaryViewUrl = "https://lh3.googleusercontent.com/d/" + cFileId + "=s0";
    } catch (cErr) {
      Logger.log("Collage creation error: " + cErr.message);
    }
  }

  // 4. Upload Individual Photos (1 to 10 photos)
  var list = [];
  if (data.allImages && data.allImages.length > 0) list = data.allImages;
  else if (data.attachments && data.attachments.length > 0) list = data.attachments;
  else if (data.images && data.images.length > 0) list = data.images;

  var photoFileIds = [];

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
      photoFileIds.push(fileId);
      var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
      var directZoomLink = "https://lh3.googleusercontent.com/d/" + fileId + "=s0";
      photoViewLinks.push({ id: fileId, zoomUrl: directZoomLink, name: fName });

      if (!imageToEmbedUrl) {
        imageToEmbedUrl = directUrl;
        primaryViewUrl = directZoomLink;
      }
    } catch (attErr) {
      Logger.log("File " + i + " upload error: " + attErr.message);
    }
  }

  // 5. Embed Image Formula in Target Cell with Direct Click to Zoom (NO Google Drive Folder!)
  var cell = sheet.getRange(rowIndex, colIdx);
  if (imageToEmbedUrl) {
    try {
      var scriptUrl = "";
      try {
        scriptUrl = ScriptApp.getService().getUrl();
      } catch (e) {}

      var primaryId = cFileId || (photoFileIds.length > 0 ? photoFileIds[0] : "");
      var directCdnZoomUrl = "https://lh3.googleusercontent.com/d/" + primaryId + "=s0";
      
      // If Web App is published, open interactive Zoom Lightbox with 1-10 photos gallery
      // Otherwise fallback to direct high-res CDN zoom with native browser magnifier
      var zoomDestinationUrl = (scriptUrl && scriptUrl.indexOf("http") === 0)
        ? (scriptUrl + "?zoom=" + primaryId + "&folder=" + targetFolder.getId() + "&style=" + encodeURIComponent(cleanStyle) + "&round=" + round)
        : directCdnZoomUrl;

      // Formula: =HYPERLINK("zoom_url", IMAGE("lh3_link", 1))
      cell.setFormula('=HYPERLINK("' + zoomDestinationUrl + '", IMAGE("' + imageToEmbedUrl + '", 1))');
      
      // Formatting for clean visibility
      sheet.setRowHeight(rowIndex, 85);
      sheet.setColumnWidth(colIdx, 115);
      cell.setHorizontalAlignment("center").setVerticalAlignment("middle");

      // Cell Note with direct links to every single photo in full HD zoom
      var totalPhotos = photoViewLinks.length || (data.attachmentsCount || 1);
      var note = "📸 Fit Photos (" + totalPhotos + " Photos Attached):\\n";
      note += "👉 CLICK CELL TO ZOOM PHOTO DIRECTLY!\\n\\n";
      for (var k = 0; k < photoViewLinks.length; k++) {
        note += "• Photo " + (k + 1) + " (Zoom): " + photoViewLinks[k].zoomUrl + "\\n";
      }
      note += "\\n• Interactive Gallery: " + zoomDestinationUrl;
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
      "R1 Color", "R1 Fit Date", "R1 Received", "R1 Comments Date", "R1 Before Wash", "R1 After Wash", "R1 Fabric/Trims", "R1 Feedback",
      "R2 Color", "R2 Fit Date", "R2 Received", "R2 Comments Date", "R2 Before Wash", "R2 After Wash", "R2 Fabric/Trims", "R2 Feedback",
      "R3 Color", "R3 Fit Date", "R3 Received", "R3 Comments Date", "R3 Before Wash", "R3 After Wash", "R3 Fabric/Trims", "R3 Feedback",
      "R4 Color", "R4 Fit Date", "R4 Received", "R4 Comments Date", "R4 Before Wash", "R4 After Wash", "R4 Fabric/Trims", "R4 Feedback",
      "R5 Color", "R5 Fit Date", "R5 Received", "R5 Comments Date", "R5 Before Wash", "R5 After Wash", "R5 Fabric/Trims", "R5 Feedback"
    ];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#f3f4f6").setFontWeight("bold");
  }

  // Ensure headers for photo columns BI to BR exist (BI to BR = 61 to 70) and AX (50)
  try {
    if (sheet.getMaxColumns() < 72) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 72 - sheet.getMaxColumns());
    }

    var axHeader = sheet.getRange(1, 50).getValue();
    if (!axHeader) {
      sheet.getRange(1, 50).setValue("Assignment ID (Internal)").setBackground("#e2e8f0").setFontWeight("bold");
    }

    var photoHeaders = {
      "BI": "R1 Sample Photo",
      "BJ": "R1 Fit Photos",
      "BK": "R2 Sample Photo",
      "BL": "R2 Fit Photos",
      "BM": "R3 Sample Photo",
      "BN": "R3 Fit Photos",
      "BO": "R4 Sample Photo",
      "BP": "R4 Fit Photos",
      "BQ": "R5 Sample Photo",
      "BR": "R5 Fit Photos"
    };
    for (var colKey in photoHeaders) {
      var cIdx = colNameToIndex(colKey);
      var currentVal = sheet.getRange(1, cIdx).getValue();
      if (!currentVal) {
        var isSample = (colKey === "BI" || colKey === "BK" || colKey === "BM" || colKey === "BO" || colKey === "BQ");
        sheet.getRange(1, cIdx).setValue(photoHeaders[colKey]).setBackground(isSample ? "#dbeafe" : "#e0e7ff").setFontWeight("bold");
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
  var colMap = {
    "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8, "I": 9, "J": 10,
    "K": 11, "L": 12, "M": 13, "N": 14, "O": 15, "P": 16, "Q": 17, "R": 18, "S": 19, "T": 20,
    "U": 21, "V": 22, "W": 23, "X": 24, "Y": 25, "Z": 26, "AA": 27, "AB": 28, "AC": 29, "AD": 30,
    "AE": 31, "AF": 32, "AG": 33, "AH": 34, "AI": 35, "AJ": 36, "AK": 37, "AL": 38, "AM": 39, "AN": 40,
    "AO": 41, "AP": 42, "AQ": 43, "AR": 44, "AS": 45, "AT": 46, "AX": 50,
    "BI": 61, "BJ": 62, "BK": 63, "BL": 64, "BM": 65, "BN": 66, "BO": 67, "BP": 68, "BQ": 69, "BR": 70
  };
  var colIndex = colMap[colName.toUpperCase()];
  if (!colIndex) {
    colIndex = colNameToIndex(colName);
  }
  if (colIndex > 0) {
    if (sheet.getMaxColumns() < colIndex) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colIndex - sheet.getMaxColumns());
    }
    sheet.getRange(row, colIndex).setValue(value);
  }
}

function sendMail(data) {
  var recipient = data.modelEmail || data.senderEmail || data.email;
  if (!recipient || (!data.link && !data.responseUrl)) return ContentService.createTextOutput("Email missing recipient or link").setMimeType(ContentService.MimeType.TEXT);
  
  var link = data.link || data.responseUrl;
  var round = String(data.round || "1");
  var styleNo = String(data.styleNo || data.style_number || data.D || "Garment").trim();
  var modelName = data.modelName || data.model_name || data.B || "Model";
  var sampleType = data.sampleType || data.typeOfSample || data.type_of_sample || data.C || "Garment Sample";
  var size = data.size || data.F || "-";
  var color = data.color || data.G || data.O || data.W || data.AE || data.AM || "-";
  var description = data.description || data.Instructions || data.E || "";
  var givenDate = data.givenForFitDate || data.H || data.P || data.X || data.AF || data.AN || "";
  var samplePhotoUrl = data.samplePhotoUrl || data.sample_photo_url || "";

  var isUpdate = data.type === 'UPDATE_SUBMISSION' || data.isUpdate;
  var subject = isUpdate
    ? ("Updated Details: Fit Review for Style " + styleNo + " (Round " + round + ")")
    : ("Action Required: Fit Review for Style " + styleNo + " (Round " + round + ")");
  
  // HTML Product Specification Block
  var specsHtml = 
    "<div style='background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 20px 0;'>" +
      "<h3 style='margin: 0 0 12px 0; font-size: 15px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;'>📋 Garment Specification Details" + (isUpdate ? " <span style=\"color: #f59e0b; font-size: 11px;\">(UPDATED)</span>" : "") + "</h3>" +
      "<table style='width: 100%; font-size: 14px; border-collapse: collapse; line-height: 1.6;'>" +
        "<tr><td style='width: 35%; color: #64748b; padding: 5px 0;'><strong>Style No:</strong></td><td style='color: #0f172a; font-weight: bold; font-size: 15px;'>" + styleNo + "</td></tr>" +
        "<tr><td style='color: #64748b; padding: 5px 0;'><strong>Product Type:</strong></td><td style='color: #0f172a; font-weight: 600;'>" + sampleType + "</td></tr>" +
        "<tr><td style='color: #64748b; padding: 5px 0;'><strong>Assigned Size:</strong></td><td style='color: #0f172a; font-weight: bold;'>" + size + "</td></tr>" +
        "<tr><td style='color: #64748b; padding: 5px 0;'><strong>Assigned Color:</strong></td><td style='color: #0f172a;'>" + color + "</td></tr>" +
        (givenDate ? "<tr><td style='color: #64748b; padding: 5px 0;'><strong>Given for Fit:</strong></td><td style='color: #0f172a;'>" + givenDate + "</td></tr>" : "") +
        (description ? "<tr><td style='color: #64748b; padding: 5px 0; vertical-align: top;'><strong>Instructions:</strong></td><td style='color: #334155; font-style: italic;'>" + description + "</td></tr>" : "") +
      "</table>" +
    "</div>";

  // HTML Sample Photo Banner (If photo exists)
  var photoHtml = "";
  if (samplePhotoUrl && samplePhotoUrl.indexOf("http") === 0) {
    photoHtml = 
      "<div style='text-align: center; margin: 22px 0; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px;'>" +
        "<div style='margin-bottom: 8px;'><span style='background-color: #4f46e5; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; text-transform: uppercase;'>📸 Sample Garment Photo</span></div>" +
        "<a href='" + samplePhotoUrl + "' target='_blank' style='display: inline-block; text-decoration: none;'>" +
          "<img src='" + samplePhotoUrl + "' alt='Sample Photo for Style " + styleNo + "' style='max-height: 320px; max-width: 100%; border-radius: 8px; object-fit: contain; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;' />" +
        "</a>" +
        "<p style='margin: 8px 0 0; font-size: 11px; color: #64748b;'>(Click image to view in Full HD resolution)</p>" +
      "</div>";
  }

  var htmlBody = 
    "<div style='font-family: Arial, Helvetica, sans-serif; max-width: 620px; margin: auto; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);'>" +
      "<div style='background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%); padding: 28px 24px; text-align: center; color: white;'>" +
        "<h1 style='margin: 0; font-size: 22px; font-weight: bold; letter-spacing: -0.5px;'>" + (isUpdate ? "Fit Details Updated" : "Fit Feedback Required") + "</h1>" +
        "<p style='margin: 8px 0 0; font-size: 14px; opacity: 0.95;'>Round " + round + " Sample Assessment • Style " + styleNo + "</p>" +
      "</div>" +
      "<div style='padding: 26px 24px;'>" +
        "<p style='font-size: 15px; color: #1e293b; margin-top: 0;'>Hello <strong>" + modelName + "</strong>,</p>" +
        "<p style='font-size: 14px; color: #475569; line-height: 1.5;'>" +
          (isUpdate
            ? "The specifications (color, size, instructions, or sample photo) for this garment have been updated by the designer. Please review the updated details below and use the same feedback link to submit your evaluation."
            : "A new sample garment has been assigned for your fit evaluation. Please inspect the product photo and specifications below, test the garment fit, and submit your feedback.") +
        "</p>" +
        photoHtml +
        specsHtml +
        "<div style='text-align: center; margin: 32px 0 20px;'>" +
          "<a href='" + link + "' style='background-color: #4f46e5; color: #ffffff; padding: 15px 34px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.35); text-align: center;'>" +
            "👉 Open Mobile Feedback Form" +
          "</a>" +
        "</div>" +
        "<div style='background-color: #eff6ff; border-radius: 8px; padding: 12px; margin-bottom: 24px; border: 1px solid #bfdbfe;'>" +
          "<p style='margin: 0; font-size: 12px; color: #1e40af; line-height: 1.5; text-align: center;'>" +
            "📱 <strong>Mobile Friendly:</strong> Tap the button above on your smartphone (Android or iPhone) to open the form directly. You can take fit pictures directly with your phone camera or select from gallery!" +
          "</p>" +
        "</div>" +
        "<hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;'>" +
        "<p style='color: #64748b; font-size: 12px; margin-bottom: 4px;'>Or copy and paste this link in your browser:</p>" +
        "<p style='color: #4f46e5; font-size: 12px; word-break: break-all; margin: 0;'>" + link + "</p>" +
      "</div>" +
      "<div style='background-color: #f8fafc; padding: 14px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;'>" +
        "SOIE Fit Management System • Automated Notification" +
      "</div>" +
    "</div>";

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: htmlBody,
    replyTo: data.senderEmail,
    name: (data.senderName || "SOIE Fit Comments")
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
}

// =========================================================================================
// DUAL MENU INITIALIZATION (Model Reminders ✉️ + 📸 Fit Photos)
// Creates BOTH custom menus on Google Sheet open
// =========================================================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  // Menu 1: Model Reminders Automator (Multi-Round Edition)
  try {
    ui.createMenu('Model Reminders ✉️')
      .addItem('🚀 Send 1st Round Reminders', 'sendFirstRoundReminders')
      .addItem('🚀 Send 2nd Round Reminders', 'sendSecondRoundReminders')
      .addItem('🚀 Send 3rd Round Reminders', 'sendThirdRoundReminders')
      .addItem('🚀 Send 4th Round Reminders', 'sendFourthRoundReminders')
      .addItem('🚀 Send 5th Round Reminders', 'sendFifthRoundReminders')
      .addSeparator()
      .addItem('📑 Setup / Create All 30 Category Tabs', 'createAllSeriesSheetTabs')
      .addItem('ℹ️ Show Sheets Columns Layout Guide', 'showHelpLayoutGuide')
      .addToUi();
  } catch (e1) {
    Logger.log('Could not load Model Reminders menu: ' + e1);
  }

  // Menu 2: Fit Photos Zoom & Inspection Tools
  try {
    ui.createMenu("📸 Fit Photos")
      .addItem("🔍 Zoom Selected Photo (In-Sheet Dialog)", "showPhotoZoomDialog")
      .addItem("🖼️ Open Live Photo Zoom Sidebar", "showPhotoZoomSidebar")
      .addSeparator()
      .addItem("🌐 Open Web Zoom Viewer (New Tab)", "openPhotoZoomInNewTab")
      .addItem("⚡ Format Photo Columns (BI to BR)", "formatPhotoColumns")
      .addItem("📑 Setup / Create All 30 Category Tabs", "createAllSeriesSheetTabs")
      .addItem("ℹ️ How to Use Photo Zoom", "showPhotoHelpDialog")
      .addToUi();
  } catch (e2) {
    Logger.log("Could not load Fit Photos menu: " + e2);
  }
}

// Automatically creates/initializes all 30 Category & Series tabs in Google Sheets
function createAllSeriesSheetTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = [
    "Shapewear",
    "Panty",
    "Bra",
    "Panty Packs",
    "SC Series",
    "CS Series",
    "SHW Series",
    "CB & CP-101 Series",
    "CB & CP-201 Series",
    "CB & CP-301 Series",
    "CB & CP-401 Series",
    "CB & CP-501 Series",
    "CB & CP-601 Series",
    "CB & CP-701 Series",
    "CB & CP-801 Series",
    "CB & CP-901 Series",
    "FB & FP-501 Series",
    "FB & FP-601 Series",
    "FB & FP-701 Series",
    "FB & FP-801 Series",
    "CB-901 Series",
    "CP-1101 Series",
    "CP-1201 Series",
    "CP-1301 Series",
    "CP-1401 Series",
    "CP-1501 Series",
    "FP-1601 Series",
    "FP-1701 Series",
    "FP-1801 Series",
    "CP-1901 Series",
    "General"
  ];

  var createdCount = 0;
  for (var i = 0; i < tabs.length; i++) {
    var sheet = getSheetWithHeaders(ss, tabs[i]);
    if (sheet) createdCount++;
  }

  SpreadsheetApp.getUi().alert(
    "✅ All 30 Category & Series Tabs Ready!",
    "Verified/created all " + tabs.length + " tabs in this spreadsheet with complete headers and photo columns (BI to BR).\\n\\nTabs:\\n" + tabs.join(", "),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// URL & ID Extraction Helpers (100% immune to regex escape bugs)
function extractFileId(str) {
  if (!str) return "";
  var s = String(str);
  var part = "";
  var idx = s.indexOf("lh3.googleusercontent.com/d/");
  if (idx !== -1) {
    part = s.substring(idx + 28);
  } else {
    var zIdx = s.indexOf("zoom=");
    if (zIdx !== -1) {
      part = s.substring(zIdx + 5);
    } else {
      var fIdx = s.indexOf("/file/d/");
      if (fIdx !== -1) {
        part = s.substring(fIdx + 8);
      }
    }
  }
  if (!part) return "";
  for (var i = 0; i < part.length; i++) {
    var c = part.charAt(i);
    var isAlpha = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    var isNum = (c >= '0' && c <= '9');
    var isSpecial = (c === '_' || c === '-');
    if (!isAlpha && !isNum && !isSpecial) {
      return part.substring(0, i);
    }
  }
  return part;
}

function extractFolderId(str) {
  if (!str) return "";
  var s = String(str);
  var part = "";
  var fIdx = s.indexOf("folder=");
  if (fIdx !== -1) {
    part = s.substring(fIdx + 7);
  } else {
    var foldIdx = s.indexOf("/folders/");
    if (foldIdx !== -1) {
      part = s.substring(foldIdx + 9);
    }
  }
  if (!part) return "";
  for (var i = 0; i < part.length; i++) {
    var c = part.charAt(i);
    var isAlpha = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    var isNum = (c >= '0' && c <= '9');
    var isSpecial = (c === '_' || c === '-');
    if (!isAlpha && !isNum && !isSpecial) {
      return part.substring(0, i);
    }
  }
  return part;
}

function extractHyperlinkUrl(str) {
  if (!str) return "";
  var s = String(str);
  var start = s.indexOf('=HYPERLINK("');
  if (start !== -1) {
    var sub = s.substring(start + 12);
    var end = sub.indexOf('"');
    if (end !== -1) return sub.substring(0, end);
  }
  var httpIdx = s.indexOf("http://");
  if (httpIdx === -1) httpIdx = s.indexOf("https://");
  if (httpIdx !== -1) {
    var urlPart = s.substring(httpIdx);
    for (var i = 0; i < urlPart.length; i++) {
      var ch = urlPart.charAt(i);
      if (ch === '"' || ch === ')' || ch === ',' || ch === ' ' || ch === '\t' || ch === '\n') {
        return urlPart.substring(0, i);
      }
    }
    return urlPart;
  }
  return "";
}

// 1. Opens an interactive full-screen popup dialog right inside Google Sheets (No new tab!)
function showPhotoZoomDialog() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  
  var fileId = extractFileId(formula) || extractFileId(note);
  var folderId = extractFolderId(formula) || extractFolderId(note);
  
  if (!fileId && !folderId) {
    SpreadsheetApp.getUi().alert("No fit photo found in this cell.\\n\\nPlease select a cell in Columns BI, BJ, BK, BL, or BM that contains a photo thumbnail.");
    return;
  }
  
  var photos = [];
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      var files = folder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var fId = f.getId();
        var fName = f.getName();
        if (f.getMimeType().indexOf("image") > -1) {
          photos.push({
            id: fId,
            name: fName,
            url: "https://lh3.googleusercontent.com/d/" + fId + "=s0",
            thumb: "https://lh3.googleusercontent.com/d/" + fId + "=s200",
            isGrid: fName.indexOf("Grid") > -1
          });
        }
      }
    } catch (e) {}
  }
  
  if (photos.length === 0 && fileId) {
    photos.push({
      id: fileId,
      name: "Fit Photo",
      url: "https://lh3.googleusercontent.com/d/" + fileId + "=s0",
      thumb: "https://lh3.googleusercontent.com/d/" + fileId + "=s200",
      isGrid: false
    });
  }
  
  var html = buildZoomViewerHtml(photos, "Fit Photo Zoom", "", fileId);
  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(950)
    .setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, "📸 Fit Photo Zoom Viewer");
}

function openPhotoZoomInNewTab() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  
  var url = extractHyperlinkUrl(formula) || extractHyperlinkUrl(note);
               
  if (url) {
    var html = "<script>window.open('" + url + "', '_blank'); google.script.host.close();<" + "/script>" +
               "<div style='font-family:sans-serif;padding:20px;text-align:center;'>Opening Photo Zoom Viewer...</div>";
    var htmlOutput = HtmlService.createHtmlOutput(html).setWidth(300).setHeight(100);
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, "Opening Zoom...");
  } else {
    SpreadsheetApp.getUi().alert("Please select a photo cell in Columns BI-BM.");
  }
}

// Opens Persistent Photo Inspector Sidebar in Google Sheets
function showPhotoZoomSidebar() {
  var html = buildSidebarHtml();
  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setTitle("📸 Photo Inspector");
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

// Helper called by sidebar via google.script.run to fetch active cell photo
function getActiveCellPhotoData() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  var row = cell.getRow();
  var col = cell.getColumn();
  var colLetter = cell.getA1Notation().replace(/[0-9]/g, '');

  var fileId = extractFileId(formula) || extractFileId(note);
  var folderId = extractFolderId(formula) || extractFolderId(note);

  // If active cell is not in photo columns, check if this row has photo in BI-BM
  if (!fileId && !folderId) {
    var checkCols = ["BI", "BJ", "BK", "BL", "BM"];
    for (var c = 0; c < checkCols.length; c++) {
      var checkCell = sheet.getRange(row, colNameToIndex(checkCols[c]));
      var cF = checkCell.getFormula() || "";
      var cN = checkCell.getNote() || "";
      fileId = extractFileId(cF) || extractFileId(cN);
      folderId = extractFolderId(cF) || extractFolderId(cN);
      if (fileId || folderId) {
        colLetter = checkCols[c];
        break;
      }
    }
  }

  if (!fileId && !folderId) {
    return { hasPhoto: false, message: "Select a photo cell in Columns BI-BM" };
  }

  var photos = getPhotosFromFolderOrId(folderId, fileId);
  var style = sheet.getRange(row, 4).getValue() || "Sample";
  var model = sheet.getRange(row, 2).getValue() || "";

  return {
    hasPhoto: true,
    cell: colLetter + row,
    style: style,
    model: model,
    photos: photos,
    activeFileId: fileId
  };
}

// Formats photo columns BI-BR nicely
function formatPhotoColumns() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var photoCols = ["BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP", "BQ", "BR"];
  for (var i = 0; i < photoCols.length; i++) {
    var colIdx = colNameToIndex(photoCols[i]);
    if (colIdx > 0 && colIdx <= sheet.getMaxColumns()) {
      sheet.setColumnWidth(colIdx, 115);
      var range = sheet.getRange(2, colIdx, Math.max(sheet.getLastRow() - 1, 1), 1);
      range.setHorizontalAlignment("center").setVerticalAlignment("middle");
    }
  }
  SpreadsheetApp.getUi().alert("Photo columns BI to BR (Sample & Fit Photos) have been formatted (115px width, centered alignment).");
}

function showPhotoHelpDialog() {
  var msg = "📸 HOW TO ZOOM PHOTOS IN GOOGLE SHEETS:\\n\\n" +
    "1. DIRECT CLICK ZOOM:\\n" +
    "   Click on any thumbnail cell in Columns BI to BR (BI, BJ, BK, BL, BM, BN, BO, BP, BQ, BR).\\n" +
    "   Click the blue link preview that pops up to open the Full HD Zoom Viewer!\\n\\n" +
    "2. IN-SHEET POPUP DIALOG:\\n" +
    "   Select any photo cell and click:\\n" +
    "   Menu '📸 Fit Photos' -> '🔍 Zoom Selected Photo'\\n\\n" +
    "3. SIDEBAR INSPECTOR:\\n" +
    "   Click Menu '📸 Fit Photos' -> '🖼️ Open Photo Zoom Sidebar' to inspect photos side-by-side!\\n\\n" +
    "Photo Columns Mapping:\\n" +
    "• Round 1: Sample = Col BI, Fit = Col BJ\\n" +
    "• Round 2: Sample = Col BK, Fit = Col BL\\n" +
    "• Round 3: Sample = Col BM, Fit = Col BN\\n" +
    "• Round 4: Sample = Col BO, Fit = Col BP\\n" +
    "• Round 5: Sample = Col BQ, Fit = Col BR\\n\\n" +
    "Controls inside Zoom Viewer:\\n" +
    "• Scroll Mouse Wheel = Zoom In / Out\\n" +
    "• Click & Drag = Pan across photo\\n" +
    "• Double Click = Toggle 2x Zoom\\n" +
    "• Rotate Button = Turn photo 90°\\n" +
    "• Arrows = Browse all attached photos";
  SpreadsheetApp.getUi().alert(msg);
}

function buildSidebarHtml() {
  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8">' +
    '<style>' +
    '* { box-sizing: border-box; margin: 0; padding: 0; }' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 12px; }' +
    '.card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 12px; }' +
    '.title { font-size: 13px; font-weight: 600; color: #a5b4fc; }' +
    '.subtitle { font-size: 11px; color: #94a3b8; margin-top: 2px; }' +
    '.badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; background: #064e3b; color: #6ee7b7; padding: 2px 8px; border-radius: 9999px; font-weight: 600; margin-top: 4px; }' +
    '.img-box { width: 100%; height: 280px; background: #090d16; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative; margin: 10px 0; border: 1px solid #334155; cursor: grab; user-select: none; }' +
    '.img-box:active { cursor: grabbing; }' +
    '#side-img { max-width: 100%; max-height: 100%; object-fit: contain; transition: transform 0.1s ease-out; transform-origin: center center; }' +
    '.controls { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }' +
    'button { background: #334155; color: #f8fafc; border: 1px solid #475569; padding: 6px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; }' +
    'button:hover { background: #475569; }' +
    'button.primary { background: #4f46e5; border-color: #6366f1; grid-column: span 4; padding: 8px; font-size: 12px; margin-top: 4px; }' +
    'button.primary:hover { background: #4338ca; }' +
    '#status-msg { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 8px; }' +
    '.tips { background: #1e1b4b; border: 1px solid #3730a3; border-radius: 6px; padding: 8px; font-size: 10.5px; color: #c7d2fe; margin-top: 10px; line-height: 1.4; }' +
    '</style></head>' +
    '<body>' +
    '  <div class="card">' +
    '    <div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
    '      <div>' +
    '        <div class="title" id="info-title">📸 Live Photo Inspector</div>' +
    '        <div class="subtitle" id="info-sub">Cell click karte hi photo yahan dikhegi</div>' +
    '      </div>' +
    '      <div class="badge" id="live-badge">🟢 Live Click Sync</div>' +
    '    </div>' +
    '    <div class="img-box" id="box" onwheel="handleWheel(event)" onmousedown="handleMouseDown(event)">' +
    '      <img id="side-img" src="" alt="Fit Photo" style="display:none;" draggable="false">' +
    '      <div id="no-photo" style="font-size:11.5px; color:#64748b; text-align:center; padding:20px;">' +
    '        👆 Sheet me kisi bhi <strong>photo cell</strong> (BI-BM) par click karein.<br><br>Photo yahan automatic zoom ho jayegi!' +
    '      </div>' +
    '    </div>' +
    '    <div class="controls">' +
    '      <button onclick="sideZoom(-0.25)">🔍 -</button>' +
    '      <button onclick="sideZoom(0.25)">🔍 +</button>' +
    '      <button onclick="sideRotate()">⟳ 90°</button>' +
    '      <button onclick="sideReset()">⤢ Reset</button>' +
    '      <button class="primary" style="background:#0284c7; border-color:#38bdf8;" onclick="openDialogFromSide()">🔍 Fullscreen HD Zoom Modal</button>' +
    '    </div>' +
    '    <div id="status-msg">Watching active cell...</div>' +
    '  </div>' +
    '  <div class="tips">' +
    '    💡 <strong>Pro Tip:</strong> Is panel ko open rakhein. Ab sheet me aap <strong>kisi bhi row ki photo cell par click karenge</strong> toh photo turant bina kisi click ke zoom ho jayegi! Mouse wheel ghuma kar zoom karein.' +
    '  </div>' +
    '  <script>' +
    '    var scale = 1, rotation = 0, posX = 0, posY = 0;' +
    '    var isDragging = false, startX = 0, startY = 0;' +
    '    var currentCellKey = "";' +
    '    var isChecking = false;' +
    '    function updateImg() {' +
    '      var img = document.getElementById("side-img");' +
    '      img.style.transform = "translate(" + posX + "px, " + posY + "px) scale(" + scale + ") rotate(" + rotation + "deg)";' +
    '    }' +
    '    function sideZoom(d) { scale = Math.min(Math.max(scale + d, 0.4), 5); updateImg(); }' +
    '    function sideRotate() { rotation = (rotation + 90) % 360; updateImg(); }' +
    '    function sideReset() { scale = 1; rotation = 0; posX = 0; posY = 0; updateImg(); }' +
    '    function handleWheel(e) {' +
    '      e.preventDefault();' +
    '      var delta = e.deltaY < 0 ? 0.2 : -0.2;' +
    '      sideZoom(delta);' +
    '    }' +
    '    function handleMouseDown(e) {' +
    '      if (scale <= 1) return;' +
    '      isDragging = true;' +
    '      startX = e.clientX - posX;' +
    '      startY = e.clientY - posY;' +
    '      window.addEventListener("mousemove", handleMouseMove);' +
    '      window.addEventListener("mouseup", handleMouseUp);' +
    '    }' +
    '    function handleMouseMove(e) {' +
    '      if (!isDragging) return;' +
    '      posX = e.clientX - startX;' +
    '      posY = e.clientY - startY;' +
    '      updateImg();' +
    '    }' +
    '    function handleMouseUp() {' +
    '      isDragging = false;' +
    '      window.removeEventListener("mousemove", handleMouseMove);' +
    '      window.removeEventListener("mouseup", handleMouseUp);' +
    '    }' +
    '    function displayPhotoData(res) {' +
    '      if (res && res.hasPhoto && res.photos.length > 0) {' +
    '        var p = res.photos[0];' +
    '        var img = document.getElementById("side-img");' +
    '        img.src = p.url;' +
    '        img.style.display = "block";' +
    '        document.getElementById("no-photo").style.display = "none";' +
    '        document.getElementById("info-title").textContent = (res.style || "Fit Photo") + " (" + res.cell + ")";' +
    '        document.getElementById("info-sub").textContent = (res.model ? "Model: " + res.model : "") + " • " + res.photos.length + " photo(s)";' +
    '        document.getElementById("status-msg").textContent = "✓ Cell " + res.cell + " loaded (" + res.photos.length + " photos)";' +
    '        sideReset();' +
    '      } else {' +
    '        document.getElementById("status-msg").textContent = res.message || "Select a photo cell (Columns BI-BM)";' +
    '      }' +
    '    }' +
    '    function checkActiveCell() {' +
    '      if (isChecking) return;' +
    '      isChecking = true;' +
    '      google.script.run' +
    '        .withSuccessHandler(function(res) {' +
    '          isChecking = false;' +
    '          if (res && res.hasPhoto) {' +
    '            if (res.cell !== currentCellKey || (res.photos && res.photos[0] && res.photos[0].id !== currentCellKey)) {' +
    '              currentCellKey = res.cell || (res.photos && res.photos[0] && res.photos[0].id);' +
    '              displayPhotoData(res);' +
    '            }' +
    '          }' +
    '        })' +
    '        .withFailureHandler(function(err) {' +
    '          isChecking = false;' +
    '        })' +
    '        .getActiveCellPhotoData();' +
    '    }' +
    '    function openDialogFromSide() {' +
    '      google.script.run.showPhotoZoomDialog();' +
    '    }' +
    '    checkActiveCell();' +
    '    setInterval(checkActiveCell, 1200);' +
    '  <' + '/script>' +
    '</body></html>';
}

// 2. Web App Interactive Photo Zoom Lightbox Viewer
function renderPhotoZoomViewer(params) {
  var fileId = params.zoom || "";
  var folderId = params.folder || "";
  var style = params.style || "Fit Sample";
  var round = params.round || "1";
  
  var photos = [];
  
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      var files = folder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var fId = f.getId();
        var fName = f.getName();
        if (f.getMimeType().indexOf("image") > -1) {
          photos.push({
            id: fId,
            name: fName,
            url: "https://lh3.googleusercontent.com/d/" + fId + "=s0",
            thumb: "https://lh3.googleusercontent.com/d/" + fId + "=s200",
            isGrid: fName.indexOf("Grid") > -1
          });
        }
      }
    } catch (e) {
      Logger.log("Folder read error: " + e.message);
    }
  }
  
  if (photos.length === 0 && fileId) {
    photos.push({
      id: fileId,
      name: "Fit Photo",
      url: "https://lh3.googleusercontent.com/d/" + fileId + "=s0",
      thumb: "https://lh3.googleusercontent.com/d/" + fileId + "=s200",
      isGrid: false
    });
  }
  
  var html = buildZoomViewerHtml(photos, style, round, fileId);
  return HtmlService.createHtmlOutput(html)
    .setTitle("Fit Photo Zoom - " + style + " (R" + round + ")")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=5.0");
}

function buildZoomViewerHtml(photos, style, round, initialFileId) {
  var photosJson = JSON.stringify(photos);
  var html = '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">' +
    '<title>' + escapeHtml(style) + ' Photo Zoom</title>' +
    '<style>' +
    '* { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }' +
    'body { background: #090d16; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }' +
    'header { background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid #1e293b; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; z-index: 10; }' +
    '.title-group { display: flex; align-items: center; gap: 10px; }' +
    '.badge { background: #4f46e5; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }' +
    '.title { font-size: 14px; font-weight: 600; color: #f8fafc; }' +
    '.subtitle { font-size: 11px; color: #94a3b8; }' +
    '.controls { display: flex; align-items: center; gap: 6px; }' +
    '.btn { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s; }' +
    '.btn:hover { background: #334155; color: #fff; border-color: #475569; }' +
    '.btn:active { transform: scale(0.96); }' +
    '.btn-primary { background: #4338ca; border-color: #4f46e5; color: #fff; }' +
    '.btn-primary:hover { background: #4f46e5; }' +
    '.zoom-pct { font-size: 12px; font-variant-numeric: tabular-nums; color: #94a3b8; min-width: 44px; text-align: center; }' +
    '.stage-container { flex: 1; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #070a11; cursor: grab; }' +
    '.stage-container:active { cursor: grabbing; }' +
    '#viewer-img { max-width: 100%; max-height: 100%; transform-origin: center center; transition: transform 0.05s ease-out; box-shadow: 0 20px 50px rgba(0,0,0,0.8); pointer-events: none; border-radius: 4px; }' +
    '.hint-bar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1); padding: 4px 14px; border-radius: 20px; font-size: 11px; color: #94a3b8; pointer-events: none; z-index: 5; white-space: nowrap; }' +
    'footer { background: rgba(15, 23, 42, 0.95); border-top: 1px solid #1e293b; padding: 8px 16px; display: flex; align-items: center; gap: 10px; overflow-x: auto; z-index: 10; }' +
    '.thumb { width: 56px; height: 56px; border-radius: 6px; overflow: hidden; border: 2px solid transparent; cursor: pointer; flex-shrink: 0; opacity: 0.65; transition: all 0.15s; background: #1e293b; }' +
    '.thumb:hover { opacity: 0.9; border-color: #64748b; }' +
    '.thumb.active { opacity: 1; border-color: #6366f1; box-shadow: 0 0 10px rgba(99, 102, 241, 0.5); }' +
    '.thumb img { width: 100%; height: 100%; object-fit: cover; }' +
    '</style></head>' +
    '<body>' +
    '<header>' +
    '  <div class="title-group">' +
    '    <span class="badge">' + (round ? 'Round ' + escapeHtml(round) : 'Fit Photos') + '</span>' +
    '    <div>' +
    '      <div class="title">' + escapeHtml(style) + '</div>' +
    '      <div class="subtitle" id="photo-counter">Loading photo...</div>' +
    '    </div>' +
    '  </div>' +
    '  <div class="controls">' +
    '    <button class="btn" onclick="zoomDelta(-0.25)" title="Zoom Out">🔍 -</button>' +
    '    <span class="zoom-pct" id="zoom-level">100%</span>' +
    '    <button class="btn" onclick="zoomDelta(0.25)" title="Zoom In">🔍 +</button>' +
    '    <button class="btn" onclick="resetZoom()" title="Fit to Screen">⤢ Fit</button>' +
    '    <button class="btn" onclick="setActualSize()" title="100% Actual Resolution">1:1 HD</button>' +
    '    <button class="btn" onclick="rotateImage()" title="Rotate 90°">⟳ Rotate</button>' +
    '    <button class="btn btn-primary" onclick="openOriginal()" title="Open Original Image">↗ Full Res</button>' +
    '  </div>' +
    '</header>' +
    '<div class="stage-container" id="stage">' +
    '  <div class="hint-bar">💡 Scroll to Zoom • Drag to Pan • Double-Click to Zoom In/Out</div>' +
    '  <img id="viewer-img" src="" alt="Fit Photo">' +
    '</div>' +
    '<footer id="thumbs-bar"></footer>' +
    '<script>' +
    'var photos = ' + photosJson + ';' +
    'var currentIndex = 0;' +
    'var scale = 1;' +
    'var posX = 0;' +
    'var posY = 0;' +
    'var rotation = 0;' +
    'var isDragging = false;' +
    'var startX = 0;' +
    'var startY = 0;' +
    'var stage = document.getElementById("stage");' +
    'var img = document.getElementById("viewer-img");' +
    'var zoomText = document.getElementById("zoom-level");' +
    'var counter = document.getElementById("photo-counter");' +
    'var thumbsBar = document.getElementById("thumbs-bar");' +
    'function init() {' +
    '  if (!photos || photos.length === 0) return;' +
    '  for (var i = 0; i < photos.length; i++) {' +
    '    if (photos[i].id === "' + initialFileId + '") { currentIndex = i; break; }' +
    '  }' +
    '  renderThumbs();' +
    '  loadPhoto(currentIndex);' +
    '  setupEvents();' +
    '}' +
    'function renderThumbs() {' +
    '  thumbsBar.innerHTML = "";' +
    '  photos.forEach(function(p, idx) {' +
    '    var d = document.createElement("div");' +
    '    d.className = "thumb" + (idx === currentIndex ? " active" : "");' +
    '    d.title = p.isGrid ? "Composite Grid" : "Photo " + (idx + 1);' +
    '    d.onclick = function() { loadPhoto(idx); };' +
    '    var im = document.createElement("img");' +
    '    im.src = p.thumb || p.url;' +
    '    d.appendChild(im);' +
    '    thumbsBar.appendChild(d);' +
    '  });' +
    '}' +
    'function loadPhoto(idx) {' +
    '  currentIndex = idx;' +
    '  var p = photos[idx];' +
    '  img.src = p.url;' +
    '  resetZoom();' +
    '  counter.textContent = (p.isGrid ? "Grid Overview" : "Photo " + (idx + 1) + " of " + photos.length) + " • " + (p.name || "");' +
    '  var thumbs = document.querySelectorAll(".thumb");' +
    '  thumbs.forEach(function(t, i) { t.className = "thumb" + (i === idx ? " active" : ""); });' +
    '}' +
    'function updateTransform() {' +
    '  img.style.transform = "translate(" + posX + "px, " + posY + "px) scale(" + scale + ") rotate(" + rotation + "deg)";' +
    '  zoomText.textContent = Math.round(scale * 100) + "%";' +
    '}' +
    'function zoomDelta(d) {' +
    '  scale = Math.min(Math.max(scale + d, 0.2), 6);' +
    '  updateTransform();' +
    '}' +
    'function resetZoom() {' +
    '  scale = 1;' +
    '  posX = 0;' +
    '  posY = 0;' +
    '  rotation = 0;' +
    '  updateTransform();' +
    '}' +
    'function setActualSize() {' +
    '  scale = (scale === 2) ? 1 : 2;' +
    '  posX = 0;' +
    '  posY = 0;' +
    '  updateTransform();' +
    '}' +
    'function rotateImage() {' +
    '  rotation = (rotation + 90) % 360;' +
    '  updateTransform();' +
    '}' +
    'function openOriginal() {' +
    '  if (photos[currentIndex]) window.open(photos[currentIndex].url, "_blank");' +
    '}' +
    'function setupEvents() {' +
    '  stage.addEventListener("wheel", function(e) {' +
    '    e.preventDefault();' +
    '    var delta = e.deltaY < 0 ? 0.2 : -0.2;' +
    '    zoomDelta(delta);' +
    '  }, { passive: false });' +
    '  stage.addEventListener("mousedown", function(e) {' +
    '    if (e.button !== 0) return;' +
    '    isDragging = true;' +
    '    startX = e.clientX - posX;' +
    '    startY = e.clientY - posY;' +
    '  });' +
    '  window.addEventListener("mousemove", function(e) {' +
    '    if (!isDragging) return;' +
    '    posX = e.clientX - startX;' +
    '    posY = e.clientY - startY;' +
    '    updateTransform();' +
    '  });' +
    '  window.addEventListener("mouseup", function() { isDragging = false; });' +
    '  stage.addEventListener("dblclick", function(e) {' +
    '    e.preventDefault();' +
    '    if (scale > 1.2) resetZoom(); else { scale = 2.5; updateTransform(); }' +
    '  });' +
    '  var touchStartDist = 0;' +
    '  var touchStartScale = 1;' +
    '  stage.addEventListener("touchstart", function(e) {' +
    '    if (e.touches.length === 1) {' +
    '      isDragging = true;' +
    '      startX = e.touches[0].clientX - posX;' +
    '      startY = e.touches[0].clientY - posY;' +
    '    } else if (e.touches.length === 2) {' +
    '      isDragging = false;' +
    '      touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);' +
    '      touchStartScale = scale;' +
    '    }' +
    '  });' +
    '  stage.addEventListener("touchmove", function(e) {' +
    '    if (e.touches.length === 1 && isDragging) {' +
    '      posX = e.touches[0].clientX - startX;' +
    '      posY = e.touches[0].clientY - startY;' +
    '      updateTransform();' +
    '    } else if (e.touches.length === 2) {' +
    '      var dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);' +
    '      scale = Math.min(Math.max((dist / touchStartDist) * touchStartScale, 0.3), 5);' +
    '      updateTransform();' +
    '    }' +
    '  });' +
    '  stage.addEventListener("touchend", function() { isDragging = false; });' +
    '}' +
    'init();' +
    '<' + '/script></body></html>';
  return html;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// =========================================================================================
// MODEL REMINDER AUTOMATOR (MULTI-ROUND EDITION)
// Manages automated email reminders for Rounds 1, 2, 3, 4 & 5
// =========================================================================================

// --- GLOBAL WORKFLOW CONFIGURATION ---
var REMIND_CONFIG = {
  NAME_COL: 'B',           // Column B: Model Name
  EMAIL_COL: 'C',         // Column C: Recipient Email / Sample Type
  TRIGGER_DATE_COL: 'H',   // Column H: Sample given for Fit date (Trigger)

  // Custom registered Gmail alias (If blank, utilizes default logged-in sender address)
  SENDER_FROM: "designer02@soie.in",

  // Base parameters for emails
  FORM_LINK: "https://docs.google.com/forms/d/e/1FAIpQLSdf8e-CInVpx43y8G3k3mR98TzC5e61K_Z6o8S_yC8v2y263g/viewform",
  SUBJECT_TEMPLATE: "Pending Fit Management Form - 1st Round Reminder",

  // Fallback Registry mapping Model Names to their registered corporate email addresses
  MODEL_EMAILS: {
    "deepika": "designer02@soie.in",
    "garima": "garima.sethia@ginzalimited.com",
    "lalana": "lalana.shirsat@ginzalimited.com",
    "megha": "megha.sethia@ginzalimited.com",
    "pooja": "pooja.vaidya@ginzalimited.com",
    "sakshi": "crm.mumbai@ginzalimited.com",
    "sakshi dagwar": "crm.mumbai@ginzalimited.com",
    "sheetal": "merch2.apparel@ginzalimited.com"
  },

  // MULTI-ROUND ROUTING PARAMETERS
  ROUNDS: {
    1: {
      name: "1st Round",
      colorCol: "G",
      statusCol: "AZ",
      statusMark: "1st Round Sent"
    },
    2: {
      name: "2nd Round",
      colorCol: "O",
      statusCol: "BA",
      statusMark: "2nd Round Sent"
    },
    3: {
      name: "3rd Round",
      colorCol: "W",
      statusCol: "BB",
      statusMark: "3rd Round Sent"
    },
    4: {
      name: "4th Round",
      colorCol: "AE",
      statusCol: "BC",
      statusMark: "4th Round Sent"
    },
    5: {
      name: "5th Round",
      colorCol: "AM",
      statusCol: "BE",
      statusMark: "5th Round Sent"
    }
  }
};

// Menu Action Triggers wrapping core function
function sendFirstRoundReminders() { sendRoundReminders(1); }
function sendSecondRoundReminders() { sendRoundReminders(2); }
function sendThirdRoundReminders() { sendRoundReminders(3); }
function sendFourthRoundReminders() { sendRoundReminders(4); }
function sendFifthRoundReminders() { sendRoundReminders(5); }

/**
 * Translates character column index into 0-indexed integer
 */
function columnLetterToNum(letter) {
  if (!letter || typeof letter !== 'string') return -1;
  var temp = 0;
  var upper = letter.toUpperCase().trim();
  if (upper.length === 0) return -1;
  for (var i = 0; i < upper.length; i++) {
    var charCode = upper.charCodeAt(i);
    if (charCode < 65 || charCode > 90) return -1;
    temp = temp * 26 + (charCode - 64);
  }
  return temp - 1;
}

/**
 * Validates non empty values simply
 */
function isValuePresent(val) {
  if (val === null || val === undefined) return false;
  return String(val).trim().length > 0;
}

/**
 * Dispatches targeted customized email reminder notifications for selected round
 */
function sendRoundReminders(roundNum) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var range = sheet.getDataRange();
  var values = range.getValues();
  var ui = SpreadsheetApp.getUi();

  var roundConfig = REMIND_CONFIG.ROUNDS[roundNum];
  if (!roundConfig) {
    ui.alert('Error', 'Invalid Round number: ' + roundNum, ui.ButtonSet.OK);
    return;
  }

  if (values.length <= 1) {
    ui.alert('Notice: Sheet besides row headers contains no rows.');
    return;
  }

  // Prompt the user to enter a specific row number or "all" to send reminders
  var response = ui.prompt('Select Row for ' + roundConfig.name + ' Reminder', 
    'Please enter the SPECIFIC ROW NUMBER to process (e.g. 2, 3, etc.) or type "all" to check & run all matching eligible rows:', 
    ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) {
    ui.alert('Cancelled', 'Reminder process cancelled.', ui.ButtonSet.OK);
    return;
  }

  var rowInput = response.getResponseText().trim();
  if (!rowInput) {
    ui.alert('Input Error', 'Row input value is required. Please enter a valid row number or "all".', ui.ButtonSet.OK);
    return;
  }

  var targetRow = null;
  if (rowInput.toLowerCase() !== 'all') {
    targetRow = parseInt(rowInput, 10);
    if (isNaN(targetRow) || targetRow < 2 || targetRow > values.length) {
      ui.alert('Input Error', 'Invalid row number: "' + rowInput + '". Please enter a valid number from 2 to ' + values.length + ' or type "all".', ui.ButtonSet.OK);
      return;
    }
  }

  // Calculate 0-based column indices
  var nameIdx = columnLetterToNum(REMIND_CONFIG.NAME_COL);
  var emailIdx = columnLetterToNum(REMIND_CONFIG.EMAIL_COL);
  var dateIdx = columnLetterToNum(REMIND_CONFIG.TRIGGER_DATE_COL);

  var colorColLetter = roundConfig.colorCol;
  var statusColLetter = roundConfig.statusCol;

  var colorIdx = columnLetterToNum(colorColLetter);
  var markIdx = columnLetterToNum(statusColLetter);

  // Table value columns list to dynamically format inside email (Model name, Type of sample, Style, Description, Size, Specific Round Color)
  var tableColLetters = ['B', 'C', 'D', 'E', 'F', colorColLetter];
  var tableIndices = [];
  for (var i = 0; i < tableColLetters.length; i++) {
    var tIdx = columnLetterToNum(tableColLetters[i]);
    if (tIdx >= 0) {
      tableIndices.push(tIdx);
    }
  }

  var headers = values.length > 0 ? values[0] : [];

  // Dynamically expand sheet columns if any mapped column exceeds current sheet dimensions
  var maxCols = sheet.getMaxColumns();
  var neededCols = Math.max(nameIdx, emailIdx, dateIdx, markIdx, colorIdx, Math.max.apply(null, tableIndices)) + 1;
  if (neededCols > maxCols) {
    sheet.insertColumnsAfter(maxCols, neededCols - maxCols);
  }

  var sentCount = 0;
  var errorCount = 0;

  var startRowIdx = 1;
  var endRowIdx = values.length;
  if (targetRow !== null) {
    startRowIdx = targetRow - 1;
    endRowIdx = targetRow;
  }

  for (var r = startRowIdx; r < endRowIdx; r++) {
    var row = values[r];

    // Check Fit Date presence
    var hasActiveDate = (dateIdx >= 0 && dateIdx < row.length) ? isValuePresent(row[dateIdx]) : false;

    // Check if Status Tracking Cell is completely blank for this round
    var isTrackerBlank = (markIdx >= 0 && markIdx < row.length) ? !isValuePresent(row[markIdx]) : true;

    if (targetRow !== null) {
      if (!hasActiveDate) {
        ui.alert('Execution Stopped', 'Row ' + targetRow + ' cannot be processed because Column ' + REMIND_CONFIG.TRIGGER_DATE_COL + ' (Fit Date) is empty.', ui.ButtonSet.OK);
        return;
      }
      if (!isTrackerBlank) {
        var currentStatus = row[markIdx];
        ui.alert('Execution Stopped', 'Row ' + targetRow + ' has already been sent: Column ' + statusColLetter + ' is status "' + currentStatus + '".', ui.ButtonSet.OK);
        return;
      }
    }

    if (hasActiveDate && isTrackerBlank) {
      var modelName = (nameIdx >= 0 && nameIdx < row.length && row[nameIdx]) ? String(row[nameIdx]).trim() : "Model";
      
      // Append Ma'am for respect
      var suffix = (modelName.toLowerCase().indexOf("ma'am") === -1) ? " Ma'am" : "";
      var modelNameDecorated = modelName + suffix;

      var modelEmail = (emailIdx >= 0 && emailIdx < row.length && row[emailIdx]) ? String(row[emailIdx]).trim() : "";

      // Quick email verification
      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!modelEmail || !emailPattern.test(modelEmail)) {
        // Name LookupFallback
        var lookupKey = modelName.toLowerCase().replace(/\s+/g, " ");
        var emailFound = "";
        
        for (var key in REMIND_CONFIG.MODEL_EMAILS) {
          if (REMIND_CONFIG.MODEL_EMAILS.hasOwnProperty(key)) {
            var lookupEmail = REMIND_CONFIG.MODEL_EMAILS[key];
            if (lookupKey.indexOf(key) !== -1 || key.indexOf(lookupKey) !== -1) {
              emailFound = lookupEmail;
              break;
            }
          }
        }
        
        if (emailFound) {
          modelEmail = emailFound;
          Logger.log("[INFO] Resolved email using Name Lookup fallback for \\"" + modelName + "\\" => \\"" + modelEmail + "\\"");
        } else {
          var errorMsg = "Skipping Row " + (r + 1) + ": Column " + REMIND_CONFIG.EMAIL_COL + " contains invalid email format (\\"" + modelEmail + "\\"), and no fallback is configured for \\"" + modelName + "\\"";
          Logger.log(errorMsg);
          if (targetRow !== null) {
            ui.alert('Execution Stopped', errorMsg, ui.ButtonSet.OK);
            return;
          }
          errorCount++;
          continue;
        }
      }

      try {
        // Format HTML responsive table for candidate parameters
        var tableHtml = '<table style="border-collapse: collapse; width: 100%; font-family: sans-serif; margin: 18px 0;">';
        tableHtml += '<tr style="background-color: #000000; color: #ffffff;">';
        for (var i = 0; i < tableIndices.length; i++) {
          var idx = tableIndices[i];
          var title = headers[idx] || ('Col ' + String.fromCharCode(65 + idx));
          if (idx === colorIdx && (!title || title.trim().length === 0)) {
            title = "Color (" + colorColLetter + ")";
          }
          tableHtml += '<th style="padding: 10px 14px; text-align: left; font-size: 13px; font-weight: bold; border: 1px solid #dddddd;">' + title + '</th>';
        }
        tableHtml += '</tr>';

        tableHtml += '<tr style="background-color: #fcfcfc;">';
        for (var i = 0; i < tableIndices.length; i++) {
          var idx = tableIndices[i];
          var cellVal = idx < row.length ? row[idx] : "";
          if (cellVal instanceof Date) {
            cellVal = Utilities.formatDate(cellVal, Session.getScriptTimeZone(), "yyyy-MM-dd");
          }
          tableHtml += '<td style="padding: 10px 14px; font-size: 13px; border: 1px solid #dddddd;">' + cellVal + '</td>';
        }
        tableHtml += '</tr></table>';

        // Prepare email body with beautiful elegant spacing
        var bodyContent = '<div style="font-family: Arial, sans-serif; background-color: #fafafa; padding: 25px; border: 1px solid #e1e1e1; max-width: 600px; margin: 0 auto; color: #111111; border-radius: 8px;">' +
          '<p style="font-size: 16px; margin-bottom: 12px;">Dear <b>' + modelNameDecorated + '</b>,</p>' +
          '<p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">' +
          'This is a gentle reminder regarding the <b>Fit Management Form (' + roundConfig.name + ')</b>. ' +
          'Please check your previous email (Style No Mail) to fill and submit the form details.' +
          '</p>' +
          '<p style="font-size: 12px; font-weight: bold; color: #777777; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">Your Profile Record Details (' + roundConfig.name + '):</p>' +
          tableHtml +
          '<hr style="border: 0; border-top: 1px solid #e1e1e1; margin: 25px 0;" />' +
          '<p style="font-size: 11px; color: #777777; text-align: center; line-height: 1.4;">' +
          'This is a secure automated reminder from Management Reminders Office.<br/>' +
          'Thank you for keeping your profile updated.' +
          '</p>' +
          '</div>';

        // Dynamic subject line automatically adapting round descriptor
        var activeSubject = REMIND_CONFIG.SUBJECT_TEMPLATE.replace(/1st Round|1st/gi, roundConfig.name);

        // Call the multi-channel fallback email sender
        sendEmailWithFallback(modelEmail, activeSubject, bodyContent, "Management Reminders Office", REMIND_CONFIG.SENDER_FROM);

        // Generate dynamic timestamp with Indian Standard Time format (dd/MM/yyyy hh:mm:ss am)
        var istTimestamp = Utilities.formatDate(new Date(), "GMT+5:30", "dd/MM/yyyy hh:mm:ss a").toLowerCase();
        var stampValue = roundConfig.statusMark + " " + istTimestamp;

        // Stamp Column markIdx directly to lock duplicates
        if (markIdx !== -1) {
          sheet.getRange(r + 1, markIdx + 1).setValue(stampValue);
        }

        sentCount++;
        Logger.log("[SUCCESS] Emailed Row " + (r + 1) + " for " + roundConfig.name + " to candidate: " + modelNameDecorated + " (" + modelEmail + ")");

      } catch (err) {
        var errStr = err.toString();
        var isAliasError = (errStr.indexOf("Invalid argument") !== -1 || errStr.indexOf("Gmail operation not allowed") !== -1) && REMIND_CONFIG.SENDER_FROM;
        var detailedMsg = "[FAILURE] Error sending Row " + (r + 1) + " for " + roundConfig.name + ": " + errStr;
        
        if (isAliasError) {
          detailedMsg += "\\n\\n💡 IMPORTANT SOLUTIONS TO MAKE IT WORK:\\n" +
            "--------------------------------------------------\\n" +
            "👉 SOLUTION 1 (RECOMMENDED & EASIEST - 100% SUCCESS):\\n" +
            "Share this Google Sheet with \\"" + REMIND_CONFIG.SENDER_FROM + "\\" as an EDITOR.\\n" +
            "Then, open the sheet while logged in as \\"" + REMIND_CONFIG.SENDER_FROM + "\\" and run the reminders! This works immediately with ZERO setup.\\n\\n" +
            "👉 SOLUTION 2 (ALIAS METHOD):\\n" +
            "If running while logged into your current account, go to Gmail Settings &rarr; 'Accounts and Import' &rarr; 'Send mail as' &rarr; Click 'Add another email address' and add \\"" + REMIND_CONFIG.SENDER_FROM + "\\". Verify it via OTP, then try again.";
        }
        
        Logger.log(detailedMsg);
        if (targetRow !== null || isAliasError) {
          ui.alert('Execution Stopped with Error', detailedMsg, ui.ButtonSet.OK);
          return;
        }
        errorCount++;
      }
    }
  }

  // Display user prompt logs
  if (sentCount === 0 && errorCount === 0) {
    ui.alert('Scan Completed!\\nNo candidate rows matched eligibility conditions today for ' + roundConfig.name + '.\\n\\nRules applied:\\n- Column ' + REMIND_CONFIG.TRIGGER_DATE_COL + ' (Date) contains a value\\n- Tracking Column ' + statusColLetter + ' is completely empty');
  } else {
    var summaryMessage = targetRow !== null ? 
      'Reminder Sent Successfully for Row ' + targetRow + ' (' + roundConfig.name + '):\\n\\n' +
      '✅ Email Sent: ' + sentCount + '\\n' +
      'Row ' + targetRow + ' Column ' + statusColLetter + ' is now marked with status tracking mark & Indian date stamp.' :
      'Reminder System Dispatched Successfully for ' + roundConfig.name + ':\\n\\n' +
      '✅ Emails Sent: ' + sentCount + '\\n' +
      '❌ Skipped / Issues: ' + errorCount + '\\n\\n' +
      'Sent models now have Column ' + statusColLetter + ' stamped with \\"' + roundConfig.statusMark + ' [Indian Timestamp]\\"' +
      ' to protect candidate from duplicate triggers.';
    ui.alert('Done', summaryMessage, ui.ButtonSet.OK);
  }
}

/**
 * Prints helpful alerts to configure spreadsheet columns layout
 */
function showHelpLayoutGuide() {
  var guide = "Candidate alignment tracker help:\\n\\n" +
                "- Column " + REMIND_CONFIG.NAME_COL + " : Model Name (Dear Name)\\n" +
                "- Column " + REMIND_CONFIG.EMAIL_COL + " : Type of Sample (Automatic fallbacks configured)\\n" +
                "- Column " + REMIND_CONFIG.TRIGGER_DATE_COL + " : Validation Date H\\n\\n" +
                "ROUND SPECIFIC COLOR COLUMNS:\\n" +
                "- 1st Round Color Column: G (Tracking AZ)\\n" +
                "- 2nd Round Color Column: O (Tracking BA)\\n" +
                "- 3rd Round Color Column: W (Tracking BB)\\n" +
                "- 4th Round Color Column: AE (Tracking BC)\\n" +
                "- 5th Round Color Column: AM (Tracking BE)\\n\\n" +
                "The script automatically stamps successful executions with the precise Date & Indian Standard Time!";
  SpreadsheetApp.getUi().alert('App-script Column Grid Guide\\n\\n' + guide);
}

/**
 * Resilient multi-channel email sender with automatic alias and API service fallbacks
 */
function sendEmailWithFallback(recipient, subject, htmlBody, senderName, customFrom) {
  var errors = [];
  var activeEmail = "";
  try {
    activeEmail = Session.getActiveUser().getEmail();
  } catch(sessErr) {}

  var cleanCustomFrom = customFrom ? customFrom.trim().toLowerCase() : "";
  var cleanActiveEmail = activeEmail ? activeEmail.trim().toLowerCase() : "";

  var isSameSender = (cleanCustomFrom !== "" && cleanActiveEmail !== "" && cleanCustomFrom === cleanActiveEmail);

  if (isSameSender) {
    Logger.log("[INFO] Detected that custom from matches logged-in user (" + activeEmail + "). Sending directly without custom 'from' header...");
    var directOptions = {
      htmlBody: htmlBody,
      name: senderName
    };
    try {
      GmailApp.sendEmail(recipient, subject, "", directOptions);
      Logger.log("[INFO] Sent successfully using GmailApp directly (as " + activeEmail + ").");
      return;
    } catch (e) {
      var eStr = e.toString();
      errors.push("GmailApp direct: " + eStr);
      Logger.log("[WARN] GmailApp direct failed: " + eStr);
    }
  }

  // 1. Try sending with GmailApp and custom "from" alias (if not the same or direct failed)
  if (!isSameSender && cleanCustomFrom !== "") {
    var mailOptions = {
      htmlBody: htmlBody,
      name: senderName,
      from: customFrom.trim()
    };
    try {
      GmailApp.sendEmail(recipient, subject, "", mailOptions);
      Logger.log("[INFO] Sent successfully using GmailApp with alias: " + customFrom);
      return;
    } catch (e) {
      var eStr = e.toString();
      errors.push("GmailApp with alias '" + customFrom + "': " + eStr);
      Logger.log("[WARN] GmailApp with custom alias failed: " + eStr);
    }
  }
  
  // 2. Try sending with GmailApp directly as fallback
  if (!isSameSender) {
    var directOptions = {
      htmlBody: htmlBody,
      name: senderName
    };
    try {
      GmailApp.sendEmail(recipient, subject, "", directOptions);
      Logger.log("[INFO] Sent successfully using GmailApp directly (logged-in account).");
      return;
    } catch (e) {
      var eStr = e.toString();
      errors.push("GmailApp direct fallback: " + eStr);
      Logger.log("[WARN] GmailApp direct fallback failed: " + eStr);
    }
  }
  
  // 3. Try sending with MailApp as final fallback (extremely reliable)
  var mailAppOptions = {
    htmlBody: htmlBody,
    name: senderName
  };
  try {
    MailApp.sendEmail(recipient, subject, "", mailAppOptions);
    Logger.log("[INFO] Sent successfully using MailApp fallback.");
    return;
  } catch (e) {
    var eStr = e.toString();
    errors.push("MailApp direct fallback: " + eStr);
    Logger.log("[ERROR] MailApp fallback failed: " + eStr);
  }
  
  // If all methods fail, throw combined error
  throw new Error("All email delivery methods failed!\\n\\nDetails:\\n- " + errors.join("\\n- "));
}`;

export function GoogleSheetsSetupModal() {
  const [activeTab, setActiveTab] = useState<'zoomGuide' | 'scriptSetup' | 'categoryTabs' | 'photoFaq'>('zoomGuide');
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

  const handleDownloadScript = () => {
    const blob = new Blob([APPS_SCRIPT_CODE], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'GoogleSheets_FitPhotoZoom_Script.gs';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded GoogleSheets_FitPhotoZoom_Script.gs!');
  };

  const handlePreviewZoomViewer = () => {
    const demoUrl = `${window.location.origin}/?mode=zoom&url=${encodeURIComponent('https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200')}&style=DEMO-FIT-PHOTO&round=1`;
    window.open(demoUrl, '_blank');
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
        <span>Google Sheets & Photo Zoom</span>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Google Sheets Photo Zoom & Sync System
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Google Sheet me photo click-to-zoom aur feedback sync setup karein
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 mt-2 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('zoomGuide')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'zoomGuide'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>📸 Google Sheet Zoom Guide</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scriptSetup')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'scriptSetup'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>⚙️ Apps Script Code & Setup</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('categoryTabs')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'categoryTabs'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>📑 30 Sheet Tabs</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('photoFaq')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'photoFaq'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>📸 Email, Mobile & Supabase</span>
          </button>
        </div>

        {/* TAB 1: HOW ZOOM WORKS IN GOOGLE SHEETS */}
        {activeTab === 'zoomGuide' && (
          <div className="space-y-4 pt-2 text-xs">
            {/* Quick Demo Banner */}
            <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                  <ZoomIn className="w-4 h-4 text-indigo-600" />
                  Full Interactive Zoom Experience
                </p>
                <p className="text-[11px] text-indigo-700 mt-0.5">
                  Form ki tarah Google Sheet se bhi photo zoom, scroll wheel zoom aur pan hoga.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handlePreviewZoomViewer}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs h-8 gap-1.5 shrink-0 shadow-xs"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                Live Zoom Demo Dekhein
              </Button>
            </div>

            {/* 3 Methods Breakdown */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-[11px]">
                Google Sheet me photo zoom karne ke 3 aasan tareeqe:
              </h4>

              {/* Method 1 */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5 hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[11px] font-bold">1</span>
                    Direct Cell Link Click (Sabse Aasan)
                  </span>
                  <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">
                    Instant Click
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
                  Google Sheet me <strong>Columns BI, BJ, BK, BL, BM</strong> me kisi bhi photo cell par click karein. Cell ke upar ek blue link pop-up hoga. Us par click karte hi <strong>Interactive Full HD Zoom Viewer</strong> khul jayega jahan scroll karke zoom aur drag karke pan kar sakte hain!
                </p>
              </div>

              {/* Method 2 */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5 hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center text-[11px] font-bold">2</span>
                    In-Sheet Dialog (Sheet ke andar hi Zoom)
                  </span>
                  <Badge variant="outline" className="text-[10px] text-indigo-700 border-indigo-200 bg-indigo-50">
                    No Tab Switch
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
                  Google Sheet me photo cell select karein aur upar menu bar me click karein:
                  <br />
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono text-indigo-700 mt-1 inline-block">
                    📸 Fit Photos ➔ 🔍 Zoom Selected Photo
                  </code>
                  <br />
                  Sheet ke screen ke upar hi ek <strong>950x680px</strong> ka popup window khul jayega jisme Zoom In/Out, Rotate, 1:1 HD aur Gallery navigate kar sakte hain.
                </p>
              </div>

              {/* Method 3 */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5 hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-[11px] font-bold">3</span>
                    Permanent Sidebar Inspector (Right Side Panel)
                  </span>
                  <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-200 bg-purple-50">
                    Side-by-Side
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed pl-7">
                  Menu me click karein:
                  <br />
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono text-purple-700 mt-1 inline-block">
                    📸 Fit Photos ➔ 🖼️ Open Photo Zoom Sidebar
                  </code>
                  <br />
                  Google Sheet ke right side par ek fixed panel khul jayega. Aap sheet me kisi bhi row par kaam karte waqt us row ki photo ko zoom karke saath-saath dekh sakte hain.
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                className="gap-2 text-xs h-9 font-medium border-slate-300 hover:bg-slate-50 cursor-pointer"
                onClick={handleDownloadScript}
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                Download Separate .gs Script File
              </Button>
              <Button
                className="gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-medium shadow-xs cursor-pointer"
                onClick={handleCopyCode}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied Code!' : 'Copy Complete Apps Script'}
              </Button>
            </div>
          </div>
        )}

        {/* TAB 2: APPS SCRIPT CODE & SETUP INSTRUCTIONS */}
        {activeTab === 'scriptSetup' && (
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

            {/* Step-by-Step Hindi Setup Guide */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-2 text-xs">
              <div className="font-bold text-amber-950 flex items-center gap-1.5">
                <span>📋 Google Sheet me ye naya script kaise set karein:</span>
              </div>
              <ol className="text-[11px] text-amber-900 space-y-2 list-decimal pl-4 leading-relaxed font-medium">
                <li>
                  Neeche diye gaye <strong>"Download .gs Script File"</strong> ya <strong>"Copy Complete Apps Script"</strong> button par click karein.
                </li>
                <li>
                  Apna Google Sheet kholein aur upar menu se <strong>Extensions ➔ Apps Script</strong> par click karein.
                </li>
                <li>
                  Apps Script editor me <code>GoogleSheets_FitPhotoZoom_Script.gs</code> (ya <code>Snapped.gs</code>) me ye pura code paste karke <strong>Ctrl + S (Save)</strong> karein.
                </li>
                <li>
                  Upar dropdown me <strong><code>onOpen</code></strong> select karein aur <strong>Run</strong> par click karein. Isse Google Sheet me <strong>📸 Fit Photos</strong> menu turant add ho jayega!
                </li>
                <li>
                  Upar <strong>Deploy ➔ Manage Deployments</strong> (ya New Deployment) par click karein, <em>Execute as: <strong>Me</strong></em> aur <em>Who has access: <strong>Anyone</strong></em> select karke Deploy karein.
                </li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <Button 
                variant="outline"
                className="gap-2 text-xs h-9 font-medium border-slate-300 hover:bg-slate-50 cursor-pointer"
                onClick={handleDownloadScript}
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                Download Separate .gs File
              </Button>
              <Button 
                className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 shadow-sm cursor-pointer"
                onClick={handleCopyCode}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied to Clipboard!' : 'Copy Complete Apps Script'}
              </Button>
            </div>
          </div>
        )}

        {/* TAB 3: 30 CATEGORY & SERIES TABS IN GOOGLE SHEETS */}
        {activeTab === 'categoryTabs' && (
          <div className="space-y-4 pt-2 text-xs">
            {/* Overview Banner */}
            <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    30 Category & Series Tabs in Google Sheets
                  </h4>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Style ke hisab se exact sheet tab me data save hoga (e.g. Shapewear, Panty, Bra, SC, CB, CP, FB, FP series).
                  </p>
                </div>
                <Badge className="bg-indigo-600 text-white font-semibold text-xs shrink-0 self-start sm:self-auto">
                  30 Tabs Supported
                </Badge>
              </div>
            </div>

            {/* How to initialize in Google Sheet */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-950 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Google Sheet me saare 30 Tabs 1-Click me kaise layein:</span>
              </div>
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                Apna Google Sheet kholein aur upar custom menu me click karein:
                <br />
                <code className="bg-white/90 px-2 py-1 rounded text-[11px] font-mono text-emerald-800 border border-emerald-200 mt-1 inline-block font-bold">
                  Model Reminders ✉️ ➔ 📑 Setup / Create All 30 Category Tabs
                </code>
                <br />
                <span className="text-[10px] text-emerald-700 mt-1 inline-block">
                  (Ye menu <strong>📸 Fit Photos</strong> me bhi available hai). Click karte hi Google Sheet me saare 30 tabs ban jayenge, complete frozen header row (Timestamp, Model Name, Style, Rounds 1-5) aur photo columns (BI to BR) ready ho jayenge!
                </span>
              </p>
            </div>

            {/* Tabs Grid */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <span>📋 Saare 30 Sheet Tabs ki List:</span>
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">
                {[
                  "Shapewear",
                  "Panty",
                  "Bra",
                  "Panty Packs",
                  "SC Series",
                  "CS Series",
                  "SHW Series",
                  "CB & CP-101 Series",
                  "CB & CP-201 Series",
                  "CB & CP-301 Series",
                  "CB & CP-401 Series",
                  "CB & CP-501 Series",
                  "CB & CP-601 Series",
                  "CB & CP-701 Series",
                  "CB & CP-801 Series",
                  "CB & CP-901 Series",
                  "FB & FP-501 Series",
                  "FB & FP-601 Series",
                  "FB & FP-701 Series",
                  "FB & FP-801 Series",
                  "CB-901 Series",
                  "CP-1101 Series",
                  "CP-1201 Series",
                  "CP-1301 Series",
                  "CP-1401 Series",
                  "CP-1501 Series",
                  "FP-1601 Series",
                  "FP-1701 Series",
                  "FP-1801 Series",
                  "CP-1901 Series",
                  "General"
                ].map((tab, idx) => (
                  <Badge 
                    key={tab} 
                    variant="outline" 
                    className="text-[11px] font-medium py-1 px-2 border-slate-200 bg-slate-50 text-slate-800 hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                  >
                    <span className="text-[9px] font-mono text-slate-400 mr-1.5">#{idx + 1}</span>
                    {tab === "Shapewear" && "🩱 "}
                    {tab === "Panty" && "🩲 "}
                    {tab === "Bra" && "👙 "}
                    {tab === "Panty Packs" && "📦 "}
                    {tab === "General" && "📁 "}
                    {!["Shapewear", "Panty", "Bra", "Panty Packs", "General"].includes(tab) && "📑 "}
                    {tab}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Column Layout Summary */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-1.5">
              <span className="font-semibold text-indigo-950 text-xs">📸 Har tab me Photo Columns ka arrangement:</span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] text-slate-700 font-mono">
                <div className="bg-white p-2 rounded border border-indigo-100">
                  <div className="font-bold text-indigo-700">Round 1</div>
                  <div>Sample: <strong className="text-blue-700">BI</strong></div>
                  <div>Fit Photo: <strong className="text-purple-700">BJ</strong></div>
                </div>
                <div className="bg-white p-2 rounded border border-indigo-100">
                  <div className="font-bold text-indigo-700">Round 2</div>
                  <div>Sample: <strong className="text-blue-700">BK</strong></div>
                  <div>Fit Photo: <strong className="text-purple-700">BL</strong></div>
                </div>
                <div className="bg-white p-2 rounded border border-indigo-100">
                  <div className="font-bold text-indigo-700">Round 3</div>
                  <div>Sample: <strong className="text-blue-700">BM</strong></div>
                  <div>Fit Photo: <strong className="text-purple-700">BN</strong></div>
                </div>
                <div className="bg-white p-2 rounded border border-indigo-100">
                  <div className="font-bold text-indigo-700">Round 4</div>
                  <div>Sample: <strong className="text-blue-700">BO</strong></div>
                  <div>Fit Photo: <strong className="text-purple-700">BP</strong></div>
                </div>
                <div className="bg-white p-2 rounded border border-indigo-100">
                  <div className="font-bold text-indigo-700">Round 5</div>
                  <div>Sample: <strong className="text-blue-700">BQ</strong></div>
                  <div>Fit Photo: <strong className="text-purple-700">BR</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PHOTO, EMAIL & MOBILE GUIDES */}
        {activeTab === 'photoFaq' && (
          <div className="space-y-4 pt-2 text-xs">
            {/* 1. Model Email Photo & Details */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-indigo-950 text-xs">
                <Camera className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>1. Model Email me Product Photo & Specifications:</span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed pl-6">
                Ab se jab bhi admin form submit karega ya Google Sheet se reminder bhejega, model ko aane wale email me:
              </p>
              <ul className="text-[11px] text-slate-700 space-y-1 list-disc pl-10">
                <li><strong>📸 Product Sample Garment Photo Banner:</strong> Email ke andar hi sample photo ka preview dikhega (click karke Full HD zoom bhi kar sakti hain).</li>
                <li><strong>📋 Garment Specifications Card:</strong> Style No, Sample Type (Shapewear/Bra/Panty), Assigned Size, Color, Given Date, aur Instructions saf-saf dikhenge.</li>
                <li><strong>👉 Big Action Button:</strong> "Open Mobile Feedback Form" direct button milega jisse model apne phone me form khol sakti hai.</li>
              </ul>
            </div>

            {/* 2. Mobile Camera & Gallery */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-950 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>2. Mobile Browser me Camera aur Gallery (iPhone & Android):</span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed pl-6">
                Mobile Safari aur Android Chrome me hidden file input ke click block hone ka issue tha, jise ab <strong>Native Touch Target</strong> se fix kar diya gaya hai:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                  <strong className="text-emerald-800 text-[11px] flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" /> 📸 Take Photo (Camera)
                  </strong>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Mobile par tap karte hi seedha mobile camera open hoga aur live fit photo click ho jayegi.
                  </p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                  <strong className="text-indigo-800 text-[11px] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> 🖼️ Upload from Gallery / Files
                  </strong>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Mobile par tap karte hi phone ki gallery/photos open hongi jahan se ek ya multiple photos select kar sakti hain.
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 pl-6">
                💡 "Tap to browse or drag & drop files here" box bhi ab mobile aur laptop dono par bina kisi problem ke kaam karta hai.
              </p>
            </div>

            {/* 3. Supabase Storage vs Google Drive */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>3. Supabase Storage & Google Sheet Photo Sync:</span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed pl-6">
                <strong>Supabase Storage:</strong> Supabase Dashboard me <code>Storage</code> me jayein aur check karein ki <strong><code>fit-attachments</code></strong> naam ka bucket bana hua hai aur <strong>Public bucket: ON</strong> hai.
              </p>
              <div className="bg-white p-2.5 rounded-lg border border-amber-200 pl-4 space-y-1">
                <p className="text-[11px] font-semibold text-slate-800">
                  Google Sheet me photo kyu nahi aayi thi?
                </p>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Agar aapne Apps Script ka naya code paste kiya tha lekin <strong>Deploy ➔ Manage Deployments ➔ Edit (Pencil) ➔ New Version</strong> select karke Deploy nahi kiya, to Google Apps Script purana code hi chala raha tha!
                  <br />
                  Naye code me Google Drive auto-folder (<code>Style_Samples</code>) banta hai aur Column BI to BR me <code>=IMAGE()</code> aur <code>=HYPERLINK()</code> formula lagta hai.
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
