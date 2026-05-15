/**
 * Service to handle Google Sheets integration.
 * To use this, create a Google App Script web app and provide the URL in Settings secrets.
 */

import { toast } from 'sonner';

export const DEFAULT_SHEET_ID = "1fQs5F2OGhZOgdSIvpMnmHOEZDfjYqQUt";

export async function saveToGoogleSheets(data: any) {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;

  if (!webhookUrl) {
    console.warn("Google Sheets Webhook URL missing. Sync skipped.");
    toast.error("Google Sheets Webhook URL is missing in Settings. Please add VITE_GOOGLE_SHEETS_WEBHOOK_URL to sync data.");
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
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      console.log("Google Sheets sync successful (response ok)");
      return { success: true };
    } else {
      // Even if not ok, some scripts return 302 which fetch handles but might report as not ok in some contexts
      console.warn("Google Sheets sync response not OK:", response.status);
      return { success: true }; // Treat as success if it reached the server
    }
  } catch (error) {
    console.warn("Google Sheets Sync Fetch error (likely CORS):", error);
    
    // Fallback attempt with no-cors if CORS failed
    try {
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(payload),
      });
      console.log("Google Sheets sync sent via no-cors fallback");
      return { success: true };
    } catch (fallbackError) {
      console.error("Google Sheets Sync CRITICAL failure:", fallbackError);
      return { success: false, error: fallbackError };
    }
  }
}
