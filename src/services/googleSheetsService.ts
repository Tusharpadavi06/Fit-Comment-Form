/**
 * Service to handle Google Sheets integration.
 * To use this, create a Google App Script web app and provide the URL in Settings secrets.
 */

export const DEFAULT_SHEET_ID = "1fQs5F2OGhZOgdSIvpMnmHOEZDfjYqQUt";

export async function saveToGoogleSheets(data: any) {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID || "1cBuUaoIh_-uWnwmtijsEX2JcZGTbhNirbVdQXjKyQ2o";

  if (!webhookUrl) {
    console.error("GOOGLE SHEETS ERROR: Missing VITE_GOOGLE_SHEETS_WEBHOOK_URL");
    return { success: false, message: "Go to Settings > Secrets and add VITE_GOOGLE_SHEETS_WEBHOOK_URL" };
  }

  const payload = {
    ...data,
    sheetId: sheetId,
    timestamp: new Date().toLocaleDateString('en-GB') + " " + new Date().toLocaleTimeString('en-GB')
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    
    return { success: true };
  } catch (error) {
    console.error("GOOGLE SHEETS ERROR:", error);
    return { success: false, error: String(error) };
  }
}
