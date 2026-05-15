import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { db, safeFirestoreWrite } from '../lib/firebase';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Loader2, CheckCircle2, Info, Calendar as CalendarIcon, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { saveToGoogleSheets } from '../services/googleSheetsService';
import { getSeriesFromStyleNumber } from '../lib/series-utils';

interface ModelResponseViewProps {
  submissionId: string;
  assignmentId: string;
  round: string;
}

export function ModelResponseView({ submissionId, assignmentId, round }: ModelResponseViewProps) {
  const [submissionData, setSubmissionData] = useState<any>(null);
  const [assignmentData, setAssignmentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [receivedDate, setReceivedDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [commentsReceivedDate, setCommentsReceivedDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [givenForFitDate, setGivenForFitDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [beforeWash, setBeforeWash] = useState('');
  const [afterWash, setAfterWash] = useState('');
  const [fabricTrims, setFabricTrims] = useState('');
  const [color, setColor] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!submissionId || !assignmentId) {
        setLoading(false);
        return;
      }
      
      try {
        const sId = (submissionId || "").trim();
        let aId = (assignmentId || "").trim();
        
        // Sanitize aId - strip 'new-' prefix if present from old links
        if (aId.startsWith('new-')) {
          aId = aId.substring(4);
        }
        
        console.log("Fetching matching data for Style:", sId, "Assignment:", aId, "Round:", round);
        
        if (!sId || !aId) {
          setError("Malformed link. Submission or Assignment ID missing.");
          setLoading(false);
          return;
        }

        let subData: any = null;
        let assData: any = null;

      // 1. Try Firestore FIRST (Primary source in this env)
      const firestoreAId = aId;
      let firestoreFailed = false;
      try {
        console.log("Attempting Firestore fetch for:", sId, firestoreAId);
        const subRef = doc(db, 'submissions', sId);
        const assRef = doc(db, 'assignments', firestoreAId);
        
        const [subDoc, assDoc] = await Promise.all([
          getDoc(subRef).catch(e => { console.warn("Firestore Sub error:", e); firestoreFailed = true; return null; }),
          getDoc(assRef).catch(e => { console.warn("Firestore Ass error:", e); firestoreFailed = true; return null; })
        ]);
        
        if (subDoc && subDoc.exists()) {
          const d = subDoc.data();
          subData = { id: subDoc.id, ...d };
          console.log("Firestore submission found");
        }
        
        if (assDoc && assDoc.exists()) {
          const d = assDoc.data();
          assData = { id: assDoc.id, ...d };
          console.log("Firestore assignment found");
        }
      } catch (fe: any) {
        console.warn("Firestore fetch issue (handled):", fe.message);
        firestoreFailed = true;
      }

        // 2. Try Supabase if Firestore missed something or failed
        if (!subData || !assData || firestoreFailed) {
          try {
            console.log("Checking Supabase for IDs:", sId, aId);
            if (!subData) {
              const { data: sList, error: sErr } = await supabase
                .from('submissions')
                .select('*')
                .eq('id', sId);
              
              if (sList && sList.length > 0) {
                subData = sList[0];
                console.log("Supabase submission found");
              } else if (sErr) {
                console.warn("Supabase sub fetch error:", sErr);
              }
            }

            if (!assData && aId) {
              // Priority 1: Fetch by Assignment ID
              console.log("Fetching assignment by ID:", aId);
              const { data: aList, error: aErr } = await supabase
                .from('assignments')
                .select('*')
                .eq('id', aId);

              if (aList && aList.length > 0) {
                assData = aList[0];
                console.log("Supabase assignment found by ID");
              } else {
                if (aErr) console.warn("Supabase assignment fetch error:", aErr);
                
                // Priority 2: Fallback - Fetch by submission_id if we have it and ID lookup failed
                if (sId) {
                   console.log("Fallback: searching for assignment by submission_id:", sId);
                   const { data: fallbackList } = await supabase
                     .from('assignments')
                     .select('*')
                     .eq('submission_id', sId)
                     .limit(10);
                   
                   if (fallbackList && fallbackList.length > 0) {
                     // Try to match by assignmentId if it was a row index or partial match
                     assData = fallbackList.find(a => a.id === aId) || fallbackList[0];
                     console.log("Supabase assignment found via submission fallback");
                   }
                }
              }
            }
          } catch (se: any) {
            console.log("Supabase fetch exception:", se.message);
          }
        }
        
        // Final fallback: Ensure keys are accessible via both snake_case and camelCase
        if (subData) {
          subData.style_number = subData.style_number || subData.styleNo || subData.styleNumber;
          subData.type_of_sample = subData.type_of_sample || subData.sampleType || subData.typeOfSample;
          setSubmissionData(subData);
        }
        
        if (assData) {
          assData.model_name = assData.model_name || assData.modelName;
          assData.model_email = assData.model_email || assData.modelEmail;
          setAssignmentData(assData);
        }

        if (!subData && !assData) {
           setError("Data not found. Link may be invalid or not yet updated across databases.");
        }

      } catch (error) {
        console.error("Critical fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [submissionId, assignmentId, round]);

  // Refactored Prefill Logic (Triggers when assignmentData is loaded)
  useEffect(() => {
    if (!assignmentData) return;

    console.log("Analyzing assignment data for pre-fills:", assignmentData.id);
    
    // 1. Color handled separately per round if round > 1
    if (assignmentData.color && !color) {
      setColor(assignmentData.color);
    }
    
    // Support per-round color pre-fill if available
    const currentRoundKeys = [`round${round}`, `round_${round}`];
    for (const key of currentRoundKeys) {
      if (assignmentData[key]?.color && !color) {
        setColor(assignmentData[key].color);
      }
    }
    
    // 2. Given for Fit Date
    if (assignmentData.given_for_fit_date) {
      setGivenForFitDate(assignmentData.given_for_fit_date);
    } else {
      for (const key of currentRoundKeys) {
        if (assignmentData[key]?.given_for_fit_date) {
          setGivenForFitDate(assignmentData[key].given_for_fit_date);
        }
      }
    }
    
    // Fallback to Round 1 given date if still empty
    if (!givenForFitDate && (assignmentData.round1?.given_for_fit_date || assignmentData.round_1?.given_for_fit_date)) {
      setGivenForFitDate(assignmentData.round1?.given_for_fit_date || assignmentData.round_1?.given_for_fit_date);
    }

    // 3. Round-specific prefills (Round 2 or 3)
    const roundNumVal = parseInt(round) || 1;
    if (roundNumVal > 1) {
      const prevRoundNum = roundNumVal - 1;
      const dataValue = assignmentData[`round${prevRoundNum}`] || assignmentData[`round_${prevRoundNum}`];
      
      if (dataValue) {
        console.log(`Pre-filling from Round ${prevRoundNum} data`, dataValue);
        if (dataValue.before_wash || dataValue.beforeWash) setBeforeWash(dataValue.before_wash || dataValue.beforeWash);
        if (dataValue.after_wash || dataValue.afterWash) setAfterWash(dataValue.after_wash || dataValue.afterWash);
        if (dataValue.fabric_trims || dataValue.fabricTrims || dataValue.fabricComments) {
          setFabricTrims(dataValue.fabric_trims || dataValue.fabricTrims || dataValue.fabricComments);
        }
        if (dataValue.given_for_fit_date || dataValue.givenForFitDate) {
          setGivenForFitDate(dataValue.given_for_fit_date || dataValue.givenForFitDate);
        }
        if (dataValue.received_date || dataValue.receivedDate) {
          setReceivedDate(dataValue.received_date || dataValue.receivedDate);
        }
        if (dataValue.comments_received_date || dataValue.commentsReceivedDate) {
          setCommentsReceivedDate(dataValue.comments_received_date || dataValue.commentsReceivedDate);
        }
      }
    }
  }, [assignmentData, round]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    const sId = (submissionId || '').trim();
    const aId = (assignmentId || '').trim();

    console.log("Submitting response for round:", round, "sId:", sId, "aId:", aId);

    try {
      if (!assignmentData || !submissionData) {
        throw new Error("Form data not loaded properly. Please refresh and try again.");
      }

      // Show success state early
      setCompleted(true);
      toast.success('Submission Successful!');

      // Firebase Save
      safeFirestoreWrite(async () => {
        const fbRoundKey = `round_${round}`;
        await updateDoc(doc(db, 'assignments', aId), {
          [fbRoundKey]: {
            given_for_fit_date: givenForFitDate,
            received_date: receivedDate,
            comments_received_date: commentsReceivedDate,
            before_wash: beforeWash,
            after_wash: afterWash,
            fabric_trims: fabricTrims,
            color: color || assignmentData.color || assignmentData.modelColor,
            submitted_at: serverTimestamp()
          },
          last_updated: serverTimestamp()
        });
      });

      // 1b. Supabase Update (Sync round data to Supabase)
      try {
        if (assignmentId) {
          const supabaseRoundKey = `round${round}`; // round1, round2, round3
          const roundData = {
            fit_date: receivedDate,
            given_for_fit_date: givenForFitDate,
            comments_received_date: commentsReceivedDate,
            before_wash: beforeWash,
            after_wash: afterWash,
            fabric_trims: fabricTrims,
            color: color || assignmentData.color || assignmentData.modelColor,
            submitted_at: new Date().toISOString()
          };
          
          console.log(`Updating Supabase Assignment ${assignmentId} for Round ${round}...`);
          
          const { error: updErr } = await supabase
            .from('assignments')
            .update({ [supabaseRoundKey]: roundData })
            .eq('id', assignmentId);
          
          if (updErr) {
            console.error("Supabase Assignment Update Error:", updErr);
            // Don't toast error to model unless it's critical, but log it
          } else {
            console.log("Supabase Assignment Update successful");
          }
        }
      } catch (suErr) {
        console.warn("Supabase round update exception:", suErr);
      }

      // 2. Google Sheets Save
      const userEmail = assignmentData.model_email || assignmentData.modelEmail || 'model@example.com'; 
      const userName = assignmentData.model_name || assignmentData.modelName || userEmail;
      const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;
      
      // Determine absolute preference for VITE_APP_URL
      let appBaseUrl = window.location.origin;
      const envAppUrl = import.meta.env.VITE_APP_URL;
      
      console.log("ModelView: DEBUG - VITE_APP_URL:", envAppUrl);
      
      if (envAppUrl && envAppUrl !== 'undefined' && envAppUrl.length > 5) {
        console.log("ModelView: Using VITE_APP_URL priority:", envAppUrl);
        appBaseUrl = envAppUrl;
      }
      
      if (appBaseUrl.endsWith('/')) {
        appBaseUrl = appBaseUrl.slice(0, -1);
      }
      
      const modelFeedbackBaseUrl = appBaseUrl;
      console.log("ModelView: Final base URL for links:", modelFeedbackBaseUrl);
      
      // Links for the Google Sheet
      const resR1Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=1`;
      const resR2Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=2`;
      const resR3Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=3`;
      const resR4Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=4`;
      const resR5Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=5`;
      
      const adminEditR1Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=1`;
      const adminEditR2Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=2`;
      const adminEditR3Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=3`;
      const adminEditR4Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=4`;
      const adminEditR5Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=5`;

      const series = getSeriesFromStyleNumber(submissionData.style_number || submissionData.styleNo || "");

      const sheetPayload = {
        assignmentId: assignmentId,
        submissionId: submissionId,
        sheetId: sheetId,
        tabName: series || "General",
        senderEmail: userEmail,
        timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        round: String(round),
        color: color || assignmentData.color || "",
        givenForFitDate: givenForFitDate,
        receivedDate: receivedDate,
        received_date: receivedDate,
        commentsDate: commentsReceivedDate,
        commentsReceivedDate: commentsReceivedDate,
        comments_received_date: commentsReceivedDate,
        beforeWash: beforeWash,
        before_wash: beforeWash,
        afterWash: afterWash,
        after_wash: afterWash,
        fabricComments: fabricTrims,
        fabricTrims: fabricTrims,
        fabric_trims: fabricTrims,
        // Removed explicit link from N, V, AD as per user request
        
        // Round 1 (G-M)
        "G": round === "1" ? (color || assignmentData.color || "") : (assignmentData.round1?.color || assignmentData.round_1?.color || ""),
        "H": round === "1" ? (givenForFitDate || "") : (assignmentData.round1?.given_for_fit_date || assignmentData.round_1?.given_for_fit_date || ""),
        "I": round === "1" ? (commentsReceivedDate || "") : (assignmentData.round1?.comments_received_date || assignmentData.round_1?.comments_received_date || ""),
        "J": round === "1" ? (receivedDate || "") : (assignmentData.round1?.received_date || assignmentData.round_1?.received_date || ""),
        "K": round === "1" ? (beforeWash || "") : (assignmentData.round1?.before_wash || assignmentData.round_1?.before_wash || ""),
        "L": round === "1" ? (afterWash || "") : (assignmentData.round1?.after_wash || assignmentData.round_1?.after_wash || ""),
        "M": round === "1" ? (fabricTrims || "") : (assignmentData.round1?.fabric_trims || assignmentData.round_1?.fabric_trims || ""),
        
        // Round 2 (O-U)
        "O": round === "2" ? (color || assignmentData.color || "") : (assignmentData.round2?.color || assignmentData.round_2?.color || ""),
        "P": round === "2" ? (givenForFitDate || "") : (assignmentData.round2?.given_for_fit_date || assignmentData.round_2?.given_for_fit_date || ""),
        "Q": round === "2" ? (commentsReceivedDate || "") : (assignmentData.round2?.comments_received_date || assignmentData.round_2?.comments_received_date || ""),
        "R": round === "2" ? (receivedDate || "") : (assignmentData.round2?.received_date || assignmentData.round_2?.received_date || ""),
        "S": round === "2" ? (beforeWash || "") : (assignmentData.round2?.before_wash || assignmentData.round_2?.before_wash || ""),
        "T": round === "2" ? (afterWash || "") : (assignmentData.round2?.after_wash || assignmentData.round_2?.after_wash || ""),
        "U": round === "2" ? (fabricTrims || "") : (assignmentData.round2?.fabric_trims || assignmentData.round_2?.fabric_trims || ""),

        // Round 3 (W-AC)
        "W": round === "3" ? (color || assignmentData.color || "") : (assignmentData.round3?.color || assignmentData.round_3?.color || ""),
        "X": round === "3" ? (givenForFitDate || "") : (assignmentData.round3?.given_for_fit_date || assignmentData.round_3?.given_for_fit_date || ""),
        "Y": round === "3" ? (commentsReceivedDate || "") : (assignmentData.round3?.comments_received_date || assignmentData.round_3?.comments_received_date || ""),
        "Z": round === "3" ? (receivedDate || "") : (assignmentData.round3?.received_date || assignmentData.round_3?.received_date || ""),
        "AA": round === "3" ? (beforeWash || "") : (assignmentData.round3?.before_wash || assignmentData.round_3?.before_wash || ""),
        "AB": round === "3" ? (afterWash || "") : (assignmentData.round3?.after_wash || assignmentData.round_3?.after_wash || ""),
        "AC": round === "3" ? (fabricTrims || "") : (assignmentData.round3?.fabric_trims || assignmentData.round_3?.fabric_trims || ""),

        // Round 4 (AE-AK)
        "AE": round === "4" ? (color || assignmentData.color || "") : (assignmentData.round4?.color || (assignmentData.round_4?.color || "")),
        "AF": round === "4" ? (givenForFitDate || "") : (assignmentData.round4?.given_for_fit_date || (assignmentData.round_4?.given_for_fit_date || "")),
        "AG": round === "4" ? (commentsReceivedDate || "") : (assignmentData.round4?.comments_received_date || (assignmentData.round_4?.comments_received_date || "")),
        "AH": round === "4" ? (receivedDate || "") : (assignmentData.round4?.received_date || (assignmentData.round_4?.received_date || "")),
        "AI": round === "4" ? (beforeWash || "") : (assignmentData.round4?.before_wash || (assignmentData.round_4?.before_wash || "")),
        "AJ": round === "4" ? (afterWash || "") : (assignmentData.round4?.after_wash || (assignmentData.round_4?.after_wash || "")),
        "AK": round === "4" ? (fabricTrims || "") : (assignmentData.round4?.fabric_trims || (assignmentData.round_4?.fabric_trims || "")),

        // Round 5 (AM-AS)
        "AM": round === "5" ? (color || assignmentData.color || "") : (assignmentData.round5?.color || (assignmentData.round_5?.color || "")),
        "AN": round === "5" ? (givenForFitDate || "") : (assignmentData.round5?.given_for_fit_date || (assignmentData.round_5?.given_for_fit_date || "")),
        "AO": round === "5" ? (commentsReceivedDate || "") : (assignmentData.round5?.comments_received_date || (assignmentData.round_5?.comments_received_date || "")),
        "AP": round === "5" ? (receivedDate || "") : (assignmentData.round5?.received_date || (assignmentData.round_5?.received_date || "")),
        "AQ": round === "5" ? (beforeWash || "") : (assignmentData.round5?.before_wash || (assignmentData.round_5?.before_wash || "")),
        "AR": round === "5" ? (afterWash || "") : (assignmentData.round5?.after_wash || (assignmentData.round_5?.after_wash || "")),
        "AS": round === "5" ? (fabricTrims || "") : (assignmentData.round5?.fabric_trims || (assignmentData.round_5?.fabric_trims || "")),
        
        "Style No": submissionData.style_number || submissionData.styleNo || "",
        "Style Number": submissionData.style_number || submissionData.styleNo || "",
        "Style N": submissionData.style_number || submissionData.styleNo || "",
        "Type of Sample": submissionData.type_of_sample || submissionData.sampleType || "",
        "Sample Type": submissionData.type_of_sample || submissionData.sampleType || "",
        "Model Name": assignmentData.model_name || assignmentData.modelName || "",
        "Model Email": assignmentData.model_email || assignmentData.modelEmail || "",
        "Size": assignmentData.size || "",
        "Color": color || assignmentData.color || "",
        "Round": String(round),
        "Date Sent": submissionData.created_at ? new Date(submissionData.created_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
        "Instructions": submissionData.description || "",
        "Round 2 Edit Link": adminEditR2Link,
        "Round 3 Edit Link": adminEditR3Link,
        "Round 4 Edit Link": adminEditR4Link,
        "Round 5 Edit Link": adminEditR5Link
      };
      
      const sheetResult = await saveToGoogleSheets(sheetPayload);
      if (!sheetResult.success) {
         console.warn("Google Sheets update failed:", sheetResult.error);
         toast.error("Feedback saved locally, but failed to sync to Google Sheet. Please inform the administrator.");
      } else {
         console.log("Feedback successfully synced to Google Sheets");
      }

      // Automate email for next round if responding to Round 1, 2, 3, or 4
      if (parseInt(round) < 5) {
        console.log("Automatically sending next round link via email...");
        handleSendNextRoundLink();
      }

    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error(error.message || 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendNextRoundLink = async () => {
    if (mailing) return;
    setMailing(true);
    
    try {
      const nextRound = parseInt(round) + 1;
      
      // Determine base URL
      let appBaseUrl = window.location.origin;
      const envAppUrl = import.meta.env.VITE_APP_URL;
      
      // Use env URL if set (priority)
      if (envAppUrl && envAppUrl !== 'undefined' && envAppUrl.length > 5) {
        console.log("ModelView: Using VITE_APP_URL for email:", envAppUrl);
        appBaseUrl = envAppUrl;
      }

      if (appBaseUrl.endsWith('/')) {
        appBaseUrl = appBaseUrl.slice(0, -1);
      }
      
      const modelFeedbackBaseUrl = appBaseUrl;
      console.log("ModelView: Mail generation base URL:", modelFeedbackBaseUrl);
      const nextRoundLink = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${assignmentId}&round=${nextRound}`;
      
      const mailPayload = {
        type: 'SEND_MAIL',
        modelEmail: assignmentData.model_email || assignmentData.modelEmail,
        modelName: assignmentData.model_name || assignmentData.modelName,
        email: assignmentData.model_email || assignmentData.modelEmail,
        recipientEmail: assignmentData.model_email || assignmentData.modelEmail,
        recipient_email: assignmentData.model_email || assignmentData.modelEmail,
        recipient: assignmentData.model_email || assignmentData.modelEmail,
        model_email:  assignmentData.model_email || assignmentData.modelEmail,
        senderEmail: submissionData.submitted_by || 'Admin',
        senderName: "Fit System Notification",
        styleNo: submissionData.style_number || submissionData.styleNo,
        round: String(round),
        date: receivedDate,
        beforeWash: beforeWash,
        afterWash: afterWash,
        responseUrl: nextRound < 6 ? nextRoundLink : "",
        link: nextRound < 6 ? nextRoundLink : "", // Adding both link and responseUrl
        tabName: submissionData.series || "General"
      };

      toast.promise(saveToGoogleSheets(mailPayload), {
        loading: 'Sending link to your email...',
        success: 'Email sent successfully!',
        error: 'Failed to send email. You can still use the link columns in the sheet.'
      });
      
    } catch (error) {
      console.error("Mail error:", error);
    } finally {
      setMailing(false);
    }
  };

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Info className="w-5 h-5" />
              Configuration Missing
            </CardTitle>
            <CardDescription>
              Supabase credentials are not set. The administrator needs to configure the application.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center bg-white rounded-xl shadow-sm border mt-10 space-y-4">
        <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
          <Info className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Oops!</h2>
        <p className="text-slate-500">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!submissionData || !assignmentData) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center bg-white rounded-xl shadow-sm border mt-10">
        <p className="text-slate-500">Invalid link or assignment not found.</p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="max-w-lg mx-auto p-12 text-center bg-white rounded-xl shadow-lg border mt-10 space-y-6 animate-in zoom-in-95 duration-300">
        <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Submission Successful!</h2>
          <p className="text-slate-500 font-medium">Thank you! Your feedback for Round {round} has been saved.</p>
          <p className="text-sm text-slate-400">The tracking sheet has been updated automatically.</p>
        </div>
        <div className="pt-4 border-t border-slate-100 italic text-xs text-slate-400">
          You can safely close this tab now.
        </div>
        
        {parseInt(round) < 5 && (
          <Button 
            onClick={handleSendNextRoundLink}
            disabled={mailing}
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100"
          >
            {mailing ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <MessageSquare className="w-5 h-5 mr-2" />
            )}
            Email me Round {parseInt(round) + 1} Link
          </Button>
        )}

        <Button variant="outline" onClick={() => {
          try {
            window.close();
            // Show alert if window.close() is blocked
            setTimeout(() => {
              alert("You can now close this tab manually.");
            }, 500);
          } catch (e) {
            alert("Please close this browser tab.");
          }
        }} className="w-full h-12">
          Close Tab
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header Image and Box */}
      <Card className="border-0 shadow-sm bg-white overflow-hidden">
        <a href="https://ibb.co/dsWLS09q" target="_blank" rel="noopener noreferrer" className="block outline-none">
          <img 
            src="https://i.ibb.co/1Yvd3fV5/Chat-GPT-Image-May-15-2026-11-52-16-AM.png" 
            alt="Intimate Apparel Feedback" 
            className="w-full h-40 object-cover block bg-slate-50 hover:opacity-95 transition-opacity"
            loading="eager"
            referrerPolicy="no-referrer"
          />
        </a>
        <CardHeader className="bg-slate-50/50 border-b">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl font-normal">Bio Model Feedback</CardTitle>
              <CardDescription>Details for style {submissionData.style_number}</CardDescription>
            </div>
            <Badge variant="outline" className="bg-white border-primary/20 text-primary px-3 py-1">
              Round {round}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Model Name</span>
              <p className="font-medium text-sm text-slate-900">{assignmentData.model_name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Type of Sample</span>
              <p className="font-medium text-sm text-slate-900">{submissionData.type_of_sample}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Style No</span>
              <p className="font-medium text-sm text-primary font-mono">{submissionData.style_number}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Size</span>
              <p className="font-medium text-sm text-slate-900">{assignmentData.size}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Color</span>
              <p className="font-medium text-sm text-slate-900">{assignmentData.color}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Date Sent</span>
              <p className="font-medium text-sm text-slate-900">{submissionData.created_at ? new Date(submissionData.created_at).toLocaleDateString('en-GB') : '-'}</p>
            </div>
          </div>
          {submissionData.description && (
            <div className="pt-4 border-t space-y-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Instructions / Description</span>
              <p className="text-sm text-slate-600 italic">"{submissionData.description}"</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Response Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="shadow-lg border-2 border-primary/5">
          <CardHeader className="border-b bg-white">
            <CardTitle className="text-lg">Response Form</CardTitle>
            <CardDescription>Fill in the fitting details below</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-2 text-slate-700 font-bold">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  Sample Given for Fit Date *
                </Label>
                <Input 
                  value={givenForFitDate}
                  onChange={(e) => setGivenForFitDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="border-primary/20 focus:border-primary"
                  required
                />
              </div>
              {parseInt(round) > 1 && (
                <div className="space-y-2 md:col-span-2">
                  <Label className="flex items-center gap-2 text-slate-700 font-bold">
                    <Info className="w-4 h-4 text-primary" />
                    Updated Color for Round {round} *
                  </Label>
                  <Input 
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Enter new color name..."
                    className="border-primary/20 focus:border-primary"
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-slate-700">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  Sample Received Date *
                </Label>
                <Input 
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-slate-700">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Comments Received Date *
                </Label>
                <Input 
                  value={commentsReceivedDate}
                  onChange={(e) => setCommentsReceivedDate(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Fit comments before wash *</Label>
              <Textarea 
                placeholder="Enter comments..." 
                value={beforeWash}
                onChange={(e) => setBeforeWash(e.target.value)}
                className="min-h-[100px] resize-none"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Fit comments after wash *</Label>
              <Textarea 
                placeholder="Enter comments..." 
                value={afterWash}
                onChange={(e) => setAfterWash(e.target.value)}
                className="min-h-[100px] resize-none"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Comments on fabric / trims *</Label>
              <Textarea 
                placeholder="Enter comments..." 
                value={fabricTrims}
                onChange={(e) => setFabricTrims(e.target.value)}
                className="min-h-[100px] resize-none"
                required
              />
            </div>
          </CardContent>
        </Card>

        <Button 
          type="submit" 
          className="w-full h-12 text-lg font-medium shadow-md shadow-primary/20 hover:shadow-lg transition-all"
          disabled={submitting}
        >
          {submitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting Feedback...
            </div>
          ) : (
            "Complete Response"
          )}
        </Button>
      </form>
    </div>
  );
}
