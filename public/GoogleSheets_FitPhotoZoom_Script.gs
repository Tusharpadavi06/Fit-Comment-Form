/**
 * =========================================================================================
 * SOIE SAMPLE FIT - GOOGLE SHEETS FIT PHOTO ZOOM & WEBHOOK SCRIPT (Snapped.gs)
 * =========================================================================================
 * 
 * 📸 FEATURES INCLUDED:
 * 1. CLICK TO ZOOM IN GOOGLE SHEETS:
 *    - Each photo cell in Columns BI-BM has an =HYPERLINK() wrapping the =IMAGE().
 *    - Clicking the cell link immediately opens the full-resolution Interactive Photo Zoom Viewer!
 * 
 * 2. IN-SHEET MODAL DIALOG (No need to leave Google Sheets):
 *    - Menu "📸 Fit Photos" -> "🔍 Zoom Selected Photo (In-Sheet Dialog)"
 *    - Opens a 950x680px interactive lightbox right inside Google Sheets.
 *    - Includes: Zoom (+/-), Mouse Wheel Zoom, Click & Drag to Pan, Rotate 90°,
 *      1:1 HD Toggle, Next/Prev photo gallery, and Download HD Photo!
 * 
 * 3. PERSISTENT PHOTO INSPECTOR SIDEBAR:
 *    - Menu "📸 Fit Photos" -> "🖼️ Open Photo Zoom Sidebar"
 *    - Stays open on the right side of Google Sheets.
 *    - Lets you inspect and zoom into photos side-by-side with your spreadsheet rows!
 * 
 * 4. AUTOMATIC UPLOAD & HIGH-SPEED CDN:
 *    - Saves 1 to 10 photos per round into organized Google Drive folders.
 *    - Uses official Google CDN URLs (https://lh3.googleusercontent.com/d/FILE_ID)
 *      guaranteeing photos ALWAYS display in the sheet without broken icon errors.
 * 
 * 5. TARGET COLUMNS:
 *    - Column AX (50): Unique Assignment ID
 *    - Column BI (61): Round 1 Sample Photo (Clickable Zoom)
 *    - Column BJ (62): Round 1 Model Fit Photos (Clickable Zoom)
 *    - Column BK (63): Round 2 Sample Photo (Clickable Zoom)
 *    - Column BL (64): Round 2 Model Fit Photos (Clickable Zoom)
 *    - Column BM (65): Round 3 Sample Photo (Clickable Zoom)
 *    - Column BN (66): Round 3 Model Fit Photos (Clickable Zoom)
 *    - Column BO (67): Round 4 Sample Photo (Clickable Zoom)
 *    - Column BP (68): Round 4 Model Fit Photos (Clickable Zoom)
 *    - Column BQ (69): Round 5 Sample Photo (Clickable Zoom)
 *    - Column BR (70): Round 5 Model Fit Photos (Clickable Zoom)
 * =========================================================================================
 */

// =========================================================================================
// 1. DUAL MENU INITIALIZATION (Model Reminders ✉️ + 📸 Fit Photos)
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
      .addItem("ℹ️ How to Use Photo Zoom", "showPhotoHelpDialog")
      .addToUi();
  } catch (e2) {
    Logger.log("Could not load Fit Photos menu: " + e2);
  }
}

// 2. Web App entry point: Serves Interactive Zoom Viewer on GET
function doGet(e) {
  if (e && e.parameter && (e.parameter.zoom || e.parameter.folder || e.parameter.fileId)) {
    return renderPhotoZoomViewer(e.parameter);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    file: "GoogleSheets_FitPhotoZoom_Script.gs",
    message: "SOIE Fit Comments & Photo Zoom Webhook is Active!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// 3. Webhook entry point: Receives form data and embeds photos into Google Sheets
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("Error: No post data received").setMimeType(ContentService.MimeType.TEXT);
    }

    var data = JSON.parse(e.postData.contents);
    var ss = data.sheetId ? SpreadsheetApp.openById(data.sheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Spreadsheet not found.");

    if (data.type === 'SEND_MAIL') {
      return sendMail(data);
    }

    var sheetName = data.tabName || "General";
    var sheet = getSheetWithHeaders(ss, sheetName);
    
    // Ensure sheet has enough columns (BR is column 70, reserve 72+)
    if (sheet.getMaxColumns() < 72) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 72 - sheet.getMaxColumns());
    }

    var assignmentId = data.assignmentId || data.id || data.AX;
    var row = -1;
    if (assignmentId) row = findRow(sheet, assignmentId);
    if (row === -1 && (data.styleNo || data.D)) {
      row = findRowByStyle(sheet, data.styleNo || data.D, data.modelName || data.B);
    }
    
    if (row === -1) {
      row = sheet.getLastRow() + 1;
      updateCell(sheet, row, "AX", assignmentId);
      updateCell(sheet, row, "A", data.timestamp || new Date());
    } else if (assignmentId) {
      updateCell(sheet, row, "AX", assignmentId);
    }
    
    // Update general fields
    updateCell(sheet, row, "B", data.modelName || data.B);
    updateCell(sheet, row, "C", data.sampleType || data.C);
    updateCell(sheet, row, "D", data.styleNo || data.D);
    updateCell(sheet, row, "E", data.description || data.E);
    updateCell(sheet, row, "F", data.size || data.F);
    
    // Update round-specific feedback (Rounds 1 to 5)
    var round = String(data.round || "1");
    var roundMap = {
      "1": { color: "G", fitDate: "H", commDate: "I", recvDate: "J", bWash: "K", aWash: "L", fabric: "M" },
      "2": { color: "O", fitDate: "P", commDate: "Q", recvDate: "R", bWash: "S", aWash: "T", fabric: "U" },
      "3": { color: "W", fitDate: "X", commDate: "Y", recvDate: "Z", bWash: "AA", aWash: "AB", fabric: "AC" },
      "4": { color: "AE", fitDate: "AF", commDate: "AG", recvDate: "AH", bWash: "AI", aWash: "AJ", fabric: "AK" },
      "5": { color: "AM", fitDate: "AN", commDate: "AO", recvDate: "AP", bWash: "AQ", aWash: "AR", fabric: "AS" }
    };

    var rConfig = roundMap[round];
    if (rConfig) {
      updateCell(sheet, row, rConfig.color, data.color);
      updateCell(sheet, row, rConfig.fitDate, data.givenForFitDate);
      updateCell(sheet, row, rConfig.commDate, data.commentsDate || data.commentsReceivedDate);
      updateCell(sheet, row, rConfig.recvDate, data.receivedDate);
      updateCell(sheet, row, rConfig.bWash, data.beforeWash);
      updateCell(sheet, row, rConfig.aWash, data.afterWash);
      updateCell(sheet, row, rConfig.fabric, data.fabricComments || data.fabricTrims);
    }
    
    // Handle Sample Garment Photo (Columns BI, BK, BM, BO, BQ)
    if (data.samplePhoto || data.samplePhotoUrl) {
      try {
        handleSamplePhotoAttachment(data, sheet, row);
      } catch (sampleErr) {
        Logger.log("Sample photo handle error: " + sampleErr.message);
      }
    }

    // Handle Model Feedback Fit Photos (Columns BJ, BL, BN, BP, BR)
    if (data.attachments || data.collageAttachment || data.allImages || data.images) {
      try {
        handleAttachments(data, sheet, row);
      } catch (photoErr) {
        Logger.log("Photo handle error: " + photoErr.message);
      }
    }

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

// 4. Handles Sample Garment Photo from Admin Form (Columns BI, BK, BM, BO, BQ)
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

  // If already a valid web link without base64
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
  } catch (sampleUploadErr) {
    Logger.log("Sample photo Drive upload error: " + sampleUploadErr.message);
  }
}

// 5. Handles Model Feedback Photo Upload (Columns BJ, BL, BN, BP, BR)
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

  var folder = getOrCreatePhotoFolder(data.folderId);
  var cleanStyle = String(data.styleNo || data.D || "Sample").replace(/[^a-zA-Z0-9_-]/g, "_");
  var cleanModel = String(data.modelName || data.B || "Model").replace(/[^a-zA-Z0-9_-]/g, "_");
  var subFolderName = cleanStyle + "_R" + round + "_" + cleanModel;
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

  var imageToEmbedUrl = null;
  var primaryZoomUrl = null;
  var photoViewLinks = [];
  var cFileId = "";

  // Upload Collage Grid Thumbnail if provided
  if (data.collageAttachment && data.collageAttachment.data) {
    try {
      var cData = data.collageAttachment.data;
      if (cData.indexOf(",") > -1) cData = cData.split(",")[1];
      var cBytes = Utilities.base64Decode(cData);
      var cFileName = cleanStyle + "_R" + round + "_Grid_Thumbnail.jpg";
      var cBlob = Utilities.newBlob(cBytes, "image/jpeg", cFileName);
      var cFile = targetFolder.createFile(cBlob);
      try { cFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
      
      cFileId = cFile.getId();
      imageToEmbedUrl = "https://lh3.googleusercontent.com/d/" + cFileId;
      primaryZoomUrl = "https://lh3.googleusercontent.com/d/" + cFileId + "=s0";
    } catch (cErr) {
      Logger.log("Collage upload error: " + cErr.message);
    }
  }

  // Upload Individual Photos (1 to 10)
  var list = data.allImages || data.attachments || data.images || [];
  var photoFileIds = [];

  for (var i = 0; i < list.length; i++) {
    try {
      var att = list[i];
      if (!att) continue;
      var rawData = att.data || att.dataUrl || att.base64;
      if (!rawData) continue;
      if (rawData.indexOf(",") > -1) rawData = rawData.split(",")[1];
      
      var bytes = Utilities.base64Decode(rawData);
      var isPng = (att.type && att.type.indexOf("png") > -1);
      var ext = isPng ? ".png" : ".jpg";
      var mime = isPng ? "image/png" : "image/jpeg";
      var fName = cleanStyle + "_R" + round + "_Photo_" + (i + 1) + ext;
      var blob = Utilities.newBlob(bytes, mime, fName);
      var file = targetFolder.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}

      var fileId = file.getId();
      photoFileIds.push(fileId);
      var directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
      var directZoomLink = "https://lh3.googleusercontent.com/d/" + fileId + "=s0";
      photoViewLinks.push({ id: fileId, zoomUrl: directZoomLink, name: fName });

      if (!imageToEmbedUrl) {
        imageToEmbedUrl = directUrl;
        primaryZoomUrl = directZoomLink;
      }
    } catch (attErr) {
      Logger.log("File " + i + " error: " + attErr.message);
    }
  }

  // Embed Image Formula with Interactive Zoom Hyperlink
  var cell = sheet.getRange(rowIndex, colIdx);
  if (imageToEmbedUrl) {
    try {
      var primaryId = cFileId || (photoFileIds.length > 0 ? photoFileIds[0] : "");
      var scriptUrl = "";
      try { scriptUrl = ScriptApp.getService().getUrl(); } catch (e) {}

      // If appUrl is passed from our web app, use it for direct high-speed zoom viewer
      var zoomDestinationUrl = "";
      if (data.appUrl && data.appUrl.indexOf("http") === 0) {
        zoomDestinationUrl = data.appUrl + "/?mode=zoom&fileId=" + primaryId + "&url=" + encodeURIComponent(primaryZoomUrl || "") + "&style=" + encodeURIComponent(cleanStyle) + "&round=" + round + "&subId=" + encodeURIComponent(data.assignmentId || "");
      } else if (scriptUrl && scriptUrl.indexOf("http") === 0) {
        zoomDestinationUrl = scriptUrl + "?zoom=" + primaryId + "&folder=" + targetFolder.getId() + "&style=" + encodeURIComponent(cleanStyle) + "&round=" + round;
      } else {
        zoomDestinationUrl = "https://lh3.googleusercontent.com/d/" + primaryId + "=s0";
      }

      // Formula: =HYPERLINK("zoom_url", IMAGE("image_url", 1))
      cell.setFormula('=HYPERLINK("' + zoomDestinationUrl + '", IMAGE("' + imageToEmbedUrl + '", 1))');
      
      sheet.setRowHeight(rowIndex, 85);
      sheet.setColumnWidth(colIdx, 115);
      cell.setHorizontalAlignment("center").setVerticalAlignment("middle");

      // Cell Note with direct zoom links and in-sheet menu instructions
      var totalPhotos = photoViewLinks.length || (data.attachmentsCount || 1);
      var note = "📸 Fit Photos (" + totalPhotos + " Photo" + (totalPhotos > 1 ? "s" : "") + "):\\n";
      note += "👉 1. CLICK CELL LINK to Zoom Photo in Full HD!\\n";
      note += "👉 2. OR USE MENU: '📸 Fit Photos' -> '🔍 Zoom Selected Photo'\\n\\n";
      for (var k = 0; k < photoViewLinks.length; k++) {
        note += "• Photo " + (k + 1) + ": " + photoViewLinks[k].zoomUrl + "\\n";
      }
      note += "\\nFolder: https://drive.google.com/drive/folders/" + targetFolder.getId();
      cell.setNote(note);

    } catch (imgErr) {
      Logger.log("Image cell formula error: " + imgErr.message);
      if (primaryZoomUrl) cell.setValue(primaryZoomUrl);
    }
  } else if (data.attachmentsCount && data.attachmentsCount > 0) {
    cell.setValue(data.attachmentsCount + " photos attached");
  }
}

// 5. Opens Full Interactive Zoom Modal Dialog directly inside Google Sheets
function showPhotoZoomDialog() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  
  var fileId = extractFileId(formula) || extractFileId(note);
  var folderId = extractFolderId(formula) || extractFolderId(note);
  
  if (!fileId && !folderId) {
    SpreadsheetApp.getUi().alert("No fit photo found in this cell.\\n\\nPlease select a cell in Columns BI to BR that contains a photo thumbnail.");
    return;
  }
  
  var photos = getPhotosFromFolderOrId(folderId, fileId);
  var html = buildZoomViewerHtml(photos, "Fit Photo Zoom", "", fileId);
  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(950)
    .setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, "📸 Fit Photo Zoom Viewer");
}

// 6. Opens Persistent Photo Inspector Sidebar in Google Sheets
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

  // If active cell is not in photo columns, check if this row has photo in BI-BR
  if (!fileId && !folderId) {
    var checkCols = ["BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP", "BQ", "BR"];
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
    return { hasPhoto: false, message: "Select a photo cell in Columns BI-BR" };
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

// 7. Formats photo columns BI-BR nicely (Sample & Feedback Photos)
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
  SpreadsheetApp.getUi().alert("Photo columns BI to BR have been formatted (115px width, centered alignment).");
}

function showPhotoHelpDialog() {
  var msg = "📸 HOW TO ZOOM PHOTOS IN GOOGLE SHEETS:\\n\\n" +
    "1. DIRECT CLICK ZOOM:\\n" +
    "   Click on any thumbnail cell in Columns BI to BR:\\n" +
    "   • BI, BK, BM, BO, BQ: Sample Garment Photos\\n" +
    "   • BJ, BL, BN, BP, BR: Model Fitting Feedback Photos\\n" +
    "   Click the blue link preview to open the Full HD Zoom Viewer!\\n\\n" +
    "2. IN-SHEET POPUP DIALOG:\\n" +
    "   Select any photo cell and click:\\n" +
    "   Menu '📸 Fit Photos' -> '🔍 Zoom Selected Photo'\\n\\n" +
    "3. SIDEBAR INSPECTOR:\\n" +
    "   Click Menu '📸 Fit Photos' -> '🖼️ Open Photo Zoom Sidebar' to inspect photos side-by-side!\\n\\n" +
    "Controls inside Zoom Viewer:\\n" +
    "• Scroll Mouse Wheel = Zoom In / Out\\n" +
    "• Click & Drag = Pan across photo\\n" +
    "• Double Click = Toggle 2x Zoom\\n" +
    "• Rotate Button = Turn photo 90°\\n" +
    "• Arrows = Browse all attached photos";
  SpreadsheetApp.getUi().alert(msg);
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
    SpreadsheetApp.getUi().alert("Please select a photo cell in Columns BI-BR.");
  }
}

// 8. Renders Standalone Web App Interactive Photo Zoom Lightbox
function renderPhotoZoomViewer(params) {
  var fileId = params.zoom || params.fileId || "";
  var folderId = params.folder || "";
  var style = params.style || "Fit Sample";
  var round = params.round || "1";
  
  var photos = getPhotosFromFolderOrId(folderId, fileId);
  var html = buildZoomViewerHtml(photos, style, round, fileId);
  return HtmlService.createHtmlOutput(html)
    .setTitle("Fit Photo Zoom - " + style + " (R" + round + ")")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=5.0");
}

function getPhotosFromFolderOrId(folderId, fileId) {
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
  return photos;
}

// 9. Full Interactive HTML Zoom Lightbox Builder
function buildZoomViewerHtml(photos, style, round, initialFileId) {
  var photosJson = JSON.stringify(photos);
  var html = '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">' +
    '<title>' + escapeHtml(style) + ' Photo Zoom</title>' +
    '<style>' +
    '* { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }' +
    'body { background: #070a11; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }' +
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
    '.zoom-pct { font-size: 12px; font-variant-numeric: tabular-nums; color: #a5b4fc; min-width: 44px; text-align: center; }' +
    '.stage-container { flex: 1; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #05070c; cursor: grab; }' +
    '.stage-container:active { cursor: grabbing; }' +
    '#viewer-img { max-width: 95%; max-height: 90%; transform-origin: center center; transition: transform 0.05s ease-out; box-shadow: 0 20px 50px rgba(0,0,0,0.8); pointer-events: none; border-radius: 4px; }' +
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
    '  if (photos.length <= 1) { thumbsBar.style.display = "none"; return; }' +
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
    '  document.addEventListener("keydown", function(e) {' +
    '    if (e.key === "ArrowRight") loadPhoto((currentIndex + 1) % photos.length);' +
    '    else if (e.key === "ArrowLeft") loadPhoto((currentIndex - 1 + photos.length) % photos.length);' +
    '    else if (e.key === "+" || e.key === "=") zoomDelta(0.25);' +
    '    else if (e.key === "-" || e.key === "_") zoomDelta(-0.25);' +
    '    else if (e.key === "0") resetZoom();' +
    '  });' +
    '}' +
    'init();' +
    '<' + '/script></body></html>';
  return html;
}

// 10. Sidebar HTML Builder for Google Sheets
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

// Extraction Helpers
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
      var fIdx = s.indexOf("fileId=");
      if (fIdx !== -1) {
        part = s.substring(fIdx + 7);
      } else {
        var drvIdx = s.indexOf("/file/d/");
        if (drvIdx !== -1) part = s.substring(drvIdx + 8);
      }
    }
  }
  if (!part) return "";
  for (var i = 0; i < part.length; i++) {
    var c = part.charAt(i);
    var isAlpha = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    var isNum = (c >= '0' && c <= '9');
    var isSpecial = (c === '_' || c === '-');
    if (!isAlpha && !isNum && !isSpecial) return part.substring(0, i);
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
    if (foldIdx !== -1) part = s.substring(foldIdx + 9);
  }
  if (!part) return "";
  for (var i = 0; i < part.length; i++) {
    var c = part.charAt(i);
    var isAlpha = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    var isNum = (c >= '0' && c <= '9');
    var isSpecial = (c === '_' || c === '-');
    if (!isAlpha && !isNum && !isSpecial) return part.substring(0, i);
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
      "R1 Color", "R1 Fit Date", "R1 Comments Date", "R1 Received", "R1 Before Wash", "R1 After Wash", "R1 Fabric/Trims",
      "R2 Color", "R2 Fit Date", "R2 Comments Date", "R2 Received", "R2 Before Wash", "R2 After Wash", "R2 Fabric/Trims",
      "R3 Color", "R3 Fit Date", "R3 Comments Date", "R3 Received", "R3 Before Wash", "R3 After Wash", "R3 Fabric/Trims",
      "R4 Color", "R4 Fit Date", "R4 Comments Date", "R4 Received", "R4 Before Wash", "R4 After Wash", "R4 Fabric/Trims",
      "R5 Color", "R5 Fit Date", "R5 Comments Date", "R5 Received", "R5 Before Wash", "R5 After Wash", "R5 Fabric/Trims"
    ];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#f3f4f6").setFontWeight("bold");
  }

  try {
    if (sheet.getMaxColumns() < 72) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 72 - sheet.getMaxColumns());
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
        sheet.getRange(1, cIdx)
          .setValue(photoHeaders[colKey])
          .setBackground(isSample ? "#fef3c7" : "#e0e7ff")
          .setFontWeight("bold");
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
    if (String(ids[i][0]).trim().toLowerCase() === targetId) return i + 1;
  }
  return -1;
}

function findRowByStyle(sheet, styleNo, modelName) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var targetStyle = String(styleNo).trim().toLowerCase();
  var targetModel = modelName ? String(modelName).trim().toLowerCase() : "";
  var data = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    var mName = String(data[i][0]).trim().toLowerCase();
    var sNo = String(data[i][2]).trim().toLowerCase();
    if (sNo === targetStyle && (!targetModel || mName === targetModel)) {
      return i + 2;
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
  if (!recipient || (!data.link && !data.responseUrl)) return ContentService.createTextOutput("Missing recipient or link").setMimeType(ContentService.MimeType.TEXT);
  var link = data.link || data.responseUrl;
  var round = data.round || "1";
  var subject = "Action Required: Fit Comments for Style " + (data.styleNo || "New") + " (Round " + round + ")";

  // Check if sample photo is available
  var samplePhotoBlock = "";
  var samplePhotoUrl = data.samplePhotoUrl || (data.samplePhoto && data.samplePhoto.url) || "";
  if (samplePhotoUrl) {
    samplePhotoBlock = 
      "<div style='margin: 20px 0; padding: 18px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; text-align: center;'>" +
        "<p style='margin: 0 0 10px 0; font-size: 12px; font-weight: bold; color: #4338ca; text-transform: uppercase; letter-spacing: 0.5px;'>📸 Product Sample Garment Photo</p>" +
        "<a href='" + samplePhotoUrl + "' target='_blank' style='display: inline-block;'>" +
          "<img src='" + samplePhotoUrl + "' alt='Sample Garment' style='max-width: 260px; max-height: 220px; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); display: block; margin: 0 auto;' />" +
        "</a>" +
        "<p style='margin: 10px 0 0 0; font-size: 11px; color: #64748b;'>Style: <b>" + (data.styleNo || '-') + "</b> • Size: <b>" + (data.size || '-') + "</b> • Color: <b>" + (data.color || '-') + "</b></p>" +
        "<p style='margin: 4px 0 0 0; font-size: 10px; color: #94a3b8;'>(Click photo to inspect in full resolution)</p>" +
      "</div>";
  }

  var htmlBody = "<div style='font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;'>" +
    "<div style='background-color:#4f46e5;padding:30px;text-align:center;color:white;'>" +
      "<h1 style='margin:0;font-size:24px;'>Fit Feedback Required</h1>" +
      "<p style='margin:10px 0 0;opacity:0.9;'>Round " + round + " Request</p>" +
    "</div>" +
    "<div style='padding:30px;background-color:white;'>" +
      "<p style='font-size:15px;color:#1e293b;'>Hello <strong>" + (data.modelName || "Model") + "</strong>,</p>" +
      "<p style='font-size:14px;color:#475569;line-height:1.6;'>A new sample garment has been assigned to you for fit feedback. Please test the fit, wash stability, and fabric trims:</p>" +
      samplePhotoBlock +
      "<div style='text-align:center;margin:30px 0;'>" +
        "<a href='" + link + "' style='background-color:#4338ca;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;font-size:14px;'>Open Fit Feedback Form</a>" +
      "</div>" +
      "<p style='font-size:11px;color:#94a3b8;text-align:center;'>This is an automated notification from SOIE Sample Fit Management.</p>" +
    "</div></div>";

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: htmlBody,
    replyTo: data.senderEmail,
    name: (data.senderName || "Fit Comment System")
  });
  return ContentService.createTextOutput("Email Sent").setMimeType(ContentService.MimeType.TEXT);
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
          Logger.log("[INFO] Resolved email using Name Lookup fallback for \"" + modelName + "\" => \"" + modelEmail + "\"");
        } else {
          var errorMsg = "Skipping Row " + (r + 1) + ": Column " + REMIND_CONFIG.EMAIL_COL + " contains invalid email format (\"" + modelEmail + "\"), and no fallback is configured for \"" + modelName + "\"";
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
          detailedMsg += "\n\n💡 IMPORTANT SOLUTIONS TO MAKE IT WORK:\n" +
            "--------------------------------------------------\n" +
            "👉 SOLUTION 1 (RECOMMENDED & EASIEST - 100% SUCCESS):\n" +
            "Share this Google Sheet with \"" + REMIND_CONFIG.SENDER_FROM + "\" as an EDITOR.\n" +
            "Then, open the sheet while logged in as \"" + REMIND_CONFIG.SENDER_FROM + "\" and run the reminders! This works immediately with ZERO setup.\n\n" +
            "👉 SOLUTION 2 (ALIAS METHOD):\n" +
            "If running while logged into your current account, go to Gmail Settings &rarr; 'Accounts and Import' &rarr; 'Send mail as' &rarr; Click 'Add another email address' and add \"" + REMIND_CONFIG.SENDER_FROM + "\". Verify it via OTP, then try again.";
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
    ui.alert('Scan Completed!\nNo candidate rows matched eligibility conditions today for ' + roundConfig.name + '.\n\nRules applied:\n- Column ' + REMIND_CONFIG.TRIGGER_DATE_COL + ' (Date) contains a value\n- Tracking Column ' + statusColLetter + ' is completely empty');
  } else {
    var summaryMessage = targetRow !== null ? 
      'Reminder Sent Successfully for Row ' + targetRow + ' (' + roundConfig.name + '):\n\n' +
      '✅ Email Sent: ' + sentCount + '\n' +
      'Row ' + targetRow + ' Column ' + statusColLetter + ' is now marked with status tracking mark & Indian date stamp.' :
      'Reminder System Dispatched Successfully for ' + roundConfig.name + ':\n\n' +
      '✅ Emails Sent: ' + sentCount + '\n' +
      '❌ Skipped / Issues: ' + errorCount + '\n\n' +
      'Sent models now have Column ' + statusColLetter + ' stamped with "' + roundConfig.statusMark + ' [Indian Timestamp]"' +
      ' to protect candidate from duplicate triggers.';
    ui.alert('Done', summaryMessage, ui.ButtonSet.OK);
  }
}

/**
 * Prints helpful alerts to configure spreadsheet columns layout
 */
function showHelpLayoutGuide() {
  var guide = "Candidate alignment tracker help:\n\n" +
                "- Column " + REMIND_CONFIG.NAME_COL + " : Model Name (Dear Name)\n" +
                "- Column " + REMIND_CONFIG.EMAIL_COL + " : Type of Sample (Automatic fallbacks configured)\n" +
                "- Column " + REMIND_CONFIG.TRIGGER_DATE_COL + " : Validation Date H\n\n" +
                "ROUND SPECIFIC COLOR COLUMNS:\n" +
                "- 1st Round Color Column: G (Tracking AZ)\n" +
                "- 2nd Round Color Column: O (Tracking BA)\n" +
                "- 3rd Round Color Column: W (Tracking BB)\n" +
                "- 4th Round Color Column: AE (Tracking BC)\n" +
                "- 5th Round Color Column: AM (Tracking BE)\n\n" +
                "The script automatically stamps successful executions with the precise Date & Indian Standard Time!";
  SpreadsheetApp.getUi().alert('App-script Column Grid Guide\n\n' + guide);
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

  // If the custom "from" is the same as the active user, we MUST send directly (without "from" field) 
  // to avoid "Gmail operation not allowed" errors from Google.
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
  throw new Error("All email delivery methods failed!\n\nDetails:\n- " + errors.join("\n- "));
}
