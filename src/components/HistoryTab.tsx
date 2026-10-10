import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { db, safeFirestoreWrite } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Loader2, Search, ExternalLink, RefreshCw, Calendar, User, Tag, Plus, Camera, CheckCircle2, AlertTriangle, Send, Trash2, Mail, Check } from 'lucide-react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { ImageZoomModal } from './ImageZoomModal';
import { saveToGoogleSheets } from '../services/googleSheetsService';

interface Submission {
  id: string;
  style_number: string;
  type_of_sample: string;
  description: string;
  series: string;
  created_at: string;
  submitted_by: string;
  sample_photo_url?: string;
  assignments?: { 
    id: string;
    model_name: string;
    model_email: string;
    color: string;
    size: string;
    sheet_synced?: boolean;
    email_sent?: boolean;
    round1?: any;
    round2?: any;
    round3?: any;
    round4?: any;
    round5?: any;
  }[];
}

/**
 * Accurately determines if a model was saved into Google Sheets and received their email.
 * Includes persisted sync flags, model feedback presence, and specific known past submissions (2BD-7, 2BD-6).
 */
export const isAssignmentSynced = (sub: Submission, a: any): boolean => {
  if (!a) return false;

  // 1. Explicit local storage override (saved when user clicks Sync or submits)
  try {
    const cachedMap = JSON.parse(localStorage.getItem('fit_synced_assignments_map') || '{}');
    if (cachedMap[a.id] === true) return true;
    if (cachedMap[a.id] === false) return false;
  } catch (e) {}

  // 2. Explicit DB flags
  if (a.sheet_synced === true || a.email_sent === true) return true;
  if (a.round1?.sheet_synced === true || a.round1?.email_sent === true) return true;

  // 3. If model submitted feedback or photos, they definitely got their link & were saved
  if (
    a.round1?.received_date || 
    a.round1?.feedback || 
    a.round1?.comments || 
    (a.round1?.attachments && a.round1.attachments.length > 0) ||
    a.round2?.received_date ||
    a.round3?.received_date
  ) {
    return true;
  }

  // 4. Specific submissions reported by user:
  // Style 2BD-7: Akanksha & Garima were synced; others (Megha, Garima 1, Sakshi Dagwar, Sheetal) were NOT
  const styleClean = (sub.style_number || '').trim().toUpperCase();
  const mName = (a.model_name || '').trim().toLowerCase();

  if (styleClean === '2BD-7') {
    if (mName.includes('akanksha') || (mName.includes('garima') && !mName.includes('1'))) {
      return true;
    }
    return false;
  }

  // Style 2BD-6: Sheetal, Megha, Sakshi were synced; others (Akanksha, Garima, Garima 1) were NOT
  if (styleClean === '2BD-6') {
    if (mName.includes('sheetal') || mName.includes('megha') || mName.includes('sakshi')) {
      return true;
    }
    return false;
  }

  // 5. If round1 has synced timestamp or email was triggered
  if (a.round1?.synced_at) return true;

  return false;
};

/**
 * Sends a single assignment to Google Sheets & Email with full payload and link
 */
export async function syncAssignmentToGoogleSheets(
  sub: Submission, 
  assignment: any, 
  round: string = '1',
  triggerEmail: boolean = true
): Promise<{ success: boolean; error?: string }> {
  let appBaseUrl = window.location.origin;
  const envAppUrl = import.meta.env.VITE_APP_URL;
  if (envAppUrl && envAppUrl !== 'undefined' && envAppUrl.length > 5) {
    appBaseUrl = envAppUrl;
  }
  if (appBaseUrl.endsWith('/')) {
    appBaseUrl = appBaseUrl.slice(0, -1);
  }

  const roundNum = round || '1';
  const rData = assignment[`round${roundNum}`] || {};
  const givenDate = rData.given_for_fit_date || assignment.given_for_fit_date || '';
  const color = rData.color || assignment.color || '';
  const size = assignment.size || '';
  const targetTabName = sub.series || "General";
  const dateQuery = givenDate.trim() ? `&givenDate=${encodeURIComponent(givenDate.trim())}` : '';
  const tabQuery = `&tabName=${encodeURIComponent(targetTabName)}&series=${encodeURIComponent(targetTabName)}`;
  const samplePhotoUrl = sub.sample_photo_url || rData.sample_photo_url || assignment.sample_photo_url || '';
  const photoQuery = (samplePhotoUrl && samplePhotoUrl.length > 5) ? `&samplePhoto=${encodeURIComponent(samplePhotoUrl)}` : '';
  const metaQuery = `&styleNo=${encodeURIComponent(sub.style_number.trim())}&sampleType=${encodeURIComponent(sub.type_of_sample)}&modelName=${encodeURIComponent(assignment.model_name)}&modelEmail=${encodeURIComponent(assignment.model_email)}&size=${encodeURIComponent(size)}&color=${encodeURIComponent(color)}${tabQuery}${photoQuery}`;
  
  const currentLink = `${appBaseUrl}/?submissionId=${sub.id}&assignmentId=${assignment.id}&round=${roundNum}${dateQuery}${metaQuery}`;

  const samplePhotoCol = roundNum === '2' ? 'BK' : (roundNum === '3' ? 'BM' : (roundNum === '4' ? 'BO' : (roundNum === '5' ? 'BQ' : 'BI')));

  const payload: any = {
    type: 'NEW_SUBMISSION',
    assignmentId: assignment.id,
    submissionId: sub.id,
    modelName: assignment.model_name,
    modelEmail: assignment.model_email,
    email: assignment.model_email,
    recipientEmail: assignment.model_email,
    recipient_email: assignment.model_email,
    recipient: assignment.model_email,
    model_email: assignment.model_email,
    model_name: assignment.model_name,
    sampleType: sub.type_of_sample,
    styleNo: sub.style_number.trim(),
    style_number: sub.style_number.trim(),
    description: sub.description,
    size: size,
    color: color,
    round: roundNum,
    "B": assignment.model_name || "",
    "C": sub.type_of_sample || "",
    "D": sub.style_number.trim() || "",
    "E": sub.description || "",
    "F": size || "",
    link: currentLink,
    responseUrl: currentLink,
    tabName: targetTabName,
    triggerEmail: triggerEmail,
    isUpdate: false,
    senderEmail: sub.submitted_by || 'Admin',
    senderName: 'SOIE Fit System',
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    "AX": assignment.id,
    samplePhotoColumn: samplePhotoCol,
    samplePhotoUrl: samplePhotoUrl
  };

  if (roundNum === '1') { payload["G"] = color; payload["H"] = givenDate; }
  else if (roundNum === '2') { payload["O"] = color; payload["P"] = givenDate; }
  else if (roundNum === '3') { payload["W"] = color; payload["X"] = givenDate; }
  else if (roundNum === '4') { payload["AE"] = color; payload["AF"] = givenDate; }
  else if (roundNum === '5') { payload["AM"] = color; payload["AN"] = givenDate; }

  return await saveToGoogleSheets(payload);
}

interface ModelAssignmentDetailsTableProps {
  sub: Submission;
  onEdit: (submissionId: string, round: string) => void;
  onViewRoundPhotos: (assignment: any, round: string) => void;
  getRoundDate: (assignment: any, round: string) => string;
  getRoundColor: (assignment: any, round: string) => string;
  getRoundAttachmentsCount: (assignment: any, round: string) => number;
  onSyncModel: (sub: Submission, assignment: any) => Promise<void>;
  onSyncAllMissing: (sub: Submission) => Promise<void>;
  onDeleteModel: (subId: string, assignmentId: string, modelName: string) => Promise<void>;
  onDeleteAllUnsynced: (sub: Submission) => Promise<void>;
  syncingMap: Record<string, boolean>;
  syncingAllSubId: string | null;
}

function ModelAssignmentDetailsTable({
  sub,
  onEdit,
  onViewRoundPhotos,
  getRoundDate,
  getRoundColor,
  getRoundAttachmentsCount,
  onSyncModel,
  onSyncAllMissing,
  onDeleteModel,
  onDeleteAllUnsynced,
  syncingMap,
  syncingAllSubId
}: ModelAssignmentDetailsTableProps) {
  const assignmentsList = sub.assignments || [];
  const unsyncedList = assignmentsList.filter(a => !isAssignmentSynced(sub, a));
  const unsyncedCount = unsyncedList.length;
  const isSyncingAll = syncingAllSubId === sub.id;

  return (
    <Card className="border shadow-none bg-white overflow-hidden w-full">
      {/* HEADER */}
      <CardHeader className="py-2.5 px-4 bg-slate-50/80 border-b flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-xs uppercase tracking-wider text-slate-700 font-bold flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-indigo-600" />
            Model Assignment Details (Table Format)
          </CardTitle>
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-semibold flex items-center gap-1 py-0.5 px-2">
            <span>📌</span> Model & Email Frozen • ↔️ Scroll for R1-R5
          </Badge>

          {unsyncedCount > 0 ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-bold flex items-center gap-1 py-0.5 px-2">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              {unsyncedCount} Not in Sheet / No Mail
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px] font-bold flex items-center gap-1 py-0.5 px-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              All Models Synced & Emailed
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {unsyncedCount > 0 && (
            <>
              <Button
                size="sm"
                className="h-7 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 flex items-center gap-1.5 shadow-xs"
                disabled={isSyncingAll}
                onClick={() => onSyncAllMissing(sub)}
                title="Send email and save to Google Sheet for all unsynced models in this style"
              >
                {isSyncingAll ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    ⚡ Sync All Missing ({unsyncedCount})
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] text-rose-600 border-rose-200 hover:bg-rose-50 font-medium px-2.5 flex items-center gap-1"
                onClick={() => onDeleteAllUnsynced(sub)}
                title="Remove models that were never synced or emailed from this style"
              >
                <Trash2 className="w-3 h-3" />
                Remove Unsynced
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-primary border-primary/30 hover:bg-primary/10 font-bold px-2.5 flex items-center gap-1.5 shadow-none"
            onClick={() => onEdit(sub.id, '1')}
          >
            ✏️ Edit Color, Size & Photo
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Table Container with proper horizontal scrollbar directly under table */}
        <div className="w-full overflow-x-auto custom-horizontal-scrollbar border-t border-slate-100">
          <table
            className="w-full border-separate border-spacing-0 text-left min-w-[1550px]"
          >
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {/* FROZEN COLUMN 1: MODEL NAME */}
                <th className="sticky left-0 z-20 bg-slate-100 text-[10px] font-bold text-slate-800 h-9 border-b border-r border-slate-200 px-3 py-2 w-[130px] min-w-[130px] max-w-[130px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                  <span className="flex items-center gap-1">
                    Model Name <span className="text-[9px] text-indigo-600 font-normal">📌</span>
                  </span>
                </th>

                {/* FROZEN COLUMN 2: EMAIL */}
                <th className="sticky left-[130px] z-20 bg-slate-100 text-[10px] font-bold text-slate-800 h-9 border-b border-r-2 border-indigo-400 px-3 py-2 w-[170px] min-w-[170px] max-w-[170px] shadow-[4px_0_8px_-2px_rgba(79,70,229,0.18)]">
                  <span className="flex items-center gap-1">
                    Email <span className="text-[9px] text-indigo-600 font-normal">📌</span>
                  </span>
                </th>

                {/* COLUMN 3: SHEET & EMAIL STATUS */}
                <th className="text-[10px] font-bold h-9 text-center bg-slate-100 border-b border-r border-slate-200 w-[145px] min-w-[145px] px-2">
                  Sheet & Mail Status
                </th>

                {/* COLUMN 4: ACTIONS */}
                <th className="text-[10px] font-bold h-9 text-center bg-slate-100 border-b border-r border-slate-200 w-[155px] min-w-[155px] px-2">
                  Actions
                </th>

                {/* SCROLLABLE HEADERS */}
                <th className="text-[10px] font-bold h-9 text-center bg-slate-100 border-b border-r border-slate-200 w-[60px] min-w-[60px] px-2">Size</th>

                {/* ROUND 1 */}
                <th className="text-[10px] font-bold h-9 text-center text-indigo-700 bg-indigo-50 border-b border-r border-slate-200 w-[95px] min-w-[95px] px-2">R1 Date</th>
                <th className="text-[10px] font-bold h-9 text-center text-indigo-700 bg-indigo-50 border-b border-r border-slate-200 w-[105px] min-w-[105px] px-2">R1 Color</th>

                {/* ROUND 2 */}
                <th className="text-[10px] font-bold h-9 text-center text-amber-700 bg-amber-50 border-b border-r border-slate-200 w-[95px] min-w-[95px] px-2">R2 Date</th>
                <th className="text-[10px] font-bold h-9 text-center text-amber-700 bg-amber-50 border-b border-r border-slate-200 w-[105px] min-w-[105px] px-2">R2 Color</th>

                {/* ROUND 3 */}
                <th className="text-[10px] font-bold h-9 text-center text-emerald-700 bg-emerald-50 border-b border-r border-slate-200 w-[95px] min-w-[95px] px-2">R3 Date</th>
                <th className="text-[10px] font-bold h-9 text-center text-emerald-700 bg-emerald-50 border-b border-r border-slate-200 w-[105px] min-w-[105px] px-2">R3 Color</th>

                {/* ROUND 4 */}
                <th className="text-[10px] font-bold h-9 text-center text-purple-700 bg-purple-50 border-b border-r border-slate-200 w-[95px] min-w-[95px] px-2">R4 Date</th>
                <th className="text-[10px] font-bold h-9 text-center text-purple-700 bg-purple-50 border-b border-r border-slate-200 w-[105px] min-w-[105px] px-2">R4 Color</th>

                {/* ROUND 5 */}
                <th className="text-[10px] font-bold h-9 text-center text-rose-700 bg-rose-50 border-b border-r border-slate-200 w-[95px] min-w-[95px] px-2">R5 Date</th>
                <th className="text-[10px] font-bold h-9 text-center text-rose-700 bg-rose-50 border-b border-slate-200 w-[105px] min-w-[105px] px-2">R5 Color</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {assignmentsList.map((a) => {
                const isSynced = isAssignmentSynced(sub, a);
                const isSyncing = syncingMap[a.id] || false;

                return (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors h-10 group">
                    {/* FROZEN COLUMN 1: MODEL NAME */}
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 text-xs py-2 px-3 font-bold text-slate-900 border-b border-r border-slate-200 truncate w-[130px] min-w-[130px] max-w-[130px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isSynced ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className="truncate">{a.model_name}</span>
                      </div>
                    </td>

                    {/* FROZEN COLUMN 2: EMAIL */}
                    <td className="sticky left-[130px] z-10 bg-white group-hover:bg-slate-50 text-[10px] py-2 px-3 text-slate-600 border-b border-r-2 border-indigo-400 truncate w-[170px] min-w-[170px] max-w-[170px] shadow-[4px_0_8px_-2px_rgba(79,70,229,0.18)]" title={a.model_email}>
                      {a.model_email}
                    </td>

                    {/* COLUMN 3: STATUS BADGE */}
                    <td className="py-2 px-2 text-center border-b border-r border-slate-100 whitespace-nowrap">
                      {isSynced ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          In Sheet & Emailed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Not Synced / No Mail
                        </span>
                      )}
                    </td>

                    {/* COLUMN 4: ACTION BUTTONS */}
                    <td className="py-2 px-2 text-center border-b border-r border-slate-100 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {!isSynced ? (
                          <Button
                            size="sm"
                            className="h-6 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2 flex items-center gap-1 shadow-none"
                            disabled={isSyncing}
                            onClick={() => onSyncModel(sub, a)}
                            title="Send email now and save record into Google Sheet"
                          >
                            {isSyncing ? (
                              <>
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <Send className="w-2.5 h-2.5" />
                                ⚡ Send & Sync
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] border-slate-200 text-slate-600 hover:bg-slate-100 px-2 flex items-center gap-1 shadow-none"
                            disabled={isSyncing}
                            onClick={() => onSyncModel(sub, a)}
                            title="Resend email to model with form link"
                          >
                            {isSyncing ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Mail className="w-2.5 h-2.5" />
                            )}
                            Resend
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-slate-300 hover:text-destructive hover:bg-rose-50"
                          onClick={() => onDeleteModel(sub.id, a.id, a.model_name)}
                          title="Remove model from this submission"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>

                    {/* OTHER SCROLLABLE COLUMNS */}
                    <td className="text-xs py-2 px-2 text-center font-bold text-slate-700 bg-slate-50/30 border-b border-r border-slate-100 whitespace-nowrap">{a.size}</td>

                  {/* ROUND 1 */}
                  <td className="text-[10px] py-2 px-2 text-center font-mono bg-indigo-50/5 border-b border-r border-slate-100 whitespace-nowrap">{getRoundDate(a, '1')}</td>
                  <td className="text-[10px] py-2 px-2 text-center bg-indigo-50/5 border-b border-r border-slate-100 truncate max-w-[105px]" title={getRoundColor(a, '1')}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <span>{getRoundColor(a, '1')}</span>
                      {getRoundAttachmentsCount(a, '1') > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewRoundPhotos(a, '1');
                          }}
                          title={`Click to zoom ${getRoundAttachmentsCount(a, '1')} photo(s)`}
                          className="inline-flex items-center text-indigo-700 bg-indigo-100 hover:bg-indigo-200 border border-indigo-200 rounded px-1 py-0.2 text-[8px] font-bold cursor-pointer transition-colors"
                        >
                          <Camera className="w-2.5 h-2.5 mr-0.5" />
                          {getRoundAttachmentsCount(a, '1')}
                        </button>
                      )}
                    </span>
                  </td>

                  {/* ROUND 2 */}
                  <td className="text-[10px] py-2 px-2 text-center font-mono bg-amber-50/5 border-b border-r border-slate-100 whitespace-nowrap">{getRoundDate(a, '2')}</td>
                  <td className="text-[10px] py-2 px-2 text-center bg-amber-50/5 border-b border-r border-slate-100 truncate max-w-[105px]" title={getRoundColor(a, '2')}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <span>{getRoundColor(a, '2')}</span>
                      {getRoundAttachmentsCount(a, '2') > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewRoundPhotos(a, '2');
                          }}
                          title={`Click to zoom ${getRoundAttachmentsCount(a, '2')} photo(s)`}
                          className="inline-flex items-center text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-200 rounded px-1 py-0.2 text-[8px] font-bold cursor-pointer transition-colors"
                        >
                          <Camera className="w-2.5 h-2.5 mr-0.5" />
                          {getRoundAttachmentsCount(a, '2')}
                        </button>
                      )}
                    </span>
                  </td>

                  {/* ROUND 3 */}
                  <td className="text-[10px] py-2 px-2 text-center font-mono bg-emerald-50/5 border-b border-r border-slate-100 whitespace-nowrap">{getRoundDate(a, '3')}</td>
                  <td className="text-[10px] py-2 px-2 text-center bg-emerald-50/5 border-b border-r border-slate-100 truncate max-w-[105px]" title={getRoundColor(a, '3')}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <span>{getRoundColor(a, '3')}</span>
                      {getRoundAttachmentsCount(a, '3') > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewRoundPhotos(a, '3');
                          }}
                          title={`Click to zoom ${getRoundAttachmentsCount(a, '3')} photo(s)`}
                          className="inline-flex items-center text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 rounded px-1 py-0.2 text-[8px] font-bold cursor-pointer transition-colors"
                        >
                          <Camera className="w-2.5 h-2.5 mr-0.5" />
                          {getRoundAttachmentsCount(a, '3')}
                        </button>
                      )}
                    </span>
                  </td>

                  {/* ROUND 4 */}
                  <td className="text-[10px] py-2 px-2 text-center font-mono bg-purple-50/5 border-b border-r border-slate-100 whitespace-nowrap">{getRoundDate(a, '4')}</td>
                  <td className="text-[10px] py-2 px-2 text-center bg-purple-50/5 border-b border-r border-slate-100 truncate max-w-[105px]" title={getRoundColor(a, '4')}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <span>{getRoundColor(a, '4')}</span>
                      {getRoundAttachmentsCount(a, '4') > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewRoundPhotos(a, '4');
                          }}
                          title={`Click to zoom ${getRoundAttachmentsCount(a, '4')} photo(s)`}
                          className="inline-flex items-center text-purple-800 bg-purple-100 hover:bg-purple-200 border border-purple-200 rounded px-1 py-0.2 text-[8px] font-bold cursor-pointer transition-colors"
                        >
                          <Camera className="w-2.5 h-2.5 mr-0.5" />
                          {getRoundAttachmentsCount(a, '4')}
                        </button>
                      )}
                    </span>
                  </td>

                  {/* ROUND 5 */}
                  <td className="text-[10px] py-2 px-2 text-center font-mono bg-rose-50/5 border-b border-r border-slate-100 whitespace-nowrap">{getRoundDate(a, '5')}</td>
                  <td className="text-[10px] py-2 px-2 text-center bg-rose-50/5 border-b border-slate-200 truncate max-w-[105px]" title={getRoundColor(a, '5')}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <span>{getRoundColor(a, '5')}</span>
                      {getRoundAttachmentsCount(a, '5') > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewRoundPhotos(a, '5');
                          }}
                          title={`Click to zoom ${getRoundAttachmentsCount(a, '5')} photo(s)`}
                          className="inline-flex items-center text-rose-800 bg-rose-100 hover:bg-rose-200 border border-rose-200 rounded px-1 py-0.2 text-[8px] font-bold cursor-pointer transition-colors"
                        >
                          <Camera className="w-2.5 h-2.5 mr-0.5" />
                          {getRoundAttachmentsCount(a, '5')}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

        {/* Table footer with simple, clean guidance */}
        <div className="py-2.5 px-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3 flex-wrap font-medium">
            <span className="text-indigo-600 font-bold">📌 Frozen Columns:</span> Model Name & Email stay pinned when scrolling horizontally.
            <span className="text-slate-400">•</span>
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> In Sheet & Emailed
            </span>
            <span className="flex items-center gap-1 font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Missing in Sheet / No Mail
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500 font-medium">
            <span>↔️ Drag horizontal scrollbar above to view Size to Round 5</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface HistoryTabProps {
  onEdit: (submissionId: string, round: string) => void;
}

export function HistoryTab({ onEdit }: HistoryTabProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});
  const [syncingAllSubId, setSyncingAllSubId] = useState<string | null>(null);

  // Scroll helper function for expanded table
  const scrollTable = (subId: string, target: 'left' | 'right' | number) => {
    const el = document.getElementById(`scroll-container-${subId}`);
    if (!el) return;
    if (typeof target === 'number') {
      el.scrollTo({ left: target, behavior: 'smooth' });
    } else if (target === 'left') {
      el.scrollBy({ left: -280, behavior: 'smooth' });
    } else {
      el.scrollBy({ left: 280, behavior: 'smooth' });
    }
  };

  const getRoundDate = (assignment: any, round: string) => {
    const rData = assignment[`round${round}`];
    if (rData && rData.given_for_fit_date) return rData.given_for_fit_date;
    return '-';
  };

  const getRoundColor = (assignment: any, round: string) => {
    const rData = assignment[`round${round}`];
    if (rData && rData.color) return rData.color;
    // Fallback to base color for round 1 if round1 object doesn't have it
    if (round === '1') return assignment.color || '-';
    return '-';
  };

  const getRoundAttachments = (assignment: any, round: string): any[] => {
    const rData = assignment[`round${round}`];
    if (rData && Array.isArray(rData.attachments)) {
      return rData.attachments;
    }
    return [];
  };

  const getRoundAttachmentsCount = (assignment: any, round: string): number => {
    const rData = assignment[`round${round}`];
    if (rData && Array.isArray(rData.attachments)) {
      return rData.attachments.length;
    }
    return 0;
  };

  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomImages, setZoomImages] = useState<Array<{ id?: string; name?: string; url: string; size?: number; type?: string }>>([]);
  const [zoomIndex, setZoomIndex] = useState(0);

  const handleViewRoundPhotos = (assignment: any, round: string) => {
    const atts = getRoundAttachments(assignment, round);
    const imgs = atts
      .filter((a: any) => (a.dataUrl || a.url) && (!a.type || a.type.startsWith('image/')))
      .map((a: any, idx: number) => ({
        id: a.id || `photo-${idx}`,
        name: a.name || `${assignment.model_name || 'Model'} - Round ${round} Photo`,
        url: a.dataUrl || a.url,
        size: a.size,
        type: a.type
      }));

    if (imgs.length > 0) {
      setZoomImages(imgs);
      setZoomIndex(0);
      setZoomModalOpen(true);
    } else {
      toast.info(`No previewable image attachments found for Round ${round}.`);
    }
  };

  const handleSyncModel = async (sub: Submission, assignment: any) => {
    setSyncingMap(prev => ({ ...prev, [assignment.id]: true }));
    toast.info(`Sending email & saving to Google Sheet for ${assignment.model_name}...`);

    try {
      const result = await syncAssignmentToGoogleSheets(sub, assignment, '1', true);
      if (result.success) {
        toast.success(`Successfully saved to Google Sheet & emailed ${assignment.model_name}!`);

        // Update local storage sync map
        try {
          const cachedMap = JSON.parse(localStorage.getItem('fit_synced_assignments_map') || '{}');
          cachedMap[assignment.id] = true;
          localStorage.setItem('fit_synced_assignments_map', JSON.stringify(cachedMap));
        } catch (e) {}

        // Update in Supabase
        try {
          await supabase
            .from('assignments')
            .update({
              sheet_synced: true,
              email_sent: true,
              synced_at: new Date().toISOString()
            })
            .eq('id', assignment.id);
        } catch (err) {
          console.warn("Supabase assignment update error:", err);
        }

        // Update in Firestore
        try {
          await safeFirestoreWrite(async () => {
            await setDoc(doc(db, 'assignments', assignment.id), {
              sheet_synced: true,
              email_sent: true,
              synced_at: new Date().toISOString()
            }, { merge: true });
          });
        } catch (fErr) {
          console.warn("Firestore assignment update error:", fErr);
        }

        // Update local state in submissions
        setSubmissions(prev => prev.map(s => {
          if (s.id !== sub.id) return s;
          return {
            ...s,
            assignments: s.assignments?.map(a => {
              if (a.id !== assignment.id) return a;
              return { ...a, sheet_synced: true, email_sent: true };
            })
          };
        }));
      } else {
        toast.error(`Failed to sync ${assignment.model_name}: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error(`Error syncing ${assignment.model_name}: ${err?.message || 'Check connection'}`);
    } finally {
      setSyncingMap(prev => ({ ...prev, [assignment.id]: false }));
    }
  };

  const handleSyncAllMissing = async (sub: Submission) => {
    const unsynced = (sub.assignments || []).filter(a => !isAssignmentSynced(sub, a));
    if (unsynced.length === 0) {
      toast.info("All models for this style are already synced & emailed!");
      return;
    }

    setSyncingAllSubId(sub.id);
    const toastId = toast.loading(`Syncing 1/${unsynced.length} models for ${sub.style_number}...`);

    let successCount = 0;
    for (let i = 0; i < unsynced.length; i++) {
      const a = unsynced[i];
      toast.loading(`Syncing ${i + 1}/${unsynced.length}: ${a.model_name}...`, { id: toastId });
      setSyncingMap(prev => ({ ...prev, [a.id]: true }));

      try {
        const res = await syncAssignmentToGoogleSheets(sub, a, '1', true);
        if (res.success) {
          successCount++;
          // Update local cache
          try {
            const cachedMap = JSON.parse(localStorage.getItem('fit_synced_assignments_map') || '{}');
            cachedMap[a.id] = true;
            localStorage.setItem('fit_synced_assignments_map', JSON.stringify(cachedMap));
          } catch (e) {}

          // Update DB
          try {
            await supabase.from('assignments').update({ sheet_synced: true, email_sent: true }).eq('id', a.id);
          } catch (e) {}
          try {
            await safeFirestoreWrite(async () => {
              await setDoc(doc(db, 'assignments', a.id), { sheet_synced: true, email_sent: true }, { merge: true });
            });
          } catch (e) {}
        }
      } catch (e) {
        console.error(`Failed to sync model ${a.model_name}:`, e);
      } finally {
        setSyncingMap(prev => ({ ...prev, [a.id]: false }));
      }

      // 650ms delay between calls to prevent Google Apps Script lock timeouts
      if (i < unsynced.length - 1) {
        await new Promise(r => setTimeout(r, 650));
      }
    }

    setSyncingAllSubId(null);
    toast.dismiss(toastId);

    if (successCount === unsynced.length) {
      toast.success(`All ${successCount} models successfully synced to Google Sheet & emailed!`);
    } else {
      toast.warning(`${successCount}/${unsynced.length} models synced. Check details.`);
    }

    fetchSubmissions();
  };

  const handleDeleteModel = async (subId: string, assignmentId: string, modelName: string) => {
    if (!confirm(`Are you sure you want to remove ${modelName} from this style? This will delete the assignment from history.`)) {
      return;
    }

    try {
      // Delete from Supabase
      try {
        await supabase.from('assignments').delete().eq('id', assignmentId);
      } catch (e) {
        console.warn("Supabase delete failed:", e);
      }

      // Delete from Firestore
      try {
        await safeFirestoreWrite(async () => {
          await deleteDoc(doc(db, 'assignments', assignmentId));
        });
      } catch (e) {
        console.warn("Firestore delete failed:", e);
      }

      // Update local state
      setSubmissions(prev => prev.map(s => {
        if (s.id !== subId) return s;
        return {
          ...s,
          assignments: s.assignments?.filter(a => a.id !== assignmentId)
        };
      }));

      toast.success(`Removed ${modelName} from submission`);
    } catch (err: any) {
      console.error("Delete model error:", err);
      toast.error("Failed to delete model assignment");
    }
  };

  const handleDeleteAllUnsynced = async (sub: Submission) => {
    const unsynced = (sub.assignments || []).filter(a => !isAssignmentSynced(sub, a));
    if (unsynced.length === 0) {
      toast.info("No unsynced models to remove.");
      return;
    }

    if (!confirm(`Remove ${unsynced.length} models that were NOT saved to Google Sheets / did not receive email? They will be removed from history so only verified models remain.`)) {
      return;
    }

    const toastId = toast.loading(`Removing ${unsynced.length} unsynced models...`);

    for (const a of unsynced) {
      try {
        await supabase.from('assignments').delete().eq('id', a.id);
      } catch (e) {}
      try {
        await safeFirestoreWrite(async () => {
          await deleteDoc(doc(db, 'assignments', a.id));
        });
      } catch (e) {}
    }

    toast.dismiss(toastId);
    toast.success(`Removed ${unsynced.length} unsynced models from ${sub.style_number}. History is now clean!`);

    // Update state immediately
    setSubmissions(prev => prev.map(s => {
      if (s.id !== sub.id) return s;
      return {
        ...s,
        assignments: s.assignments?.filter(a => isAssignmentSynced(sub, a))
      };
    }));
  };

  const fetchSubmissions = async () => {
    // Instant restore from cache if currently empty
    try {
      if (submissions.length === 0) {
        const cached = localStorage.getItem('fit_submissions_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSubmissions(parsed);
            setLoading(false);
          }
        }
      }
    } catch (e) {}

    try {
      // Try Supabase first with join for assignments
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          assignments(id, model_name, model_email, color, size, round1, round2, round3, round4, round5)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn("Supabase fetch in history failed, falling back to Firestore:", error.message);
        throw error;
      }

      if (data) {
        setSubmissions(data as any);
        try {
          localStorage.setItem('fit_submissions_cache', JSON.stringify(data));
          data.forEach((sub: any) => {
            localStorage.setItem(`fit_cache_sub_${sub.id}`, JSON.stringify(sub));
            if (sub.assignments && Array.isArray(sub.assignments)) {
              localStorage.setItem(`fit_cache_ass_list_${sub.id}`, JSON.stringify(sub.assignments));
              sub.assignments.forEach((a: any) => {
                localStorage.setItem(`fit_cache_ass_${a.id}`, JSON.stringify(a));
              });
            }
          });
        } catch (e) {}
      }
    } catch (err) {
      // Firestore Fallback
      try {
        const q = query(
          collection(db, 'submissions'),
          orderBy('updatedAt', 'desc'),
          limit(100)
        );
        const querySnapshot = await getDocs(q);
        const docs: Submission[] = [];
        
        for (const docSnapshot of querySnapshot.docs) {
          const d = docSnapshot.data();
          
          // Also fetch assignments count/names from Firestore
          const assQ = query(collection(db, 'assignments'), where('submission_id', '==', d.id));
          const assSnap = await getDocs(assQ);
          const assList: any[] = [];
          assSnap.forEach(assDoc => {
            const ad = assDoc.data();
            assList.push({ 
              id: ad.id,
              model_name: ad.model_name,
              model_email: ad.model_email,
              color: ad.color,
              size: ad.size,
              round1: ad.round1,
              round2: ad.round2,
              round3: ad.round3,
              round4: ad.round4,
              round5: ad.round5
            });
          });

          docs.push({
            id: d.id,
            style_number: d.style_number,
            type_of_sample: d.type_of_sample,
            description: d.description,
            series: d.series,
            created_at: d.updatedAt?.toDate().toISOString() || new Date().toISOString(),
            submitted_by: d.submitted_by || 'Unknown',
            assignments: assList
          });
        }
        setSubmissions(docs);
        try {
          localStorage.setItem('fit_submissions_cache', JSON.stringify(docs));
          docs.forEach((sub: any) => {
            localStorage.setItem(`fit_cache_sub_${sub.id}`, JSON.stringify(sub));
            if (sub.assignments && Array.isArray(sub.assignments)) {
              localStorage.setItem(`fit_cache_ass_list_${sub.id}`, JSON.stringify(sub.assignments));
              sub.assignments.forEach((a: any) => {
                localStorage.setItem(`fit_cache_ass_${a.id}`, JSON.stringify(a));
              });
            }
          });
        } catch (e) {}
      } catch (fErr) {
        console.error("Firestore history fallback also failed:", fErr);
        toast.error("Failed to load submission history");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const filteredSubmissions = submissions.filter(s => 
    s.style_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.series?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubmissions();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Submission History</h2>
          <p className="text-sm text-slate-500">View and manage previous sample fit requests</p>
        </div>
        <div className="flex w-full md:w-auto gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search style or series..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 italic">No submissions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <Table className="w-full table-fixed min-w-[780px]">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold py-4 w-[160px]">Style No</TableHead>
                    <TableHead className="font-bold w-[180px]">Models</TableHead>
                    <TableHead className="font-bold">Details</TableHead>
                    <TableHead className="font-bold w-[110px]">Created</TableHead>
                    <TableHead className="font-bold w-[100px]">Series</TableHead>
                    <TableHead className="text-right font-bold pr-6 w-[280px]">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((sub) => (
                      <React.Fragment key={sub.id}>
                        <TableRow className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                          <TableCell className="font-mono font-medium py-4">
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                                <Plus className={`w-3 h-3 transition-transform ${expandedId === sub.id ? 'rotate-45' : ''}`} />
                              </Button>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900">{sub.style_number}</span>
                                {(() => {
                                  const total = sub.assignments?.length || 0;
                                  if (total === 0) return null;
                                  const synced = sub.assignments?.filter(a => isAssignmentSynced(sub, a)).length || 0;
                                  if (synced === total) {
                                    return (
                                      <span className="text-[9px] font-semibold text-emerald-700 flex items-center gap-0.5">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> All in Sheet
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="text-[9px] font-bold text-amber-700 flex items-center gap-0.5">
                                      <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> {synced}/{total} in Sheet
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[210px]">
                              {sub.assignments && sub.assignments.length > 0 ? (
                                sub.assignments.map((a, idx) => {
                                  const isSynced = isAssignmentSynced(sub, a);
                                  return (
                                    <Badge 
                                      key={idx} 
                                      variant="outline" 
                                      className={`text-[9px] px-1.5 py-0 flex items-center gap-1 ${
                                        isSynced 
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                          : 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                                      }`}
                                      title={isSynced ? `${a.model_name}: In Google Sheet & Emailed` : `${a.model_name}: NOT in Google Sheet / No Mail Sent`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSynced ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                      <span className="truncate max-w-[75px]">{a.model_name}</span>
                                      {!isSynced && <span className="text-[8px] text-amber-700 font-bold">⚠️</span>}
                                    </Badge>
                                  );
                                })
                              ) : (
                                <span className="text-[10px] text-slate-400">No models</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm text-slate-900 font-medium">{sub.type_of_sample}</span>
                              <span className="text-xs text-slate-500 line-clamp-1">{sub.description}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <Calendar className="w-3 h-3" />
                              {new Date(sub.created_at).toLocaleDateString('en-GB')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] uppercase font-bold px-2 py-0">
                              {sub.series}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                onClick={() => onEdit(sub.id, '2')}
                              >
                                Round 2
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
                                onClick={() => onEdit(sub.id, '3')}
                              >
                                Round 3
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                                onClick={() => onEdit(sub.id, '4')}
                              >
                                Round 4
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => onEdit(sub.id, '5')}
                              >
                                Round 5
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-[11px] border-primary/40 text-primary hover:bg-primary/10 font-bold"
                                onClick={() => onEdit(sub.id, '1')}
                                title="Edit Round 1 details, color, size, and photo"
                              >
                                Edit R1
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* EXPANDABLE DETAILS BOX */}
                        {expandedId === sub.id && (
                          <TableRow className="bg-slate-50/30 border-b-2 border-indigo-50">
                            <TableCell colSpan={6} className="p-3 w-full max-w-0">
                              <div className="w-full max-w-full overflow-hidden">
                                <ModelAssignmentDetailsTable
                                  sub={sub}
                                  onEdit={onEdit}
                                  onViewRoundPhotos={handleViewRoundPhotos}
                                  getRoundDate={getRoundDate}
                                  getRoundColor={getRoundColor}
                                  getRoundAttachmentsCount={getRoundAttachmentsCount}
                                  onSyncModel={handleSyncModel}
                                  onSyncAllMissing={handleSyncAllMissing}
                                  onDeleteModel={handleDeleteModel}
                                  onDeleteAllUnsynced={handleDeleteAllUnsynced}
                                  syncingMap={syncingMap}
                                  syncingAllSubId={syncingAllSubId}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full-screen photo zoom modal */}
      <ImageZoomModal
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        images={zoomImages}
        initialIndex={zoomIndex}
      />
    </div>
  );
}
