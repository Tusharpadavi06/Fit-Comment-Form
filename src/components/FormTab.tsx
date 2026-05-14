import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Plus, Trash2, Send, Loader2, Info, RefreshCw, User } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { getSeriesFromStyleNumber } from '../lib/series-utils';
import { v4 as uuidv4 } from 'uuid';
import { saveToGoogleSheets } from '../services/googleSheetsService';
import { db, auth, safeFirestoreWrite, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from '../lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';

interface ModelListItem {
  id: string;
  name: string;
  email: string;
}

interface AssignmentRow {
  id: string;
  modelId: string;
  modelName: string;
  modelEmail: string;
  color: string;
  size: string;
  givenForFitDate: string;
  round1Data?: any;
  round2Data?: any;
  round3Data?: any;
}

interface FormTabProps {
  key?: string;
  modelPool: ModelListItem[];
  loadingModels: boolean;
  refreshModels: () => Promise<void>;
}

export function FormTab({ modelPool, loadingModels, refreshModels }: FormTabProps) {
  const [typeOfSample, setTypeOfSample] = useState('');
  const [styleNo, setStyleNo] = useState('');
  const [description, setDescription] = useState('');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [sharedColor, setSharedColor] = useState('');
  const [sharedSize, setSharedSize] = useState('');
  const [sharedFitDate, setSharedFitDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [currentRound, setCurrentRound] = useState('1');
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Listen for Auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser: any) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Update all assignments when shared details change
  useEffect(() => {
    if (assignments.length > 0) {
      setAssignments(prev => prev.map(a => ({
        ...a,
        color: sharedColor || a.color,
        size: sharedSize || a.size,
        givenForFitDate: sharedFitDate || a.givenForFitDate
      })));
    }
  }, [sharedColor, sharedSize, sharedFitDate]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success("Signed in successfully");
    } catch (error) {
      console.error("Login failed:", error);
      toast.error("Cloud not sign in with Google");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success("Signed out");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Fetch existing data if in edit mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const submissionId = params.get('submissionId');
    const round = params.get('round') || '1';

    if (mode === 'edit' && submissionId) {
      setEditMode(true);
      setCurrentRound(round);
      setExistingSubmissionId(submissionId);
      loadExistingSubmission(submissionId, round);
    }
  }, [modelPool]);

  const loadExistingSubmission = async (id: string, round: string) => {
    setLoadingData(true);
    try {
      console.log(`Loading submission: ${id} for Round ${round}`);
      
      // 1. Try Supabase for Submission
      const { data: sub, error: subErr } = await supabase
        .from('submissions')
        .select('id, style_number, type_of_sample, description, series, submitted_by')
        .eq('id', id)
        .maybeSingle();
      
      // 2. Try Supabase for Assignments
      const { data: ass, error: assErr } = await supabase
        .from('assignments')
        .select('id, model_id, model_name, model_email, color, size, round1, round2, round3')
        .eq('submission_id', id);

      if (subErr) console.log("Supabase sub fetch error ignored:", subErr.message);
      if (assErr) console.log("Supabase ass fetch error ignored:", assErr.message);

      // Firestore Fallback if any Supabase fetch failed or returned nothing
      let finalSub: any = sub;
      let finalAss: any = ass;

      if (!finalSub) {
        console.log("Firestore fallback for submission...");
        const subDoc = await getDoc(doc(db, 'submissions', id));
        if (subDoc.exists()) {
          const d = subDoc.data();
          finalSub = {
            id: d.id,
            type_of_sample: d.type_of_sample,
            style_number: d.style_number,
            description: d.description,
            series: d.series,
            submitted_by: d.submitted_by
          };
        }
      }

      if (!finalAss || finalAss.length === 0) {
        console.log("Firestore fallback for assignments...");
        const q = query(collection(db, 'assignments'), where('submission_id', '==', id));
        const querySnapshot = await getDocs(q);
        const docs: any[] = [];
        querySnapshot.forEach((doc) => {
          const d = doc.data();
          docs.push({
            id: d.id,
            model_id: d.model_id,
            model_name: d.model_name,
            model_email: d.model_email,
            color: d.color,
            size: d.size,
            given_for_fit_date: d.given_for_fit_date,
            round1: d.round1,
            round2: d.round2,
            round3: d.round3
          });
        });
        finalAss = docs;
      }

      // Populate state
      if (finalSub) {
        setTypeOfSample(finalSub.type_of_sample || '');
        setStyleNo(finalSub.style_number || '');
        setDescription(finalSub.description || '');
      }

      if (finalAss && finalAss.length > 0) {
        console.log(`Found ${finalAss.length} assignments for this submission`);
        const mappedAssignments = finalAss.map((a: any) => {
          const r1 = a.round1 || {};
          const r2 = a.round2 || {};
          const r3 = a.round3 || {};
          
          // Use current round color if available, otherwise fallback to main color
          let currentColor = a.color || '';
          if (round === '1') currentColor = r1.color || a.color || '';
          if (round === '2') currentColor = r2.color || a.color || '';
          if (round === '3') currentColor = r3.color || a.color || '';

          // Use current round date if available
          let currentDate = a.given_for_fit_date || new Date().toLocaleDateString('en-GB');
          if (round === '1') currentDate = r1.given_for_fit_date || currentDate;
          if (round === '2') currentDate = r2.given_for_fit_date || currentDate;
          if (round === '3') currentDate = r3.given_for_fit_date || currentDate;

          // CRITICAL: Ensure model name is present. Fallback to modelPool lookup if db record is missing it.
          let mName = a.model_name || '';
          let mEmail = a.model_email || '';
          
          if (!mName && a.model_id && modelPool.length > 0) {
            const poolModel = modelPool.find(m => m.id === a.model_id);
            if (poolModel) {
              mName = poolModel.name;
              mEmail = poolModel.email;
            }
          }

          // If STILL no name (rare), use a placeholder
          if (!mName) mName = "Assigned Model";

          return {
            id: a.id,
            modelId: a.model_id,
            modelName: mName,
            modelEmail: mEmail,
            color: currentColor,
            size: a.size,
            givenForFitDate: currentDate,
            round1Data: r1,
            round2Data: r2,
            round3Data: r3
          };
        });
        
        if (mappedAssignments.length > 0) {
          setAssignments(mappedAssignments);
        }
      } else {
        console.warn("No assignments found for submission ID:", id);
      }
    } catch (err) {
      console.error("Critical error loading existing submission:", err);
      toast.error("Failed to load existing data");
    } finally {
      setLoadingData(false);
    }
  };

  const toggleModelSelection = (model: ModelListItem) => {
    const isSelected = assignments.some(a => a.modelId === model.id);
    if (isSelected) {
      // Remove if not the last one (or if it's the last one but has data, maybe clear it? But user said separate rows)
      if (assignments.length > 1) {
        setAssignments(assignments.filter(a => a.modelId !== model.id));
      } else {
        // Just clear the fields of the last row
        setAssignments(assignments.map(a => 
          a.modelId === model.id ? { ...a, modelId: '', modelName: '', modelEmail: '', color: '', size: '' } : a
        ));
      }
    } else {
      // Add a new row with this model
      // If there's an empty row, use it first
      const emptyRowIndex = assignments.findIndex(a => !a.modelId);
      if (emptyRowIndex !== -1) {
        setAssignments(assignments.map((a, idx) => 
          idx === emptyRowIndex ? { ...a, modelId: model.id, modelName: model.name, modelEmail: model.email } : a
        ));
      } else {
        setAssignments([...assignments, { 
          id: uuidv4(), 
          modelId: model.id, 
          modelName: model.name, 
          modelEmail: model.email, 
          color: sharedColor, 
          size: sharedSize, 
          givenForFitDate: sharedFitDate 
        }]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in with Google first');
      return;
    }

    if (!typeOfSample || !styleNo || !description) {
      toast.error('Please fill in all basic fields');
      return;
    }

    const validAssignments = assignments.filter(a => a.modelId && a.color && a.size);
    if (validAssignments.length === 0) {
      toast.error('Please add at least one valid model assignment');
      return;
    }

    const toastId = toast.loading(editMode ? `Updating and notifying models for Round ${currentRound}...` : 'Submitting form and notifying models...');
    setSubmitting(true);
    try {
      const submissionId = existingSubmissionId || uuidv4();
      const series = getSeriesFromStyleNumber(styleNo);
      
      // Determine the base URL for links
      // Priority: 1. Environment variable (VITE_APP_URL), 2. Current origin (Shared App URL)
      let appBaseUrl = window.location.origin;
      const envAppUrl = import.meta.env.VITE_APP_URL;

      // Log for debugging (visible in console)
      if (envAppUrl) {
        console.log("VITE_APP_URL is defined:", envAppUrl);
        if (envAppUrl !== 'undefined' && envAppUrl.length > 5) {
          appBaseUrl = envAppUrl;
        }
      }
      
      // Cleanup trailing slash
      if (appBaseUrl.endsWith('/')) {
        appBaseUrl = appBaseUrl.slice(0, -1);
      }
      
      const modelFeedbackBaseUrl = appBaseUrl; 
      console.log("Using base URL for links:", modelFeedbackBaseUrl);
        
      const userEmail = user.email || 'Admin'; 

      // Links for the Google Sheet (Admin edit remains on this app)
      const editR1Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&round=1`;
      const editR2Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&round=2`;
      const editR3Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&round=3`;
      
      // 1. Save submission to Supabase
      console.log("Saving submission to Supabase Submissions table:", submissionId);
      const subPayload: any = {
        id: submissionId,
        style_number: styleNo,
        type_of_sample: typeOfSample,
        description: description,
        series: series || 'General',
        submitted_by: userEmail,
        status: 'active'
      };

      const { error: subError } = await supabase
        .from('submissions')
        .upsert(subPayload);

      if (subError) {
        console.error("Supabase Submissions Save Failed:", subError);
        
        // If it failed because of "status" column, retry without it
        if (subError.message.toLowerCase().includes('column "status"')) {
          console.log("Retrying submission save without 'status' column...");
          const { status, ...fallbackPayload } = subPayload;
          const { error: retryError } = await supabase
            .from('submissions')
            .upsert(fallbackPayload);
          
          if (retryError) {
            console.error("Supabase Submissions Retry Failed:", retryError);
          } else {
            console.log("Supabase Submissions Retry Successful (without status column)");
          }
        } else if (!subError.message.toLowerCase().includes('schema cache')) {
          toast.error("Submissions Table Error: " + subError.message);
        }
      } else {
        console.log("Supabase Submissions Save successful");
      }

      // 1b. Firebase Save (Backup)
      safeFirestoreWrite(async () => {
        await setDoc(doc(db, 'submissions', submissionId), {
          id: submissionId,
          style_number: styleNo,
          type_of_sample: typeOfSample,
          description: description,
          series: series,
          submitted_by: userEmail,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      // 2. Prepare Assignments and save to Firestore
      const assignmentsWithLinks = validAssignments.map(a => {
        // Models use the feedback VIEW on this app
        const r1Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${a.id}&round=1`;
        const r2Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${a.id}&round=2`;
        const r3Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${a.id}&round=3`;
        return {
          ...a,
          r1Link,
          r2Link,
          r3Link
        };
      });

      // 2b. Firebase Save Assignments (Critical for ModelResponseView)
      safeFirestoreWrite(async () => {
        for (const a of assignmentsWithLinks) {
          await setDoc(doc(db, 'assignments', a.id), {
            id: a.id,
            submission_id: submissionId,
            model_id: a.modelId,
            model_name: a.modelName,
            model_email: a.modelEmail,
            color: a.color,
            size: a.size,
            given_for_fit_date: a.givenForFitDate,
            r1_link: a.r1Link,
            r2_link: a.r2Link,
            r3_link: a.r3Link,
            last_updated: serverTimestamp()
          }, { merge: true });
        }
      });

      // 3. Save Assignments to Supabase
      console.log(`Saving ${assignmentsWithLinks.length} assignments to Supabase...`);
      const assignmentsToInsert = assignmentsWithLinks.map(a => {
        const payload: any = {
          id: a.id,
          submission_id: submissionId,
          model_id: a.modelId,
          model_name: a.modelName,
          model_email: a.modelEmail,
          color: a.color,
          size: a.size
        };

        // Initialize the JSONB round data if currentRound corresponds
        // Using the keys expected by the user's schema provided in chat
        if (currentRound === '1') {
          payload.round1 = { ...(a.round1Data || {}), color: a.color, given_for_fit_date: a.givenForFitDate };
        } else if (currentRound === '2') {
          payload.round2 = { ...(a.round2Data || {}), color: a.color, given_for_fit_date: a.givenForFitDate };
        } else if (currentRound === '3') {
          payload.round3 = { ...(a.round3Data || {}), color: a.color, given_for_fit_date: a.givenForFitDate };
        }

        return payload;
      });

      const { error: assError } = await supabase.from('assignments').upsert(assignmentsToInsert);
      
      if (assError) {
        console.error("Supabase Assignments Save Failed:", assError);
        // Special case: ignore schema cache warnings
        if (!assError.message.toLowerCase().includes('schema cache')) {
          console.error("DEBUG - Full AssError:", JSON.stringify(assError));
          // If specific column error, inform the user
          if (assError.message.includes("column")) {
             console.warn("Schema mismatch detected in Assignments table. Please check your columns.");
          }
        }
      } else {
        console.log("Supabase Assignments Save successful");
      }

      // 4. Sync to Google Sheets (In parallel for better performance)
      const sheetSyncs = assignmentsWithLinks.map(async (a) => {
        try {
          const adminEditR2Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${a.id}&round=2`;
          const adminEditR3Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${a.id}&round=3`;

          const payload: any = {
            type: editMode ? 'UPDATE_SUBMISSION' : 'NEW_SUBMISSION',
            assignmentId: a.id,
            submissionId: submissionId,
            modelName: a.modelName,
            modelEmail: a.modelEmail,
            sampleType: typeOfSample,
            styleNo: styleNo.trim(),
            description: description,
            size: a.size,
            color: a.color,
            round: currentRound,

            // Column letters for the script's mapping
            "B": a.modelName || "",
            "C": typeOfSample || "",
            "D": styleNo.trim() || "",
            "E": description || "",
            "F": a.size || "",
            // Round-specific initializations
            ...(currentRound === '1' ? {
              "G": a.color || "",
              "H": a.givenForFitDate || ""
            } : {}),
            ...(currentRound === '2' ? {
              "O": a.color || "",
              "P": a.givenForFitDate || ""
            } : {}),
            ...(currentRound === '3' ? {
              "W": a.color || "",
              "X": a.givenForFitDate || ""
            } : {}),
            givenForFitDate: a.givenForFitDate,

            // Shared links
            link: currentRound === '2' ? a.r2Link : (currentRound === '3' ? a.r3Link : a.r1Link),
            r2Link: currentRound === '2' ? a.r2Link : "",
            r3Link: currentRound === '3' ? a.r3Link : "",
            
            // Map Assignment ID to AX (50) for the script
            // Helpful human-readable fields
            "Style No": styleNo.trim(),
            "Model Name": a.modelName,
            "Round": String(currentRound),
            
            // Link for the Model feedback form
            responseUrl: currentRound === '2' ? a.r2Link : (currentRound === '3' ? a.r3Link : a.r1Link),
            tabName: series || "General",
            triggerEmail: true,
            senderEmail: userEmail,
            timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            
            // Map Assignment ID to AX (50) for the script
            "AX": a.id
          };
          return await saveToGoogleSheets(payload);
        } catch (e) {
          console.error("Sheet Sync Err for", a.modelName, e);
          return { success: false };
        }
      });

      await Promise.all(sheetSyncs);


      setLastSubmission({
        id: submissionId,
        assignments: assignmentsWithLinks,
        type: typeOfSample,
        style: styleNo,
        round: currentRound,
        isUpdate: editMode
      });

      if (!editMode) {
        setTypeOfSample('');
        setStyleNo('');
        setDescription('');
        setSharedColor('');
        setSharedSize('');
        setSharedFitDate(new Date().toLocaleDateString('en-GB'));
        setAssignments([]);
      }

      toast.success(editMode ? `Round ${currentRound} Sent!` : 'Submission Successful!', { id: toastId });

    } catch (error: any) {
      console.error("Form submission error:", error);
      toast.error(error.message || 'Failed to submit form', { id: toastId });
    } finally {
      setSubmitting(false);
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
              Supabase credentials are not set. Please add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to your environment variables.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (lastSubmission) {
    const isUpdate = lastSubmission.isUpdate;
    const round = lastSubmission.round;
    
    return (
      <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="overflow-hidden border-t-0 shadow-sm">
          <div className={`h-2.5 ${isUpdate ? 'bg-amber-500' : 'bg-green-500'} w-full`}></div>
          <CardHeader className="pt-6 pb-4">
            <CardTitle className="text-3xl font-normal text-slate-900 tracking-tight">
              {isUpdate ? `Round ${round} Updated!` : 'Submission Successful!'}
            </CardTitle>
            <CardDescription className="text-sm text-slate-600 mt-2">
              {isUpdate 
                ? `The fit request has been updated for Round ${round}. Models have been notified with the new link.`
                : 'Your fit request has been recorded. The models listed below have been notified.'}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-medium text-slate-800 border-b pb-2">Assigned Model Links</h3>
              {lastSubmission.assignments.map((a: any) => (
                <div key={a.id} className="p-4 border rounded-lg bg-slate-50/50 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-900 block">{a.modelName}</span>
                      <p className="text-[10px] text-slate-500">{a.modelEmail}</p>
                    </div>
                    <Badge variant="secondary" className="bg-white border text-[10px] font-bold uppercase">{a.color} • {a.size}</Badge>
                  </div>
                  
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs mb-4">
            <p className="font-bold flex items-center gap-1 mb-1">
              <Info className="w-3 h-3" /> Important: 403 Forbidden Error?
            </p>
            <p>If models see a 403 error, make sure you are using the <strong>Shared App URL</strong> (from the Share menu) and not the development URL.</p>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-200/50">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 1 (Main Response)</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={a.r1Link} className="text-[10px] bg-white h-8" />
                        <Button size="sm" variant="outline" className="h-8 shrink-0 text-[10px]" onClick={() => window.open(a.r1Link, '_blank')}>Open</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 2 Link</Label>
                        <div className="flex gap-1">
                          <Input readOnly value={a.r2Link} className="text-[9px] bg-white h-7" />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(a.r2Link); toast.success("Copied R2"); }}>📋</Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-slate-400 font-bold uppercase">Round 3 Link</Label>
                        <div className="flex gap-1">
                          <Input readOnly value={a.r3Link} className="text-[9px] bg-white h-7" />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(a.r3Link); toast.success("Copied R3"); }}>📋</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-start gap-4">
            <Button variant="ghost" className="text-primary" onClick={() => setLastSubmission(null)}>
              Submit another response
            </Button>
            {lastSubmission.round !== '3' && (
              <Button variant="outline" className="text-slate-600 border-slate-200" onClick={() => {
                const nextRound = String(Number(lastSubmission.round) + 1);
                window.location.search = `?mode=edit&submissionId=${lastSubmission.id}&round=${nextRound}`;
              }}>
                Initiate Round {Number(lastSubmission.round) + 1}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full mx-auto pb-10">
      {editMode && (
        <div className="space-y-4">
          <Card className="bg-primary/5 border-primary/20 shadow-sm overflow-hidden">
            <div className="h-1 bg-primary w-full"></div>
            <CardContent className="pt-6 pb-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                    <RefreshCw className="w-5 h-5" />
                    Round Selection
                  </h3>
                  <p className="text-xs text-slate-500">Initiating a new round will generate a fresh response link for the model.</p>
                </div>
                <div className="flex gap-2 bg-white p-1 rounded-lg border shadow-sm self-stretch md:self-auto">
                  {['1', '2', '3'].map((r) => (
                    <Button 
                      key={r}
                      type="button"
                      variant={currentRound === r ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setCurrentRound(r);
                        // Update URL without reload to keep experience smooth, but FormTab's mount logic might not trigger
                        // since we use key={window.location.search} in App.tsx, we SHOULD update search params
                        const url = new URL(window.location.href);
                        url.searchParams.set('round', r);
                        window.history.pushState({}, '', url);
                        
                        // Manually trigger reload for the new round
                        if (existingSubmissionId) {
                          loadExistingSubmission(existingSubmissionId, r);
                        }
                      }}
                      className={`flex-1 md:w-20 rounded-md transition-all ${currentRound === r ? 'shadow-md' : ''}`}
                    >
                      Round {r}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="py-2 flex items-center justify-between">
              <p className="text-xs font-medium text-amber-800">
                <Badge variant="outline" className="mr-2 bg-amber-100 border-amber-300 uppercase">EDIT MODE</Badge>
                Updating Style <strong>{styleNo}</strong>. Submit to record data and notify models.
              </p>
              <Button variant="ghost" size="sm" onClick={() => {
                window.history.pushState({}, '', window.location.origin);
                setEditMode(false);
                setCurrentRound('1');
                setTypeOfSample('');
                setStyleNo('');
                setDescription('');
                setSharedColor('');
                setSharedSize('');
                setSharedFitDate(new Date().toLocaleDateString('en-GB'));
                setAssignments([]);
              }} className="text-amber-700 hover:bg-amber-100">Cancel</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Auth Section */}
      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardContent className="py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {user.displayName?.[0] || user.email?.[0] || 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{user.displayName || 'Authenticated User'}</p>
                  <p className="text-[10px] text-slate-500">{user.email}</p>
                </div>
              </>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Sign in required</p>
                  <p className="text-[10px] text-slate-500">Please sign in to capture your email and notify models.</p>
                </div>
              </>
            )}
          </div>
          {user ? (
            <Button variant="outline" size="sm" onClick={handleLogout} className="h-8 text-[11px]">Sign Out</Button>
          ) : (
            <Button onClick={handleLogin} size="sm" className="h-9 px-6 font-medium">Sign in with Google</Button>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-4 relative">
        {loadingData && (
          <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-xl min-h-[400px]">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-slate-600 font-medium animate-pulse">Loading previous round data...</p>
          </div>
        )}
        {/* Sample Type Card - Hidden in Edit Mode for focus */}
        {!editMode && (
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Label className="text-base font-normal text-slate-900">
                  Type of Sample <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input 
                  placeholder="e.g. Proto / Fit / PPS" 
                  value={typeOfSample} 
                  onChange={e => setTypeOfSample(e.target.value)}
                  className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none"
                  required
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Style No Card - Read only in Edit Mode */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">
                Style Number <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input 
                placeholder="e.g. CB-101" 
                value={styleNo} 
                onChange={e => setStyleNo(e.target.value)}
                readOnly={editMode}
                className={`border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none ${editMode ? 'opacity-70 font-semibold' : ''}`}
                required
              />
              {styleNo && !editMode && (
                <p className="text-[10px] text-slate-400 italic mt-1">
                  Will be saved in Sheet Tab: <span className="text-primary font-medium">{getSeriesFromStyleNumber(styleNo) || "General"}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Assignment Section - MOVED UP in Edit Mode to see models first */}
        <div className="space-y-4 pt-2">
          {!editMode && (
            <Card className="shadow-sm border-dashed border-2 bg-slate-50/30">
              <CardHeader className="py-4 px-6 pb-2">
                <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  Select Models for Assignment
                </CardTitle>
                <CardDescription className="text-[10px]">Click models to add or remove them from this request.</CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-2">
                {loadingModels ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                    <span className="text-[10px] text-slate-400 font-medium">Fetching model pool...</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {modelPool.map(model => {
                      const isSelected = assignments.some(a => a.modelId === model.id);
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => toggleModelSelection(model)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                            isSelected 
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' 
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                          }`}
                        >
                          {model.name}
                          {isSelected && <Plus className="w-3 h-3 rotate-45" />}
                        </button>
                      );
                    })}
                    {modelPool.length === 0 && (
                      <p className="text-xs text-slate-400 italic">No models available. Add them in the Models Tab.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-medium text-slate-800">
              {editMode ? `Round ${currentRound} Details` : 'Model Details & Assignments'}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
                {assignments.filter(a => a.modelId).length} Models Assigned
              </Badge>
            </div>
          </div>

          {assignments.length > 0 && (
            <Card className="shadow-sm border-indigo-100 bg-indigo-50/20">
              <CardHeader className="py-4 px-6 border-b border-indigo-50">
                <CardTitle className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Common Details (Applies to all models)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 py-6 pt-6">
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Global Date Given (H)</Label>
                    <Input 
                      placeholder="DD/MM/YYYY" 
                      value={sharedFitDate} 
                      onChange={e => setSharedFitDate(e.target.value)}
                      className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-600 transition-all h-10 bg-transparent text-base font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Global Color</Label>
                    <Input 
                      placeholder="e.g. Navy" 
                      value={sharedColor} 
                      onChange={e => setSharedColor(e.target.value)}
                      className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-600 transition-all h-10 bg-transparent text-base font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Global Size</Label>
                    <Input 
                      placeholder="e.g. Medium" 
                      value={sharedSize} 
                      onChange={e => setSharedSize(e.target.value)}
                      className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-600 transition-all h-10 bg-transparent text-base font-medium"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {assignments.length > 0 ? (
              <Card className="shadow-sm border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3 pl-6">Model Info</TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">
                        {editMode ? "Date Given" : "Date"}
                      </TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">
                        {editMode ? `Round ${currentRound} Color` : "Color"}
                      </TableHead>
                      <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">Size</TableHead>
                      {!editMode && <TableHead className="w-10 py-3"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((row) => (
                      <TableRow key={row.id} className={`${!row.modelId ? 'hidden' : ''} hover:bg-slate-50/30 transition-colors`}>
                        <TableCell className="py-4 pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{row.modelName || 'Unknown Model'}</span>
                            <span className="text-[10px] text-slate-400">{row.modelEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {editMode ? (
                            <Input 
                              value={row.givenForFitDate} 
                              onChange={e => {
                                const newAss = assignments.map(a => a.id === row.id ? { ...a, givenForFitDate: e.target.value } : a);
                                setAssignments(newAss);
                              }}
                              className="border-0 border-b border-slate-100 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-500 h-8 bg-transparent text-sm w-32"
                            />
                          ) : (
                            <span className="text-sm font-medium text-slate-600">{row.givenForFitDate || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {editMode ? (
                            <div className="space-y-1">
                              <Input 
                                value={row.color} 
                                onChange={e => {
                                  const newAss = assignments.map(a => a.id === row.id ? { ...a, color: e.target.value } : a);
                                  setAssignments(newAss);
                                }}
                                className="border-0 border-b border-indigo-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-indigo-500 h-8 bg-transparent text-sm font-bold text-slate-900 w-32"
                              />
                              {currentRound !== '1' && row.round1Data?.color && (
                                <p className="text-[9px] text-slate-400 italic">R1: {row.round1Data.color}</p>
                              )}
                              {currentRound === '3' && row.round2Data?.color && (
                                <p className="text-[9px] text-slate-400 italic">R2: {row.round2Data.color}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-slate-600">{row.color || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <span className="text-sm font-medium text-slate-600">{row.size || '-'}</span>
                        </TableCell>
                        {!editMode && (
                          <TableCell className="py-4 pr-4 text-right">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon"
                              onClick={() => {
                                const model = modelPool.find(m => m.id === row.modelId);
                                if (model) toggleModelSelection(model);
                              }}
                              className="h-8 w-8 text-slate-300 hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <div className="text-center py-8 border-2 border-dashed rounded-xl bg-slate-50/50">
                <User className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Please select models above to begin assignment.</p>
              </div>
            )}
          </div>
        </div>

        {/* Description Card */}
        <Card className={`shadow-sm ${editMode ? 'border-primary/20' : ''}`}>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">
                Instructions / Description <span className="text-destructive ml-0.5">*</span>
              </Label>
              <textarea 
                rows={3}
                placeholder="Enter specific instructions or details..."
                className="w-full border-0 border-b border-slate-200 rounded-none px-0 focus-visible:outline-none focus-visible:border-primary transition-all bg-transparent text-base resize-none py-2"
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-8 px-1 overflow-hidden">
          {!editMode ? (
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => {
                if (confirm('Are you sure you want to clear the form?')) {
                  setTypeOfSample('');
                  setStyleNo('');
                  setDescription('');
                  setSharedColor('');
                  setSharedSize('');
                  setSharedFitDate(new Date().toLocaleDateString('en-GB'));
                  setAssignments([]);
                }
              }}
              className="text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
            >
              Clear form
            </Button>
          ) : <div />}

          <Button type="submit" size="lg" className="px-8 h-10 font-medium" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {editMode ? 'Updating...' : 'Submitting...'}
              </>
            ) : (
              editMode ? `Submit Round ${currentRound} & Notify Model` : 'Submit'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
