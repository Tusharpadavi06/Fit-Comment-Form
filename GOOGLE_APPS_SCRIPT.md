# Google Apps Script for SOIE Fit Comment System & Photos Sync

This guide provides the complete, working code for **`Snapped.gs`** to fix photo thumbnails in Google Sheets (**Columns BI to BM**), enable **Instant High-Res Zoom on Click (No Google Drive Folders!)**, and sync all comments.

---

## 🔍 NEW: Direct "Click-to-Zoom" Photo Viewer (Drive Open Hone Ki Jagah Zoom)

Pehle Google Sheets me photo pe click karne se Google Drive ka folder ya file open hoti thi. 
Ab naye **`Snapped.gs`** me 2 powerful zoom options hain:

1. **Click on Cell -> Instant Zoom Lightbox:**
   - Jab aap Column BI se BM me kisi bhi photo thumbnail pe click karenge, to Google Drive ka folder khulne ke bajay ek **High-Definition Photo Zoom Lightbox Viewer** open hoga.
   - **Features:**
     - 🔍 **Mousewheel Zoom:** Mouse scroll karke photo ko kitna bhi zoom-in ya zoom-out karein.
     - ✋ **Drag to Pan:** Zoom karne ke baad photo ko drag karke har stitch, fabric seam aur detail dekhein.
     - ⤢ **Fit to Screen & 1:1 HD:** 1 click me original high resolution view.
     - ⟳ **Rotate Image:** Photo ko rotate kar sakte hain.
     - 🖼️ **Bottom Thumbnail Strip:** Us round ke saare 1 se 10 photos neeche thumbnail strip me dikhte hain, kisi bhi photo pe click karke turant switch kar sakte hain.
     - ❌ **No Google Drive UI:** Koi Drive login ya folder structure browse karne ki zarurat nahi!

2. **Google Sheets ke Andar hi Dialog Popup (In-Sheet Dialog):**
   - Google Sheets ke top menu bar me **`📸 Fit Photos`** menu automatically add ho jayega!
   - Kisi bhi cell (BI-BM) ko select karein aur menu me click karein:
     - **`📸 Fit Photos` > `🔍 Zoom Selected Photo (In-Sheet Dialog)`**
   - Spreadsheet ke andar hi bina koi naya tab khole zoom modal open ho jayega!

---

## ⚠️ Important Note on `Code.gs` vs `Snapped.gs`

In Google Apps Script, all `.gs` files in the same project share the **same global namespace**.
If **both** `Code.gs` and `Snapped.gs` have `function doPost(e)`, Google Apps Script gets confused and executes whichever was loaded first/last, which prevents `Snapped.gs` from running!

### ✅ How to avoid collision without losing `Code.gs`:
1. Open your Google Sheet > **Extensions** > **Apps Script**.
2. Open `Code.gs`:
   - Change line 1 from:
     ```javascript
     function doPost(e) {
     ```
     to:
     ```javascript
     function doPost_original(e) {
     ```
   *(This ensures your original `Code.gs` remains completely safe and untouched, but won't block `Snapped.gs`)*
3. Open `Snapped.gs`:
   - Replace all its content with the **Complete `Snapped.gs` Code** below.
   - Click **Save** (disk icon).
4. Run `testRun()`:
   - In the toolbar dropdown next to the "Debug" button, select **`testRun`** and click **Run**.
   - If prompted, click **Review Permissions** > **Allow**.
5. Deploy:
   - Click **Deploy** > **New Deployment** (or Manage Deployments > Edit > New Version).
   - Type: **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy** and copy the new **Web app URL**.
   - Paste that URL into AI Studio Settings (`VITE_GOOGLE_SHEETS_WEBHOOK_URL`).

---

## 📜 Complete Working Code for `Snapped.gs`

```javascript
/**
 * Snapped.gs - SOIE Fit Comment & Multi-Photo Snapshots Sync
 * 
 * Features:
 * 1. Handles 1 to 10 photos per round.
 * 2. Uploads all individual photos + composite grid thumbnail to Google Drive.
 * 3. Uses official Google CDN URL (https://lh3.googleusercontent.com/d/FILE_ID) for =IMAGE() so photos ALWAYS display inside Google Sheets cells.
 * 4. Wraps image in =HYPERLINK() pointing to Instant Photo Zoom Lightbox (NO Google Drive folders!).
 * 5. Adds In-Sheet Zoom Dialog menu: "📸 Fit Photos > 🔍 Zoom Selected Photo (In-Sheet Dialog)".
 * 6. Adds Cell Notes with direct high-resolution zoom links to all individual photos (Photo 1 to 10).
 * 7. Target Columns:
 *    - Round 1: Column BI (61)
 *    - Round 2: Column BJ (62)
 *    - Round 3: Column BK (63)
 *    - Round 4: Column BL (64)
 *    - Round 5: Column BM (65)
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
    
    // 5. Find or create the row
    var assignmentId = data.assignmentId || data.id;
    var row = -1;
    
    // ALWAYS search for existing record if assignmentId is present (crucial for updating multi-round evaluations)
    if (assignmentId) {
      row = findRowByAssignmentId(sheet, assignmentId);
    }
    
    // Fallback: search by Style Number and Model Name if not matched by ID
    if (row === -1 && data.styleNo) {
      row = findRowByStyleAndModel(sheet, data.styleNo, data.modelName);
    }
    
    // If still not found, create a new row
    if (row === -1) {
      row = sheet.getLastRow() + 1;
      if (row <= 1) row = 2; // ensure we do not overwrite headers
    }
    
    // 6. Map and write standard columns
    var round = String(data.round || "1");
    
    // Base Assignment Metadata (Cols A to F)
    updateCell(sheet, row, "A", data.timestamp || new Date());
    updateCell(sheet, row, "B", data.modelName);
    updateCell(sheet, row, "C", data.sampleType || (round + (round === '1' ? 'st' : round === '2' ? 'nd' : round === '3' ? 'rd' : 'th') + " Fit Sample"));
    updateCell(sheet, row, "D", data.styleNo);
    updateCell(sheet, row, "E", data.description);
    updateCell(sheet, row, "F", data.size);
    
    // Assignment ID in Column AX (Column 50)
    if (assignmentId) {
      updateCell(sheet, row, "AX", assignmentId);
    }
    
    // Dynamic Round Evaluation Columns
    var roundColMap = {
      "1": { color: "G", given: "H", commDate: "I", recvDate: "J", beforeWash: "K", afterWash: "L", fabric: "M" },
      "2": { color: "O", given: "P", commDate: "Q", recvDate: "R", beforeWash: "S", afterWash: "T", fabric: "U" },
      "3": { color: "W", given: "X", commDate: "Y", recvDate: "Z", beforeWash: "AA", afterWash: "AB", fabric: "AC" },
      "4": { color: "AE", given: "AF", commDate: "AG", recvDate: "AH", beforeWash: "AI", afterWash: "AJ", fabric: "AK" },
      "5": { color: "AM", given: "AN", commDate: "AO", recvDate: "AP", beforeWash: "AQ", afterWash: "AR", fabric: "AS" }
    };
    
    var cols = roundColMap[round];
    if (cols) {
      if (data.color) updateCell(sheet, row, cols.color, data.color);
      if (data.givenDate) updateCell(sheet, row, cols.given, data.givenDate);
      if (data.commentsDate) updateCell(sheet, row, cols.commDate, data.commentsDate);
      if (data.receivedDate) updateCell(sheet, row, cols.recvDate, data.receivedDate);
      if (data.beforeWashRating || data.beforeWash) updateCell(sheet, row, cols.beforeWash, data.beforeWashRating || data.beforeWash);
      if (data.afterWashRating || data.afterWash) updateCell(sheet, row, cols.afterWash, data.afterWashRating || data.afterWash);
      if (data.fabricTrims) updateCell(sheet, row, cols.fabric, data.fabricTrims);
    }
    
    // 7. Multi-Photo Snapshots Upload & Direct-Zoom =IMAGE() Embed (Columns BI to BM)
    handleAttachments(data, sheet, row, round);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      row: row,
      message: "Row " + row + " updated successfully with Fit Comment & Photo Snapshots!"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log("doPost Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Uploads all attached photos (1 to 10 photos) to Google Drive
 * and embeds a click-to-zoom formula directly into columns BI to BM.
 */
function handleAttachments(data, sheet, rowIndex, round) {
  var photoColMap = {
    "1": "BI", // Col 61
    "2": "BJ", // Col 62
    "3": "BK", // Col 63
    "4": "BL", // Col 64
    "5": "BM"  // Col 65
  };

  var colLetter = photoColMap[round];
  if (!colLetter) return;
  var colIdx = colNameToIndex(colLetter);

  var hasAttachments = (data.collageAttachment && data.collageAttachment.data) ||
                       (data.allImages && data.allImages.length > 0) ||
                       (data.attachments && data.attachments.length > 0) ||
                       (data.images && data.images.length > 0);

  if (!hasAttachments) return;

  // 1. Get or create parent folder
  var parentFolder = getOrCreatePhotoFolder(data.driveFolderId);
  var cleanStyle = (data.styleNo || "UnknownStyle").replace(/[^a-zA-Z0-9_-]/g, "_");
  var folderName = cleanStyle + "_R" + round + "_FitPhotos";
  
  // 2. Create subfolder for this style and round
  var targetFolder = null;
  var existingFolders = parentFolder.getFoldersByName(folderName);
  if (existingFolders.hasNext()) {
    targetFolder = existingFolders.next();
  } else {
    targetFolder = parentFolder.createFolder(folderName);
  }
  try {
    targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  var imageToEmbedUrl = null;
  var primaryViewUrl = null;
  var cFileId = null;
  var photoViewLinks = [];

  // 3. Upload Composite Grid Thumbnail (if provided)
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
      
      cFileId = cFile.getId();
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
      var note = "📸 Fit Photos (" + totalPhotos + " Photos Attached):\n";
      note += "👉 CLICK CELL TO ZOOM PHOTO DIRECTLY!\n\n";
      for (var k = 0; k < photoViewLinks.length; k++) {
        note += "• Photo " + (k + 1) + " (Zoom): " + photoViewLinks[k].zoomUrl + "\n";
      }
      note += "\n• Interactive Gallery: " + zoomDestinationUrl;
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
      return folders.next();
    }
    var created = DriveApp.createFolder("SOIE_Fit_Attachments");
    try {
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}
    return created;
  } catch (err) {
    Logger.log("Folder creation error: " + err.message);
    return DriveApp.getRootFolder();
  }
}

function getSheetWithHeaders(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  if (sheet.getLastRow() === 0) {
    var headers = [
      "Timestamp", "Model Name", "Type of Sample", "Style No", "Description", "Size",
      "R1 Color", "R1 Given Date", "R1 Comments Date", "R1 Recv Date", "R1 Before Wash", "R1 After Wash", "R1 Fabric/Trims",
      "R1 Status",
      "R2 Color", "R2 Given Date", "R2 Comments Date", "R2 Recv Date", "R2 Before Wash", "R2 After Wash", "R2 Fabric/Trims",
      "R2 Status",
      "R3 Color", "R3 Given Date", "R3 Comments Date", "R3 Recv Date", "R3 Before Wash", "R3 After Wash", "R3 Fabric/Trims",
      "R3 Status",
      "R4 Color", "R4 Given Date", "R4 Comments Date", "R4 Recv Date", "R4 Before Wash", "R4 After Wash", "R4 Fabric/Trims",
      "R4 Status",
      "R5 Color", "R5 Given Date", "R5 Comments Date", "R5 Recv Date", "R5 Before Wash", "R5 After Wash", "R5 Fabric/Trims"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
    sheet.setFrozenRows(1);
  }
  
  // Ensure Column AX header exists for ID tracking
  var axIndex = colNameToIndex("AX");
  if (sheet.getMaxColumns() < axIndex) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), axIndex - sheet.getMaxColumns());
  }
  var axCell = sheet.getRange(1, axIndex);
  if (!axCell.getValue()) {
    axCell.setValue("Assignment ID").setFontWeight("bold").setBackground("#e0e7ff");
  }

  // Ensure Columns BI to BM headers exist for Photo Snapshots
  var bmIndex = colNameToIndex("BM");
  if (sheet.getMaxColumns() < bmIndex) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), bmIndex - sheet.getMaxColumns());
  }

  var photoHeaders = [
    { col: "BI", title: "R1 Photos" },
    { col: "BJ", title: "R2 Photos" },
    { col: "BK", title: "R3 Photos" },
    { col: "BL", title: "R4 Photos" },
    { col: "BM", title: "R5 Photos" }
  ];

  photoHeaders.forEach(function(h) {
    var cIdx = colNameToIndex(h.col);
    var cell = sheet.getRange(1, cIdx);
    if (!cell.getValue()) {
      cell.setValue(h.title).setFontWeight("bold").setBackground("#dcfce7");
    }
  });

  return sheet;
}

function findRowByAssignmentId(sheet, targetId) {
  if (!targetId) return -1;
  var cleanTarget = String(targetId).trim().toLowerCase();
  var axIndex = colNameToIndex("AX");
  
  if (sheet.getMaxColumns() < axIndex) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  var ids = sheet.getRange(2, axIndex, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim().toLowerCase() === cleanTarget) {
      return i + 2;
    }
  }
  return -1;
}

function findRowByStyleAndModel(sheet, styleNo, modelName) {
  if (!styleNo) return -1;
  var targetStyle = String(styleNo).trim().toLowerCase();
  var targetModel = modelName ? String(modelName).trim().toLowerCase() : "";
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  var data = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
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
}

// Automatically adds menu in Google Sheets for instant in-sheet photo zoom
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("📸 Fit Photos")
      .addItem("🔍 Zoom Selected Photo (In-Sheet Dialog)", "showPhotoZoomDialog")
      .addItem("🌐 Open Photo Zoom Viewer", "openPhotoZoomInNewTab")
      .addToUi();
  } catch (e) {}
}

// 1. Opens an interactive full-screen popup dialog right inside Google Sheets (No new tab!)
function showPhotoZoomDialog() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var cell = sheet.getActiveCell();
  var formula = cell.getFormula() || "";
  var note = cell.getNote() || "";
  
  var fileId = "";
  var match = formula.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/) ||
              formula.match(/[?&]zoom=([a-zA-Z0-9_-]+)/) ||
              note.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
              
  if (match && match[1]) {
    fileId = match[1];
  }
  
  var folderId = "";
  var folderMatch = formula.match(/[?&]folder=([a-zA-Z0-9_-]+)/) ||
                    note.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    folderId = folderMatch[1];
  }
  
  if (!fileId && !folderId) {
    SpreadsheetApp.getUi().alert("No fit photo found in this cell.\n\nPlease select a cell in Columns BI, BJ, BK, BL, or BM that contains a photo thumbnail.");
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
  
  var match = formula.match(/=HYPERLINK\("([^"]+)"/) ||
              formula.match(/(https:\/\/[^",\s\)]+)/) ||
              note.match(/(https:\/\/[^\s\)]+)/);
              
  if (match && match[1]) {
    var url = match[1];
    var html = "<script>window.open('" + url + "', '_blank'); google.script.host.close();</script>" +
               "<div style='font-family:sans-serif;padding:20px;text-align:center;'>Opening Photo Zoom Viewer...</div>";
    var htmlOutput = HtmlService.createHtmlOutput(html).setWidth(300).setHeight(100);
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, "Opening Zoom...");
  } else {
    SpreadsheetApp.getUi().alert("Please select a photo cell in Columns BI-BM.");
  }
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
    '</script></body></html>';
  return html;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

---

## 📊 Complete Column Mapping Reference

| Column Name | Col # | Data / Function |
| :--- | :--- | :--- |
| **Col A** | 1 | Timestamp |
| **Col B** | 2 | Model Name |
| **Col C** | 3 | Type of Sample (e.g. 1st Fit Sample) |
| **Col D** | 4 | Style No (e.g. SOIE-BR-1042) |
| **Col E** | 5 | Description |
| **Col F** | 6 | Size (e.g. 34B) |
| **Col G to M** | 7–13 | **Round 1 Evaluation**: Color (G), Given Date (H), Comments Date (I), Received Date (J), Before Wash (K), After Wash (L), Fabric/Trims (M) |
| **Col O to U** | 15–21 | **Round 2 Evaluation**: Color (O), Given Date (P), Comments Date (Q), Received Date (R), Before Wash (S), After Wash (T), Fabric/Trims (U) |
| **Col W to AC**| 23–29 | **Round 3 Evaluation**: Color (W), Given Date (X), Comments Date (Y), Received Date (Z), Before Wash (AA), After Wash (AB), Fabric/Trims (AC) |
| **Col AE to AK**| 31–37 | **Round 4 Evaluation**: Color (AE), Given Date (AF), Comments Date (AG), Received Date (AH), Before Wash (AI), After Wash (AJ), Fabric/Trims (AK) |
| **Col AM to AS**| 39–45 | **Round 5 Evaluation**: Color (AM), Given Date (AN), Comments Date (AO), Received Date (AP), Before Wash (AQ), After Wash (AR), Fabric/Trims (AS) |
| **Col AX** | 50 | **Assignment ID**: Unique Supabase ID for persistent multi-round row matching |
| **Col BI** | 61 | **R1 Photo Snapshot**: Embeds `=IMAGE(...)` photo thumbnail linked to **Instant Photo Zoom Lightbox** |
| **Col BJ** | 62 | **R2 Photo Snapshot**: Embeds `=IMAGE(...)` photo thumbnail linked to **Instant Photo Zoom Lightbox** |
| **Col BK** | 63 | **R3 Photo Snapshot**: Embeds `=IMAGE(...)` photo thumbnail linked to **Instant Photo Zoom Lightbox** |
| **Col BL** | 64 | **R4 Photo Snapshot**: Embeds `=IMAGE(...)` photo thumbnail linked to **Instant Photo Zoom Lightbox** |
| **Col BM** | 65 | **R5 Photo Snapshot**: Embeds `=IMAGE(...)` photo thumbnail linked to **Instant Photo Zoom Lightbox** |
