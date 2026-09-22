/**
 * Service to handle Google Sheets integration.
 * To use this, create a Google App Script web app and provide the URL in Settings secrets.
 */

import { toast } from 'sonner';

export const DEFAULT_SHEET_ID = "1fQs5F2OGhZOgdSIvpMnmHOEZDfjYqQUt";

export async function testGoogleSheetsWebhook(): Promise<{ success: boolean; message: string }> {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    return { success: false, message: "VITE_GOOGLE_SHEETS_WEBHOOK_URL is not set in environment settings." };
  }
  try {
    const res = await fetch(webhookUrl, { method: "GET" });
    if (res.status === 404) {
      return { success: false, message: "Webhook returned 404: The Google Apps Script is not deployed or has expired." };
    }
    const text = await res.text();
    if (text.includes("Page not found") || text.includes("Sorry, unable to open the file")) {
      return { success: false, message: "Google Drive returned 'Page not found'. Ensure deployment is set to 'Execute as: Me' and 'Who has access: Anyone'." };
    }
    return { success: true, message: `Webhook reachable (HTTP ${res.status}): ${text.slice(0, 80)}` };
  } catch (err: any) {
    // Attempt no-cors fetch to test reachability
    return { success: false, message: `Fetch error: ${err.message || 'Network error'}. Check deployment access permissions.` };
  }
}

export async function saveToGoogleSheets(data: any) {
  const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;

  if (!webhookUrl) {
    console.warn("Google Sheets Webhook URL missing. Sync skipped.");
    toast.error("Google Sheets Webhook URL is missing in Settings. Please add VITE_GOOGLE_SHEETS_WEBHOOK_URL to sync data.");
    return { success: false, error: "Missing webhook URL" };
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
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      const respText = await response.text();
      console.log("Google Sheets sync successful (response ok):", respText);
      if (respText.includes("Error:") || respText.includes("Page not found")) {
        console.warn("Google Sheets script returned error inside body:", respText);
        return { success: false, error: respText };
      }
      return { success: true, response: respText };
    } else {
      if (response.status === 404) {
        console.error("Google Sheets Webhook returned 404. Web App is not active or URL has expired.");
        return { success: false, error: "Google Apps Script Webhook returned 404 (Not Found). Please redeploy the Apps Script and update the Webhook URL." };
      }
      console.warn("Google Sheets sync response status:", response.status);
      return { success: true };
    }
  } catch (error: any) {
    console.warn("Google Sheets Sync Fetch error (trying no-cors fallback):", error);
    
    // Fallback attempt with no-cors if CORS failed
    try {
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
      });
      console.log("Google Sheets sync sent via no-cors fallback");
      return { success: true };
    } catch (fallbackError: any) {
      console.error("Google Sheets Sync CRITICAL failure:", fallbackError);
      return { success: false, error: fallbackError?.message || fallbackError };
    }
  }
}
