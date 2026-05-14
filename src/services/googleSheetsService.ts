/**
 * Service to handle Google Sheets integration.
 * To use this, create a Google App Script web app and provide the URL in Settings secrets.
 */

export const DEFAULT_SHEET_ID = "1fQs5F2OGhZOgdSIvpMnmHOEZDfjYqQUt";

export async function saveToGoogleSheets(data: any) {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;

  if (!webhookUrl) {
    console.warn("Google Sheets Webhook URL missing. Sync skipped.");
    return { success: false };
  }

  const payload = {
    ...data,
    sheetId: sheetId,
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  };

  console.log("Sending payload to Google Sheets:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });
    
    console.log("Fetch request sent to Google Sheets Webhook");
    return { success: true };
  } catch (error) {
    console.error("Google Sheets Sync Error:", error);
    return { success: false, error };
  }
}
