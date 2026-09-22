import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { db, safeFirestoreWrite } from '../lib/firebase';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Loader2, CheckCircle2, Info, Calendar as CalendarIcon, MessageSquare, UploadCloud, X, FileText, Paperclip, Download, Copy, Send, Printer, Eye, EyeOff, ZoomIn, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveToGoogleSheets } from '../services/googleSheetsService';
import { getSeriesFromStyleNumber, getDeterministicId } from '../lib/series-utils';
import { ImageZoomModal } from './ImageZoomModal';
import { 
  SoieFeedbackReportCard, 
  generateSoieReportHtml, 
  getRoundOrdinal, 
  getRoundName, 
  formatDisplayDate 
} from './SoieFeedbackReportCard';

// Helper for Today's date in YYYY-MM-DD format
const getTodayYyyymmdd = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 representation
}

// Helper to convert DD/MM/YYYY to YYYY-MM-DD for native HTML date controls
const ddmmyyyyToYyyymmdd = (dateStr: string): string => {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).trim().toLowerCase();
  if (cleanStr === '' || cleanStr === 'null' || cleanStr === 'undefined' || cleanStr.includes('nan')) return '';
  
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    if (isNaN(Number(day)) || isNaN(Number(month)) || isNaN(Number(year))) {
      return '';
    }
    return `${year}-${month}-${day}`;
  }
  
  // Try parsing ISO or other standard date string
  const t = Date.parse(dateStr);
  if (!isNaN(t)) {
    const d = new Date(t);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  }
  return '';
};

// Helper to convert YYYY-MM-DD back to DD/MM/YYYY for storing in database and sheets
const yyyymmddToDdmmyyyy = (dateStr: string): string => {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).trim().toLowerCase();
  if (cleanStr === '' || cleanStr === 'null' || cleanStr === 'undefined' || cleanStr.includes('nan')) return '';
  
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    if (isNaN(Number(day)) || isNaN(Number(month)) || isNaN(Number(year))) {
      return '';
    }
    return `${day}/${month}/${year}`;
  }
  return '';
};

// Helper to combine images into a composite thumbnail snapshot for spreadsheet cell
async function generateCollageAttachment(attachments: AttachmentItem[]): Promise<{ data: string; name: string } | null> {
  const imageAttachments = attachments.filter(a => a.type?.startsWith('image/') && a.dataUrl);
  if (imageAttachments.length === 0) return null;
  
  if (imageAttachments.length === 1) {
    const primary = imageAttachments[0];
    return {
      data: (primary.dataUrl || '').split(',')[1] || '',
      name: primary.name || 'fit_photo.jpg'
    };
  }

  // Combine up to 10 images into an optimized multi-photo grid snapshot for spreadsheet cell
  try {
    const count = Math.min(imageAttachments.length, 10);
    let cols = 2;
    let rows = 1;
    if (count === 2) { cols = 2; rows = 1; }
    else if (count === 3) { cols = 3; rows = 1; }
    else if (count === 4) { cols = 2; rows = 2; }
    else if (count <= 6) { cols = 3; rows = 2; }
    else if (count <= 9) { cols = 3; rows = 3; }
    else { cols = 5; rows = 2; }

    const cellWidth = 320;
    const cellHeight = 360;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cellWidth;
    canvas.height = rows * cellHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const loadPromises = imageAttachments.slice(0, count).map((att, i) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const colIndex = i % cols;
            const rowIndex = Math.floor(i / cols);
            const x = colIndex * cellWidth;
            const y = rowIndex * cellHeight;

            const scale = Math.max(cellWidth / img.width, cellHeight / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const offsetX = x + (cellWidth - w) / 2;
            const offsetY = y + (cellHeight - h) / 2;
            
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, cellWidth, cellHeight);
            ctx.clip();
            ctx.drawImage(img, offsetX, offsetY, w, h);
            ctx.restore();
            
            // Clean separator borders
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, cellWidth, cellHeight);

            // Sequence badge (1, 2, 3...)
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x + 10, y + 10, 36, 28, 6);
            } else {
              ctx.rect(x + 10, y + 10, 36, 28);
            }
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${i + 1}`, x + 28, y + 24);

            resolve();
          };
          img.onerror = () => resolve();
          img.src = att.dataUrl!;
        });
      });
      
      await Promise.all(loadPromises);

      // Add a high-visibility bottom indicator banner
      const bannerHeight = 36;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      ctx.fillRect(0, canvas.height - bannerHeight, canvas.width, bannerHeight);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`📸 ${count} PHOTOS • CLICK TO OPEN & ZOOM FULL HD`, canvas.width / 2, canvas.height - (bannerHeight / 2));

      const collageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return {
        data: collageDataUrl.split(',')[1] || '',
        name: `composite_${count}_photos.jpg`
      };
    }
  } catch (err) {
    console.warn("Collage generation error, falling back to first image:", err);
  }

  const fallback = imageAttachments[0];
  return {
    data: (fallback.dataUrl || '').split(',')[1] || '',
    name: fallback.name || 'fit_photo.jpg'
  };
}

interface ModelResponseViewProps {
  submissionId: string;
  assignmentId: string;
  round: string;
}

// Helper to retrieve cached or URL-based initial data synchronously (0ms load)
const getInitialFeedbackData = (sIdProp: string, aIdProp: string) => {
  let initialSub: any = null;
  let initialAss: any = null;
  const sId = (sIdProp || '').trim();
  let aId = (aIdProp || '').trim();
  if (aId.startsWith('new-')) aId = aId.substring(4);
  aId = aId.replace(/--/g, '-');

  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const styleNo = urlParams.get('styleNo') || urlParams.get('style_number');
      const sampleType = urlParams.get('sampleType') || urlParams.get('type_of_sample');
      const modelName = urlParams.get('modelName') || urlParams.get('name');
      const modelEmail = urlParams.get('modelEmail') || urlParams.get('email');
      const size = urlParams.get('size');
      const colorParam = urlParams.get('color');
      const givenDate = urlParams.get('givenDate') || urlParams.get('date');

      // 1. Check local key-value caches
      const cachedSubStr = localStorage.getItem(`fit_cache_sub_${sId}`);
      if (cachedSubStr) {
        initialSub = JSON.parse(cachedSubStr);
      }
      const cachedAssStr = localStorage.getItem(`fit_cache_ass_${aId}`);
      if (cachedAssStr) {
        initialAss = JSON.parse(cachedAssStr);
      }
      
      // 2. Check assignment list cache for this submission
      if (!initialAss && sId) {
        const cachedListStr = localStorage.getItem(`fit_cache_ass_list_${sId}`);
        if (cachedListStr) {
          const list = JSON.parse(cachedListStr);
          if (Array.isArray(list) && list.length > 0) {
            const cleanAId = aId.toLowerCase();
            initialAss = list.find((a: any) =>
              a.id === aId ||
              getDeterministicId(sId, a.model_email || a.modelEmail || '') === aId ||
              (a.model_email && cleanAId.includes(a.model_email.toLowerCase().split('@')[0])) ||
              (a.model_name && cleanAId.includes(a.model_name.toLowerCase().replace(/\s/g, '')))
            );
            if (!initialAss && list.length === 1) initialAss = list[0];
          }
        }
      }

      // 3. Check full submissions list cache
      if (!initialSub || !initialAss) {
        const fullCacheStr = localStorage.getItem('fit_submissions_cache');
        if (fullCacheStr) {
          const fullList = JSON.parse(fullCacheStr);
          if (Array.isArray(fullList)) {
            const foundSub = fullList.find((s: any) => s.id === sId || s.style_number === sId);
            if (foundSub) {
              if (!initialSub) initialSub = foundSub;
              if (!initialAss && foundSub.assignments) {
                const cleanAId = aId.toLowerCase();
                initialAss = foundSub.assignments.find((a: any) =>
                  a.id === aId ||
                  getDeterministicId(sId, a.model_email || a.modelEmail || '') === aId ||
                  (a.model_email && cleanAId.includes(a.model_email.toLowerCase().split('@')[0])) ||
                  (a.model_name && cleanAId.includes(a.model_name.toLowerCase().replace(/\s/g, '')))
                );
                if (!initialAss && foundSub.assignments.length === 1) initialAss = foundSub.assignments[0];
              }
            }
          }
        }
      }

      // 4. If URL has query parameters, synthesize or enhance initial values
      if (styleNo || sampleType) {
        initialSub = {
          id: sId,
          style_number: styleNo || initialSub?.style_number || '',
          type_of_sample: sampleType || initialSub?.type_of_sample || '',
          description: initialSub?.description || '',
          series: initialSub?.series || getSeriesFromStyleNumber(styleNo || sId) || 'General',
          ...initialSub
        };
      }
      if (modelName || modelEmail || size || colorParam || givenDate) {
        initialAss = {
          id: aId,
          submission_id: sId,
          model_name: modelName || initialAss?.model_name || '',
          model_email: modelEmail || initialAss?.model_email || '',
          size: size || initialAss?.size || '',
          color: colorParam || initialAss?.color || '',
          given_for_fit_date: givenDate || initialAss?.given_for_fit_date || '',
          ...initialAss
        };
      }

      // 5. Always synthesize optimistic objects if sId or aId exist so the form NEVER blocks on initial render
      if (!initialSub && sId) {
        initialSub = {
          id: sId,
          style_number: styleNo || sId,
          type_of_sample: sampleType || 'Sample Fit',
          description: '',
          series: getSeriesFromStyleNumber(styleNo || sId) || 'General'
        };
      }
      if (!initialAss && aId) {
        initialAss = {
          id: aId,
          submission_id: sId,
          model_name: modelName || 'Model',
          model_email: modelEmail || '',
          size: size || '',
          color: colorParam || '',
          given_for_fit_date: givenDate || ''
        };
      }
    } catch (e) {}
  }

  return { initialSub, initialAss };
};

export function ModelResponseView({ submissionId, assignmentId, round }: ModelResponseViewProps) {
  const initialData = React.useMemo(() => getInitialFeedbackData(submissionId, assignmentId), [submissionId, assignmentId]);
  const [submissionData, setSubmissionData] = useState<any>(initialData.initialSub);
  const [assignmentData, setAssignmentData] = useState<any>(initialData.initialAss);
  const [loading, setLoading] = useState<boolean>(!initialData.initialSub && !initialData.initialAss);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zoom modal state for full-screen photo viewing
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomModalIndex, setZoomModalIndex] = useState(0);

  // Form states
  const [receivedDate, setReceivedDate] = useState('');
  const [commentsReceivedDate, setCommentsReceivedDate] = useState(getTodayYyyymmdd());
  const [givenForFitDate, setGivenForFitDate] = useState('');
  const [beforeWash, setBeforeWash] = useState('');
  const [afterWash, setAfterWash] = useState('');
  const [fabricTrims, setFabricTrims] = useState('');
  const [color, setColor] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);

  // Filter zoomable images from attachments
  const zoomableImages = React.useMemo(() => {
    return attachments
      .filter((a) => (a.dataUrl || (a as any).url) && (!a.type || a.type.startsWith('image/')))
      .map((a) => ({
        id: a.id,
        name: a.name,
        url: a.dataUrl || (a as any).url || '',
        size: a.size,
        type: a.type
      }));
  }, [attachments]);

  const handleOpenZoom = (attIdOrUrl: string) => {
    const idx = zoomableImages.findIndex((img) => img.id === attIdOrUrl || img.url === attIdOrUrl);
    setZoomModalIndex(idx >= 0 ? idx : 0);
    setZoomModalOpen(true);
  };

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!submissionId || !assignmentId) {
        if (isMounted) setLoading(false);
        return;
      }
      
      try {
        const sId = (submissionId || "").trim();
        let aId = (assignmentId || "").trim();
        
        // Sanitize aId - handle prefixes from old links and potential malformed characters
        if (aId.startsWith('new-')) aId = aId.substring(4);
        aId = aId.replace(/--/g, '-');
        
        console.log("[FastLoad] Fetching matching data for Style:", sId, "Assignment:", aId, "Round:", round);
        
        if (!sId || !aId) {
          if (isMounted) {
            setError("Malformed link. Submission or Assignment ID missing.");
            setLoading(false);
          }
          return;
        }

        // 1. Supabase Fast Joined Fetcher (1 Network Trip)
        const fetchSupabase = async () => {
          try {
            if (!supabase) return null;
            
            // Joined query: pulls submission AND all related assignments in 1 fast roundtrip!
            const { data: subWithAss } = await supabase
              .from('submissions')
              .select(`
                *,
                assignments(*)
              `)
              .eq('id', sId)
              .maybeSingle();

            if (subWithAss) {
              const assignmentsList: any[] = subWithAss.assignments || [];
              const sub = { ...subWithAss };
              delete sub.assignments;

              let matchedAss = assignmentsList.find((a: any) => a.id === aId);
              if (!matchedAss && aId) {
                const cleanAId = aId.toLowerCase();
                matchedAss = assignmentsList.find((a: any) => 
                  a.id === aId || 
                  getDeterministicId(sId, a.model_email || a.modelEmail || '') === aId ||
                  (a.model_email && cleanAId.includes(a.model_email.toLowerCase().split('@')[0])) ||
                  (a.model_name && cleanAId.includes(a.model_name.toLowerCase().replace(/\s/g, '')))
                );
              }
              if (!matchedAss && assignmentsList.length === 1) {
                matchedAss = assignmentsList[0];
              }
              if (!matchedAss && assignmentsList.length > 0) {
                matchedAss = assignmentsList[0];
              }

              return { sub, ass: matchedAss, allAss: assignmentsList };
            }

            // Fallback A: Lookup assignment directly by ID
            if (aId) {
              const { data: directAssList } = await supabase
                .from('assignments')
                .select('*')
                .eq('id', aId)
                .limit(1);

              if (directAssList && directAssList.length > 0) {
                const ass = directAssList[0];
                const actualSubId = ass.submission_id || sId;
                const { data: sub } = await supabase
                  .from('submissions')
                  .select('*')
                  .eq('id', actualSubId)
                  .maybeSingle();

                return { sub: sub || null, ass, allAss: directAssList };
              }
            }

            // Fallback B: If sId is a style number rather than UUID
            const { data: subByStyle } = await supabase
              .from('submissions')
              .select('*, assignments(*)')
              .eq('style_number', sId)
              .maybeSingle();

            if (subByStyle) {
              const assignmentsList: any[] = subByStyle.assignments || [];
              const sub = { ...subByStyle };
              delete sub.assignments;
              const cleanAId = aId.toLowerCase();
              const matchedAss = assignmentsList.find((a: any) => 
                a.id === aId || 
                getDeterministicId(sub.id, a.model_email || a.modelEmail || '') === aId ||
                (a.model_email && cleanAId.includes(a.model_email.toLowerCase().split('@')[0])) ||
                (a.model_name && cleanAId.includes(a.model_name.toLowerCase().replace(/\s/g, '')))
              ) || assignmentsList[0];

              return { sub, ass: matchedAss, allAss: assignmentsList };
            }
          } catch (e: any) {
            console.warn("[FastLoad] Supabase query warning:", e.message);
          }
          return null;
        };

        // 2. Firestore Concurrent Fetcher with strict 2.5s Timeout
        const fetchFirestore = async () => {
          if (!db) return null;
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
          
          const worker = async () => {
            try {
              const subRef = doc(db, 'submissions', sId);
              const assRef = doc(db, 'assignments', aId);
              const [subDoc, assDoc] = await Promise.all([
                getDoc(subRef).catch(() => null),
                getDoc(assRef).catch(() => null)
              ]);

              let sub = subDoc?.exists() ? { id: subDoc.id, ...subDoc.data() } : null;
              let ass = assDoc?.exists() ? { id: assDoc.id, ...assDoc.data() } : null;

              if (!ass && sId) {
                const assQ = query(collection(db, 'assignments'), where('submission_id', '==', sId));
                const snap = await getDocs(assQ).catch(() => null);
                if (snap && !snap.empty) {
                  const allAss = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                  const cleanAId = aId.toLowerCase();
                  ass = allAss.find((a: any) => 
                    a.id === aId || 
                    getDeterministicId(sId, a.model_email || a.modelEmail || '') === aId ||
                    (a.model_email && cleanAId.includes(a.model_email.toLowerCase().split('@')[0])) ||
                    (a.model_name && cleanAId.includes(a.model_name.toLowerCase().replace(/\s/g, '')))
                  );
                  if (!ass && allAss.length === 1) ass = allAss[0];
                  if (!ass && allAss.length > 0) ass = allAss[0];
                }
              }

              if (sub || ass) {
                return { sub, ass };
              }
            } catch (e: any) {
              console.warn("[FastLoad] Firestore query warning:", e.message);
            }
            return null;
          };

          return Promise.race([worker(), timeout]);
        };

        // Step 1: Query Supabase first (lightning fast, single roundtrip)
        let subData: any = null;
        let assData: any = null;

        const sbData = await fetchSupabase();
        if (sbData) {
          subData = sbData.sub;
          assData = sbData.ass;
        }

        // Step 2: Only query Firestore if Supabase didn't find both records
        if (!subData || !assData) {
          const fsData = await fetchFirestore();
          if (fsData) {
            if (!subData) subData = fsData.sub;
            if (!assData) assData = fsData.ass;
          }
        }

        // Fallback to optimistic initialData
        if (!subData) subData = initialData.initialSub;
        if (!assData) assData = initialData.initialAss;

        if (!isMounted) return;

        // Ensure keys are accessible via both snake_case and camelCase
        if (subData) {
          subData.style_number = subData.style_number || subData.styleNo || subData.styleNumber;
          subData.type_of_sample = subData.type_of_sample || subData.sampleType || subData.typeOfSample;
          setSubmissionData((prev: any) => ({ ...prev, ...subData }));

          try {
            localStorage.setItem(`fit_cache_sub_${sId}`, JSON.stringify(subData));
            if (subData.id && subData.id !== sId) {
              localStorage.setItem(`fit_cache_sub_${subData.id}`, JSON.stringify(subData));
            }
          } catch (e) {}
        }
        
        if (assData) {
          assData.model_name = assData.model_name || assData.modelName;
          assData.model_email = assData.model_email || assData.modelEmail;
          assData.given_for_fit_date = assData.given_for_fit_date || assData.givenForFitDate || '';
          setAssignmentData((prev: any) => ({ ...prev, ...assData }));

          try {
            localStorage.setItem(`fit_cache_ass_${aId}`, JSON.stringify(assData));
            if (assData.id && assData.id !== aId) {
              localStorage.setItem(`fit_cache_ass_${assData.id}`, JSON.stringify(assData));
            }
          } catch (e) {}
        }

        if (subData && assData) {
          setError(null);
        } else if (!subData && !assData) {
          setError("Feedback form not found. Please verify the link or contact your coordinator.");
        }

      } catch (error) {
        console.error("Critical fetch error:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
          setIsSyncing(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
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
    
    // 2. Given for Fit Date (determine correct date per round)
    const urlParams = new URLSearchParams(window.location.search);
    const queryGivenDate = urlParams.get('givenDate') || urlParams.get('date') || '';
    let resolvedFitDate = queryGivenDate ? decodeURIComponent(queryGivenDate).trim() : '';
    
    // Priority 1: Current specific round's given_for_fit_date
    if (!resolvedFitDate) {
      for (const key of currentRoundKeys) {
        if (assignmentData[key]?.given_for_fit_date) {
          resolvedFitDate = assignmentData[key].given_for_fit_date;
          break;
        }
      }
    }
    
    // Priority 2: Root level given_for_fit_date (which matches active round date from admin form)
    if (!resolvedFitDate && assignmentData.given_for_fit_date) {
      resolvedFitDate = assignmentData.given_for_fit_date;
    }
    
    // Priority 3: Fallback helper - previous round's given_for_fit_date
    const roundNumVal = parseInt(round) || 1;
    if (!resolvedFitDate && roundNumVal > 1) {
      const prevRoundNum = roundNumVal - 1;
      const prevData = assignmentData[`round${prevRoundNum}`] || assignmentData[`round_${prevRoundNum}`];
      if (prevData?.given_for_fit_date) {
        resolvedFitDate = prevData.given_for_fit_date;
      }
    }
    
    // Priority 4: Final fallback - Round 1 given date
    if (!resolvedFitDate) {
      resolvedFitDate = assignmentData.round1?.given_for_fit_date || assignmentData.round_1?.given_for_fit_date || '';
    }
    
    // Set resolved date directly - DO NOT fallback to today's date or created_at!
    setGivenForFitDate(resolvedFitDate || '');

    // 3. Current active round saved data pre-fill (if already submitted/saved previously in this round)
    let loadedReceivedDate = '';
    let loadedCommentsDate = '';
    let foundExisting = false;
    
    for (const key of currentRoundKeys) {
      if (assignmentData[key]) {
        const roundData = assignmentData[key];
        if (roundData.received_date || roundData.receivedDate || roundData.fit_date) {
          loadedReceivedDate = roundData.received_date || roundData.receivedDate || roundData.fit_date || '';
          foundExisting = true;
        }
        if (roundData.comments_date || roundData.commentsDate || roundData.comments_received_date || roundData.commentsReceivedDate) {
          loadedCommentsDate = roundData.comments_date || roundData.commentsDate || roundData.comments_received_date || roundData.commentsReceivedDate || '';
          foundExisting = true;
        }
        if (roundData.before_wash || roundData.beforeWash) {
          setBeforeWash(roundData.before_wash || roundData.beforeWash);
          foundExisting = true;
        }
        if (roundData.after_wash || roundData.afterWash) {
          setAfterWash(roundData.after_wash || roundData.afterWash);
          foundExisting = true;
        }
        if (roundData.fabric_trims || roundData.fabricTrims) {
          setFabricTrims(roundData.fabric_trims || roundData.fabricTrims);
          foundExisting = true;
        }
        if (roundData.attachments && Array.isArray(roundData.attachments)) {
          setAttachments(roundData.attachments);
        }
      }
    }
    
    if (foundExisting) {
      setHasExistingSubmission(true);
    }

    setReceivedDate(ddmmyyyyToYyyymmdd(loadedReceivedDate));
    // Default to Today's date if no comments date has been previously saved
    if (loadedCommentsDate) {
      setCommentsReceivedDate(ddmmyyyyToYyyymmdd(loadedCommentsDate));
    } else {
      setCommentsReceivedDate(getTodayYyyymmdd());
    }
  }, [assignmentData, round]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    try {
      const newItems: AttachmentItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`File ${file.name} is too large (max 10MB)`);
          continue;
        }

        if (file.type.startsWith('image/')) {
          // Compress image using canvas for quick & lightweight upload
          const item = await new Promise<AttachmentItem>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                const maxDim = 1200;
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                  if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                  } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                  }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0, width, height);
                  const compressed = canvas.toDataURL('image/jpeg', 0.75);
                  resolve({
                    id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                    name: file.name,
                    size: Math.round((compressed.length * 3) / 4),
                    type: 'image/jpeg',
                    dataUrl: compressed
                  });
                } else {
                  resolve({
                    id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    dataUrl: e.target?.result as string
                  });
                }
              };
              img.onerror = () => {
                resolve({
                  id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  dataUrl: e.target?.result as string
                });
              };
              img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
          });
          newItems.push(item);
        } else {
          // PDF or other documents
          const item = await new Promise<AttachmentItem>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              resolve({
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                name: file.name,
                size: file.size,
                type: file.type,
                dataUrl: e.target?.result as string
              });
            };
            reader.readAsDataURL(file);
          });
          newItems.push(item);
        }
      }
      setAttachments(prev => [...prev, ...newItems]);
      toast.success(`${newItems.length} file(s) attached`);
    } catch (err) {
      console.error("Error processing attachment files:", err);
      toast.error("Failed to process one or more files.");
    } finally {
      setUploadingFiles(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

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
        const roundPayload = {
          given_for_fit_date: givenForFitDate,
          received_date: yyyymmddToDdmmyyyy(receivedDate),
          comments_date: yyyymmddToDdmmyyyy(commentsReceivedDate),
          comments_received_date: yyyymmddToDdmmyyyy(commentsReceivedDate),
          before_wash: beforeWash,
          after_wash: afterWash,
          fabric_trims: fabricTrims,
          color: color || assignmentData.color || assignmentData.modelColor,
          attachments: attachments.map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl })),
          submitted_at: serverTimestamp()
        };

        await updateDoc(doc(db, 'assignments', aId), {
          [fbRoundKey]: roundPayload,
          [`round${round}`]: roundPayload,
          last_updated: serverTimestamp()
        });
      });

      // 1b. Supabase Update (Sync round data & photos to Supabase)
      try {
        if (assignmentId) {
          const supabaseRoundKey = `round${round}`; // round1, round2, round3
          const roundData = {
            fit_date: yyyymmddToDdmmyyyy(receivedDate),
            given_for_fit_date: givenForFitDate,
            comments_date: yyyymmddToDdmmyyyy(commentsReceivedDate),
            comments_received_date: yyyymmddToDdmmyyyy(commentsReceivedDate),
            before_wash: beforeWash,
            after_wash: afterWash,
            fabric_trims: fabricTrims,
            color: color || assignmentData.color || assignmentData.modelColor,
            attachments: attachments.map(a => ({ 
              id: a.id, 
              name: a.name, 
              size: a.size, 
              type: a.type, 
              dataUrl: a.dataUrl // Crucial: Store image dataUrl so photos are saved in Supabase
            })),
            submitted_at: new Date().toISOString()
          };
          
          console.log(`Updating Supabase Assignment ${assignmentId} for Round ${round}...`);
          
          const targetAssId = assignmentData?.id || assignmentId || aId;
          const { error: updErr } = await supabase
            .from('assignments')
            .update({ 
              [supabaseRoundKey]: roundData,
              attachments_count: attachments.length,
              attachment_names: attachments.map(a => a.name)
            })
            .eq('id', targetAssId);
          
          if (updErr) {
            console.warn("Supabase Assignment Update Error with full dataUrl (retrying with compressed thumbnails):", updErr.message);
            // In case payload size was exceeded, store compressed thumbnails
            const thumbnailAttachments = attachments.map(a => ({
              id: a.id,
              name: a.name,
              size: a.size,
              type: a.type,
              dataUrl: a.dataUrl ? a.dataUrl.slice(0, 100000) : undefined
            }));
            await supabase
              .from('assignments')
              .update({ 
                [supabaseRoundKey]: { ...roundData, attachments: thumbnailAttachments },
                attachments_count: attachments.length,
                attachment_names: attachments.map(a => a.name)
              })
              .eq('id', targetAssId);
          } else {
            console.log("Supabase Assignment Update with photos successful");
          }

          // Cache submitted round locally for instant reopen
          try {
            const updatedAss = {
              ...assignmentData,
              [`round${round}`]: roundData,
              [`round_${round}`]: roundData
            };
            localStorage.setItem(`fit_cache_ass_${aId}`, JSON.stringify(updatedAss));
            if (targetAssId) {
              localStorage.setItem(`fit_cache_ass_${targetAssId}`, JSON.stringify(updatedAss));
            }
          } catch (e) {}
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
      
      // Pre-baked query params for 0ms instantaneous loading without waiting for network
      const styleParam = encodeURIComponent(submissionData.style_number || submissionData.styleNo || '');
      const sampleParam = encodeURIComponent(submissionData.type_of_sample || submissionData.sampleType || '');
      const nameParam = encodeURIComponent(assignmentData.model_name || assignmentData.modelName || '');
      const emailParam = encodeURIComponent(assignmentData.model_email || assignmentData.modelEmail || '');
      const sizeParam = encodeURIComponent(assignmentData.size || '');
      const colorParam = encodeURIComponent(color || assignmentData.color || '');
      const givenParam = encodeURIComponent(givenForFitDate || '');
      const fastParams = `&styleNo=${styleParam}&sampleType=${sampleParam}&modelName=${nameParam}&modelEmail=${emailParam}&size=${sizeParam}&color=${colorParam}&givenDate=${givenParam}`;

      // Links for the Google Sheet
      const resR1Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=1${fastParams}`;
      const resR2Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=2${fastParams}`;
      const resR3Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=3${fastParams}`;
      const resR4Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=4${fastParams}`;
      const resR5Link = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${aId}&round=5${fastParams}`;
      
      const adminEditR1Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=1${fastParams}`;
      const adminEditR2Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=2${fastParams}`;
      const adminEditR3Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=3${fastParams}`;
      const adminEditR4Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=4${fastParams}`;
      const adminEditR5Link = `${appBaseUrl}/?mode=edit&submissionId=${submissionId}&assignmentId=${aId}&round=5${fastParams}`;

      const series = getSeriesFromStyleNumber(submissionData.style_number || submissionData.styleNo || "");
      const collage = await generateCollageAttachment(attachments);

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
        receivedDate: yyyymmddToDdmmyyyy(receivedDate),
        received_date: yyyymmddToDdmmyyyy(receivedDate),
        commentsDate: yyyymmddToDdmmyyyy(commentsReceivedDate),
        commentsReceivedDate: yyyymmddToDdmmyyyy(commentsReceivedDate),
        comments_received_date: yyyymmddToDdmmyyyy(commentsReceivedDate),
        beforeWash: beforeWash,
        before_wash: beforeWash,
        afterWash: afterWash,
        after_wash: afterWash,
        fabricComments: fabricTrims,
        fabricTrims: fabricTrims,
        fabric_trims: fabricTrims,
        AX: assignmentId || aId,
        attachmentColumn: round === "1" ? "BI" : round === "2" ? "BJ" : round === "3" ? "BK" : round === "4" ? "BL" : "BM",
        attachmentsCount: attachments.length,
        attachments: attachments.map(a => ({
          name: a.name,
          size: a.size,
          type: a.type,
          data: (a.dataUrl || '').split(',')[1] || ''
        })),
        collageAttachment: collage,
        allImages: attachments.filter(a => a.type.startsWith('image/')).map(a => ({
          name: a.name,
          type: a.type,
          size: a.size,
          data: (a.dataUrl || '').split(',')[1] || ''
        })),
        images: attachments.filter(a => a.type.startsWith('image/')).map(a => ({
          name: a.name,
          data: (a.dataUrl || '').split(',')[1] || ''
        })),
        
        // Direct column photo snapshot indicators
        "BI": round === "1" ? (attachments.length ? `${attachments.length} photo(s)` : "") : (assignmentData?.round1?.attachment_name || ""),
        "BJ": round === "2" ? (attachments.length ? `${attachments.length} photo(s)` : "") : (assignmentData?.round2?.attachment_name || ""),
        "BK": round === "3" ? (attachments.length ? `${attachments.length} photo(s)` : "") : (assignmentData?.round3?.attachment_name || ""),
        "BL": round === "4" ? (attachments.length ? `${attachments.length} photo(s)` : "") : (assignmentData?.round4?.attachment_name || ""),
        "BM": round === "5" ? (attachments.length ? `${attachments.length} photo(s)` : "") : (assignmentData?.round5?.attachment_name || ""),
        // Removed explicit link from N, V, AD as per user request
        
        // Round 1 (G-M)
        "G": round === "1" ? (color || assignmentData.color || "") : (assignmentData.round1?.color || assignmentData.round_1?.color || ""),
        "H": round === "1" ? (givenForFitDate || "") : (assignmentData.round1?.given_for_fit_date || assignmentData.round_1?.given_for_fit_date || ""),
        "I": round === "1" ? (yyyymmddToDdmmyyyy(receivedDate) || "") : (assignmentData.round1?.received_date || assignmentData.round_1?.received_date || ""),
        "J": round === "1" ? (yyyymmddToDdmmyyyy(commentsReceivedDate) || "") : (assignmentData.round1?.comments_date || assignmentData.round1?.comments_received_date || assignmentData.round_1?.comments_received_date || ""),
        "K": round === "1" ? (beforeWash || "") : (assignmentData.round1?.before_wash || assignmentData.round_1?.before_wash || ""),
        "L": round === "1" ? (afterWash || "") : (assignmentData.round1?.after_wash || assignmentData.round_1?.after_wash || ""),
        "M": round === "1" ? (fabricTrims || "") : (assignmentData.round1?.fabric_trims || assignmentData.round_1?.fabric_trims || ""),
        
        // Round 2 (O-U)
        "O": round === "2" ? (color || assignmentData.color || "") : (assignmentData.round2?.color || assignmentData.round_2?.color || ""),
        "P": round === "2" ? (givenForFitDate || "") : (assignmentData.round2?.given_for_fit_date || assignmentData.round_2?.given_for_fit_date || ""),
        "Q": round === "2" ? (yyyymmddToDdmmyyyy(receivedDate) || "") : (assignmentData.round2?.received_date || assignmentData.round_2?.received_date || ""),
        "R": round === "2" ? (yyyymmddToDdmmyyyy(commentsReceivedDate) || "") : (assignmentData.round2?.comments_date || assignmentData.round2?.comments_received_date || assignmentData.round_2?.comments_received_date || ""),
        "S": round === "2" ? (beforeWash || "") : (assignmentData.round2?.before_wash || assignmentData.round_2?.before_wash || ""),
        "T": round === "2" ? (afterWash || "") : (assignmentData.round2?.after_wash || assignmentData.round_2?.after_wash || ""),
        "U": round === "2" ? (fabricTrims || "") : (assignmentData.round2?.fabric_trims || assignmentData.round_2?.fabric_trims || ""),

        // Round 3 (W-AC)
        "W": round === "3" ? (color || assignmentData.color || "") : (assignmentData.round3?.color || assignmentData.round_3?.color || ""),
        "X": round === "3" ? (givenForFitDate || "") : (assignmentData.round3?.given_for_fit_date || assignmentData.round_3?.given_for_fit_date || ""),
        "Y": round === "3" ? (yyyymmddToDdmmyyyy(receivedDate) || "") : (assignmentData.round3?.received_date || assignmentData.round_3?.received_date || ""),
        "Z": round === "3" ? (yyyymmddToDdmmyyyy(commentsReceivedDate) || "") : (assignmentData.round3?.comments_date || assignmentData.round3?.comments_received_date || assignmentData.round_3?.comments_received_date || ""),
        "AA": round === "3" ? (beforeWash || "") : (assignmentData.round3?.before_wash || assignmentData.round_3?.before_wash || ""),
        "AB": round === "3" ? (afterWash || "") : (assignmentData.round3?.after_wash || assignmentData.round_3?.after_wash || ""),
        "AC": round === "3" ? (fabricTrims || "") : (assignmentData.round3?.fabric_trims || assignmentData.round_3?.fabric_trims || ""),

        // Round 4 (AE-AK)
        "AE": round === "4" ? (color || assignmentData.color || "") : (assignmentData.round4?.color || (assignmentData.round_4?.color || "")),
        "AF": round === "4" ? (givenForFitDate || "") : (assignmentData.round4?.given_for_fit_date || (assignmentData.round_4?.given_for_fit_date || "")),
        "AG": round === "4" ? (yyyymmddToDdmmyyyy(receivedDate) || "") : (assignmentData.round4?.received_date || (assignmentData.round_4?.received_date || "")),
        "AH": round === "4" ? (yyyymmddToDdmmyyyy(commentsReceivedDate) || "") : (assignmentData.round4?.comments_date || assignmentData.round4?.comments_received_date || (assignmentData.round_4?.comments_received_date || "")),
        "AI": round === "4" ? (beforeWash || "") : (assignmentData.round4?.before_wash || (assignmentData.round_4?.before_wash || "")),
        "AJ": round === "4" ? (afterWash || "") : (assignmentData.round4?.after_wash || (assignmentData.round_4?.after_wash || "")),
        "AK": round === "4" ? (fabricTrims || "") : (assignmentData.round4?.fabric_trims || (assignmentData.round_4?.fabric_trims || "")),

        // Round 5 (AM-AS)
        "AM": round === "5" ? (color || assignmentData.color || "") : (assignmentData.round5?.color || (assignmentData.round_5?.color || "")),
        "AN": round === "5" ? (givenForFitDate || "") : (assignmentData.round5?.given_for_fit_date || (assignmentData.round_5?.given_for_fit_date || "")),
        "AO": round === "5" ? (yyyymmddToDdmmyyyy(receivedDate) || "") : (assignmentData.round5?.received_date || (assignmentData.round_5?.received_date || "")),
        "AP": round === "5" ? (yyyymmddToDdmmyyyy(commentsReceivedDate) || "") : (assignmentData.round5?.comments_date || assignmentData.round5?.comments_received_date || (assignmentData.round_5?.comments_received_date || "")),
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
        "Date Sent": givenForFitDate || assignmentData?.given_for_fit_date || assignmentData?.givenForFitDate || "",
        "Sample Given for Fit Date": givenForFitDate || assignmentData?.given_for_fit_date || assignmentData?.givenForFitDate || "",
        "Comments Date": yyyymmddToDdmmyyyy(commentsReceivedDate),
        "Sample Received Date": yyyymmddToDdmmyyyy(receivedDate),
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

      // AUTOMATIC EMAIL TRIGGER REMOVED per user request
      // Admin will send next round link manually from the fit history / admin panel
      /*
      if (parseInt(round) < 5) {
        console.log("Next round notification is now manual via Fit History.");
      }
      */

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

      const styleParam = encodeURIComponent(submissionData.style_number || submissionData.styleNo || '');
      const sampleParam = encodeURIComponent(submissionData.type_of_sample || submissionData.sampleType || '');
      const nameParam = encodeURIComponent(assignmentData.model_name || assignmentData.modelName || '');
      const emailParam = encodeURIComponent(assignmentData.model_email || assignmentData.modelEmail || '');
      const sizeParam = encodeURIComponent(assignmentData.size || '');
      const colorParam = encodeURIComponent(color || assignmentData.color || '');
      const givenParam = encodeURIComponent(givenForFitDate || '');
      const fastParams = `&styleNo=${styleParam}&sampleType=${sampleParam}&modelName=${nameParam}&modelEmail=${emailParam}&size=${sizeParam}&color=${colorParam}&givenDate=${givenParam}`;

      const nextRoundLink = `${modelFeedbackBaseUrl}/?submissionId=${submissionId}&assignmentId=${assignmentId}&round=${nextRound}${fastParams}`;
      
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

  const handlePrintReport = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    const htmlContent = generateSoieReportHtml({
      submissionData,
      assignmentData,
      round,
      sampleColor: color || assignmentData?.color || '-',
      sampleGivenFitDate: formatDisplayDate(givenForFitDate),
      sampleReceivedDate: formatDisplayDate(receivedDate),
      commentsDate: formatDisplayDate(commentsReceivedDate),
      fitBeforeWash: beforeWash,
      fitAfterWash: afterWash,
      commentsFabricTrims: fabricTrims,
      attachments
    });

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const styleNo = (submissionData?.style_number || 'Style').replace(/[^a-zA-Z0-9_-]/g, '_');
    const model = (assignmentData?.model_name || 'Model').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `SOIE_Feedback_Round${round}_${styleNo}_${model}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded feedback report file!');
  };

  const handleCopyReportText = () => {
    const roundOrd = getRoundOrdinal(round);
    const model = assignmentData?.model_name || 'Model';
    const styleNo = submissionData?.style_number || '-';
    const desc = submissionData?.description || '-';
    const sz = assignmentData?.size || '-';
    const clr = color || assignmentData?.color || '-';
    const givenDate = formatDisplayDate(givenForFitDate);
    const recDate = formatDisplayDate(receivedDate);
    const commDate = formatDisplayDate(commentsReceivedDate);

    const textReport = `SOIE FIT AUDIT • ${roundOrd} ROUND EVALUATION
Quality Feedback Update
Model: ${model}

Model Name: ${model}
Type of Sample: ${submissionData?.type_of_sample || '1st Fit Sample'}

Sample Specifications:
Style no: ${styleNo}
Description: ${desc}
Size: ${sz}
Sample color: ${clr}
Sample given for Fit date: ${givenDate}

${getRoundName(round)} Fit & Wash Evaluation:
Sample received date: ${recDate}
Comments Date: ${commDate}
Fit comments before wash: ${beforeWash || 'No remarks noted'}
Fit comments after wash: ${afterWash || 'No remarks noted'}
Comments on fabric / trims: ${fabricTrims || 'No remarks noted'}

"Thanks for your feedback. Your valuable feedback is essential for our continuous improvement and service excellence."

Warm regards,
Deepika
Lead Designer & Quality Audit Team
SOIE • Ginza Industries Limited
designer02@soie.in`;

    navigator.clipboard.writeText(textReport);
    toast.success('Feedback report copied to clipboard!');
  };

  if ((!supabaseUrl || !supabaseAnonKey) && !submissionData && !assignmentData && !loading) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Info className="w-5 h-5" />
              Configuration Missing
            </CardTitle>
            <CardDescription>
              Database credentials are not set. The administrator needs to configure the application.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const dateSentFormatted = givenForFitDate || 
    assignmentData?.given_for_fit_date || 
    assignmentData?.givenForFitDate || 
    '-';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-3">
        <Loader2 className="w-9 h-9 animate-spin text-primary" />
        <p className="text-sm font-medium text-slate-600">Opening feedback form...</p>
        <p className="text-xs text-slate-400">Loading details for Round {round}...</p>
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
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
        {/* Success Banner (Hidden during Print) */}
        <div className="no-print bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-emerald-950">Submission Successful!</h2>
              <p className="text-sm text-emerald-800">
                Thank you! Your feedback for <strong>{getRoundName(round)}</strong> has been recorded in the system.
              </p>
              <p className="text-xs text-emerald-700">
                The tracking sheet and audit records have been updated automatically. You can save or print your feedback below before closing this tab.
              </p>
            </div>
          </div>

          {/* Quick Close Button */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              onClick={() => {
                try {
                  window.close();
                  setTimeout(() => {
                    alert("You can safely close this browser tab.");
                  }, 400);
                } catch (e) {
                  alert("Please close this browser tab.");
                }
              }}
              className="w-full md:w-auto border-emerald-300 hover:bg-emerald-100 text-emerald-900 text-xs h-10 px-4 font-medium"
            >
              Close Tab
            </Button>
          </div>
        </div>

        {/* Action Controls Toolbar (Hidden during Print) */}
        <div className="no-print bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-slate-900 text-white hover:bg-slate-800 px-3 py-1 text-xs font-semibold">
              Quality Feedback Update
            </Badge>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Download your signed copy anytime
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handlePrintReport}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-10 px-4 font-semibold shadow-sm flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Download / Print PDF
            </Button>

            <Button
              variant="outline"
              onClick={handleDownloadHtml}
              className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-10 px-3.5 flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Save File (.html)
            </Button>

            <Button
              variant="outline"
              onClick={handleCopyReportText}
              className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-10 px-3.5 flex items-center gap-1.5"
            >
              <Copy className="w-4 h-4 text-slate-500" />
              Copy Text
            </Button>

            {parseInt(round) < 5 && (
              <Button
                variant="outline"
                onClick={handleSendNextRoundLink}
                disabled={mailing}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs h-10 px-3.5 flex items-center gap-1.5"
              >
                {mailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Email Round {parseInt(round) + 1} Link
              </Button>
            )}
          </div>
        </div>

        {/* The Exact Printable Feedback Report Card */}
        <div className="soie-print-zone">
          <SoieFeedbackReportCard
            submissionData={submissionData}
            assignmentData={assignmentData}
            round={round}
            sampleColor={color || assignmentData?.color || '-'}
            sampleGivenFitDate={formatDisplayDate(givenForFitDate)}
            sampleReceivedDate={formatDisplayDate(receivedDate)}
            commentsDate={formatDisplayDate(commentsReceivedDate)}
            fitBeforeWash={beforeWash}
            fitAfterWash={afterWash}
            commentsFabricTrims={fabricTrims}
            attachments={attachments}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      {/* Non-blocking background sync indicator */}
      {isSyncing && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-indigo-100/70 overflow-hidden z-50 pointer-events-none" title="Syncing fresh updates...">
          <div className="h-full bg-indigo-600 animate-pulse w-full" />
        </div>
      )}
      {/* Existing Submission Notice Banner & Report Preview Toggle */}
      {hasExistingSubmission && (
        <div className="no-print bg-amber-50/90 border border-amber-200/80 rounded-2xl p-4 md:p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-950">
                  Feedback for {getRoundName(round)} has already been recorded
                </p>
                <p className="text-xs text-amber-800">
                  You can view and download your signed Quality Feedback report anytime, or make changes and re-submit below.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowReportPreview(!showReportPreview)}
              className="border-amber-300 text-amber-950 hover:bg-amber-100/70 shrink-0 text-xs h-9 px-3.5 flex items-center gap-1.5 font-medium self-start sm:self-auto"
            >
              {showReportPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showReportPreview ? 'Hide Report Preview' : 'View / Download Report'}
            </Button>
          </div>

          {/* Expanded Report Preview & Actions */}
          {showReportPreview && (
            <div className="pt-3 border-t border-amber-200/60 space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={handlePrintReport}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-3 font-medium flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Download PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadHtml}
                  className="bg-white border-slate-300 text-slate-700 text-xs h-8 px-3 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Save File (.html)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyReportText}
                  className="bg-white border-slate-300 text-slate-700 text-xs h-8 px-3 flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  Copy Text
                </Button>
              </div>

              <div className="soie-print-zone">
                <SoieFeedbackReportCard
                  submissionData={submissionData}
                  assignmentData={assignmentData}
                  round={round}
                  sampleColor={color || assignmentData?.color || '-'}
                  sampleGivenFitDate={formatDisplayDate(givenForFitDate)}
                  sampleReceivedDate={formatDisplayDate(receivedDate)}
                  commentsDate={formatDisplayDate(commentsReceivedDate)}
                  fitBeforeWash={beforeWash}
                  fitAfterWash={afterWash}
                  commentsFabricTrims={fabricTrims}
                  attachments={attachments}
                />
              </div>
            </div>
          )}
        </div>
      )}

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
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Sample Given for Fit Date</span>
              <p className="font-medium text-sm text-slate-900">{givenForFitDate || '-'}</p>
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
                  Sample Given for Fit Date (Read-only)
                </Label>
                <Input 
                  value={givenForFitDate || '-'}
                  readOnly
                  placeholder="DD/MM/YYYY"
                  className="border-primary/20 bg-slate-50 text-slate-600 cursor-not-allowed font-medium shadow-none focus-visible:ring-0"
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
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="border-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-slate-700 font-medium">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Comments Date *
                </Label>
                <Input 
                  type="date"
                  value={commentsReceivedDate}
                  onChange={(e) => setCommentsReceivedDate(e.target.value)}
                  className="border-primary/20 focus:border-primary"
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

            {/* Attachments Section */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-slate-700 font-medium text-base">
                  <Paperclip className="w-4 h-4 text-primary" />
                  Fit Photos & Attachments (Optional)
                </Label>
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600">
                  {attachments.length} attached
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Upload fit pictures, garment details, before/after wash comparison, or trims issues (JPG, PNG, WEBP, PDF - max 10MB per file).
              </p>

              {/* Upload Dropzone */}
              <div 
                className="border-2 border-dashed border-slate-200 hover:border-primary/50 transition-colors rounded-xl p-6 text-center bg-slate-50/50 hover:bg-slate-50 flex flex-col items-center justify-center gap-2 cursor-pointer relative"
                onClick={() => document.getElementById('file-upload-input')?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) {
                    handleFileUpload(e.dataTransfer.files);
                  }
                }}
              >
                <input 
                  id="file-upload-input"
                  type="file" 
                  multiple 
                  accept="image/*,application/pdf" 
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {uploadingFiles ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <UploadCloud className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {uploadingFiles ? 'Processing files...' : 'Click to browse or drag & drop files here'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Images are automatically optimized for rapid upload
                  </p>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="mt-1 h-8 text-xs pointer-events-none"
                  disabled={uploadingFiles}
                >
                  Select Photos or Documents
                </Button>
              </div>

              {/* Attachment Preview Grid */}
              {attachments.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                  {attachments.map((att) => {
                    const isImg = (att.dataUrl || (att as any).url) && (!att.type || att.type.startsWith('image/'));
                    return (
                      <div 
                        key={att.id} 
                        onClick={() => {
                          if (isImg) {
                            handleOpenZoom(att.id || att.dataUrl || (att as any).url || '');
                          }
                        }}
                        className={`relative group rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col transition-all ${
                          isImg ? 'cursor-pointer hover:border-indigo-400 hover:shadow-md' : ''
                        }`}
                      >
                        {isImg ? (
                          <div className="h-28 w-full bg-slate-100 overflow-hidden relative group">
                            <img 
                              src={att.dataUrl || (att as any).url} 
                              alt={att.name} 
                              className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                            />
                            {/* Hover overlay indicating click to zoom */}
                            <div className="absolute inset-0 bg-slate-950/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white">
                              <ZoomIn className="w-5 h-5 text-indigo-200" />
                              <span className="text-xs font-semibold drop-shadow-xs">Click to Zoom</span>
                            </div>
                            <div className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-xs text-white rounded px-1.5 py-0.5 text-[9px] flex items-center gap-1 font-medium pointer-events-none">
                              <Maximize2 className="w-2.5 h-2.5" />
                              Zoom
                            </div>
                          </div>
                        ) : (
                          <div className="h-28 w-full bg-slate-50 flex flex-col items-center justify-center p-2 text-slate-400">
                            <FileText className="w-8 h-8 text-primary/70 mb-1" />
                            <span className="text-[10px] font-mono uppercase font-bold text-slate-500">PDF Document</span>
                          </div>
                        )}
                        <div className="p-2 flex flex-col justify-between flex-1 bg-white">
                          <p className="text-[11px] font-medium text-slate-700 truncate" title={att.name}>
                            {att.name}
                          </p>
                          <p className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>
                              {att.size < 1024 * 1024 
                                ? `${Math.round(att.size / 1024)} KB` 
                                : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                            </span>
                            {isImg && (
                              <span className="text-indigo-600 font-semibold text-[9px] flex items-center gap-0.5">
                                <ZoomIn className="w-2.5 h-2.5" />
                                HD Zoom
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttachment(att.id);
                          }}
                          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-destructive transition-colors shadow-sm z-10"
                          title="Remove attachment"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Full-screen photo zoom modal for attachments */}
      <ImageZoomModal
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        images={zoomableImages}
        initialIndex={zoomModalIndex}
      />
    </div>
  );
}
