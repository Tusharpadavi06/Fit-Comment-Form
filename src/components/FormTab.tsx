import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Plus, Trash2, Send, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { getSeriesFromStyleNumber } from '../lib/series-utils';
import { v4 as uuidv4 } from 'uuid';
import { saveToGoogleSheets } from '../services/googleSheetsService';

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
}

interface FormTabProps {
  modelPool: ModelListItem[];
  loadingModels: boolean;
  refreshModels: () => Promise<void>;
}

export function FormTab({ modelPool, loadingModels, refreshModels }: FormTabProps) {
  const [typeOfSample, setTypeOfSample] = useState('');
  const [styleNo, setStyleNo] = useState('');
  const [description, setDescription] = useState('');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([
    { id: uuidv4(), modelId: '', modelName: '', modelEmail: '', color: '', size: '' }
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<any>(null);

  const addRow = () => {
    setAssignments([...assignments, { id: uuidv4(), modelId: '', modelName: '', modelEmail: '', color: '', size: '' }]);
  };

  const removeRow = (id: string) => {
    if (assignments.length > 1) {
      setAssignments(assignments.filter(r => r.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof AssignmentRow, value: string) => {
    setAssignments(assignments.map(r => {
      if (r.id === id) {
        if (field === 'modelId') {
          const model = modelPool.find(m => m.id === value);
          return { ...r, modelId: value, modelName: model?.name || '', modelEmail: model?.email || '' };
        }
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeOfSample || !styleNo || !description) {
      toast.error('Please fill in all basic fields');
      return;
    }

    const validAssignments = assignments.filter(a => a.modelId && a.color && a.size);
    if (validAssignments.length === 0) {
      toast.error('Please add at least one valid model assignment');
      return;
    }

    const toastId = toast.loading('Submitting form and notifying models...');
    setSubmitting(true);
    try {
      const submissionId = uuidv4();
      const series = getSeriesFromStyleNumber(styleNo);
      
      // Use override URL if provided (e.g. Shared App URL), otherwise default to current origin
      const appBaseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      
      // 1. Save submission to Supabase
      const { data: subData, error: subError } = await supabase
        .from('submissions')
        .insert([{
          id: submissionId,
          type_of_sample: typeOfSample,
          style_number: styleNo,
          description,
          series,
          submitted_by: 'user@example.com' 
        }])
        .select()
        .single();

      if (subError) throw subError;

      // 2. Prepare Assignments with Links
      const assignmentsWithLinks = validAssignments.map(a => {
        const r1Link = `${appBaseUrl}?submissionId=${submissionId}&assignmentId=${a.id}&round=1`;
        const r2Link = `${appBaseUrl}?submissionId=${submissionId}&assignmentId=${a.id}&round=2`;
        const r3Link = `${appBaseUrl}?submissionId=${submissionId}&assignmentId=${a.id}&round=3`;
        return {
          ...a,
          r1Link,
          r2Link,
          r3Link
        };
      });

      // 3. Save assignments to Supabase - ensuring we use the generated local UUIDs
      const assignmentsToInsert = assignmentsWithLinks.map(a => ({
        id: a.id,
        submission_id: subData.id,
        model_id: a.modelId,
        model_name: a.modelName,
        model_email: a.modelEmail,
        color: a.color,
        size: a.size
      }));

      const { error: assError } = await supabase
        .from('assignments')
        .insert(assignmentsToInsert);

      if (assError) throw assError;

      // Prepare UI for success state
      setLastSubmission({
        id: subData.id,
        assignments: assignmentsWithLinks,
        type: typeOfSample,
        style: styleNo
      });

      // Reset form state
      setTypeOfSample('');
      setStyleNo('');
      setDescription('');
      setAssignments([{ id: uuidv4(), modelId: '', modelName: '', modelEmail: '', color: '', size: '' }]);

      toast.success('Fit Request Saved Successfully', { id: toastId });
      
      // 4. Sync each assignment to Google Sheets in background
      assignmentsWithLinks.forEach(async (a) => {
        try {
          const fitDateFormatted = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
          await saveToGoogleSheets({
            type: 'NEW_SUBMISSION',
            assignmentId: a.id,
            submissionId: submissionId,
            modelName: a.modelName,
            modelEmail: a.modelEmail,
            sampleType: typeOfSample,
            styleNo: styleNo.trim(),
            description: description,
            size: a.size,
            color: a.color,
            sampleGivenDate: fitDateFormatted,
            r1Link: a.r1Link,
            r2Link: a.r2Link,
            r3Link: a.r3Link,
            tabName: series || "General",
            timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          });
        } catch (e) {
          console.error("Sheets sync error:", e);
        }
      });

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
    return (
      <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="overflow-hidden border-t-0 shadow-sm">
          <div className="h-2.5 bg-green-500 w-full"></div>
          <CardHeader className="pt-6 pb-4">
            <CardTitle className="text-3xl font-normal text-slate-900 tracking-tight">Submission Successful!</CardTitle>
            <CardDescription className="text-sm text-slate-600 mt-2">
              Your fit request has been recorded. The models listed below have been notified.
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

          <div className="flex justify-start">
            <Button variant="ghost" className="text-primary" onClick={() => setLastSubmission(null)}>
              Submit another response
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full mx-auto pb-10">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Sample Type Card */}
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

        {/* Style No Card */}
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
                className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none"
                required
              />
              {styleNo && (
                <p className="text-[10px] text-slate-400 italic mt-1">
                  Will be saved in Sheet Tab: <span className="text-primary font-medium">{getSeriesFromStyleNumber(styleNo) || "General"}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Description Card */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">
                Description <span className="text-destructive ml-0.5">*</span>
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

        {/* Assignment Section */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-medium text-slate-800">Model Assignments</h3>
            <Button type="button" variant="ghost" size="sm" onClick={addRow} className="text-primary hover:bg-primary/5">
              <Plus className="w-4 h-4 mr-2" />
              Add Model Row
            </Button>
          </div>

          <div className="space-y-3">
            {assignments.map((row) => (
              <Card key={row.id} className="shadow-sm relative group overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-100 group-hover:bg-primary transition-colors"></div>
                <CardContent className="pt-6 pb-6">
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Model</Label>
                      <Select 
                        value={row.modelId} 
                        onValueChange={(val) => updateRow(row.id, 'modelId', val)}
                      >
                        <SelectTrigger className="border-0 border-b border-slate-200 rounded-none px-0 focus:ring-0 shadow-none h-12 py-2 text-slate-700 bg-transparent flex items-center justify-between">
                          <SelectValue placeholder="Choose model...">
                            {row.modelName || undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-w-[300px]">
                          {loadingModels && modelPool.length === 0 && (
                            <div className="p-4 text-center">
                              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                              <p className="text-[10px] text-slate-400 mt-2">Loading models...</p>
                            </div>
                          )}
                          {!loadingModels && modelPool.length === 0 && (
                            <div className="p-2 text-xs text-slate-400 italic">No models found in database</div>
                          )}
                          {modelPool.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex flex-col text-left">
                                <span className="font-medium text-slate-900">{m.name}</span>
                                <span className="text-[10px] text-slate-500 leading-none">{m.email}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Color</Label>
                      <Input 
                        placeholder="e.g. Navy" 
                        value={row.color} 
                        onChange={e => updateRow(row.id, 'color', e.target.value)}
                        className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-primary transition-all h-9 bg-transparent text-sm"
                      />
                    </div>

                    <div className="space-y-2 relative">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Size</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          placeholder="e.g. Medium" 
                          value={row.size} 
                          onChange={e => updateRow(row.id, 'size', e.target.value)}
                          className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 shadow-none focus-visible:border-primary transition-all h-9 bg-transparent text-sm flex-1"
                        />
                        {assignments.length > 1 && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removeRow(row.id)}
                            className="h-8 w-8 text-slate-300 hover:text-destructive shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-8 px-1 overflow-hidden">
          <Button 
            type="button" 
            variant="ghost" 
            onClick={() => {
              if (confirm('Are you sure you want to clear the form?')) {
                setTypeOfSample('');
                setStyleNo('');
                setDescription('');
                setAssignments([{ id: uuidv4(), modelId: '', modelName: '', modelEmail: '', color: '', size: '' }]);
              }
            }}
            className="text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
          >
            Clear form
          </Button>

          <Button type="submit" size="lg" className="px-8 h-10 font-medium" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
