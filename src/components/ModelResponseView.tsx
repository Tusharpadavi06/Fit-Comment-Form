import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Loader2, CheckCircle2, Info, Calendar as CalendarIcon, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { saveToGoogleSheets } from '../services/googleSheetsService';

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

  // Form states
  const [receivedDate, setReceivedDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [commentsReceivedDate, setCommentsReceivedDate] = useState(new Date().toLocaleDateString('en-GB'));
  const [beforeWash, setBeforeWash] = useState('');
  const [afterWash, setAfterWash] = useState('');
  const [fabricTrims, setFabricTrims] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: subData } = await supabase
          .from('submissions')
          .select('*')
          .eq('id', submissionId)
          .single();

        const { data: assData } = await supabase
          .from('assignments')
          .select('*')
          .eq('id', assignmentId)
          .single();
        
        if (subData && assData) {
          setSubmissionData(subData);
          setAssignmentData(assData);
        }
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [submissionId, assignmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const responseData = {
        type: 'RESPONSE_SUBMISSION',
        submissionId,
        assignmentId,
        modelName: assignmentData.model_name,
        modelEmail: assignmentData.model_email,
        styleNo: submissionData.style_number,
        sampleType: submissionData.type_of_sample,
        round: String(round),
        receivedDate,
        commentsReceivedDate,
        beforeWash,
        afterWash,
        fabricTrims,
        tabName: submissionData.series || "General"
      };

      // 1. Update Google Sheets
      const sheetResult = await saveToGoogleSheets(responseData);
      
      // 2. Update Supabase
      const roundKey = `round${round}`;
      const { error: dbError } = await supabase
        .from('assignments')
        .update({ 
          [roundKey]: {
            receivedDate,
            commentsReceivedDate,
            beforeWash,
            afterWash,
            fabricTrims,
            submittedAt: new Date().toISOString()
          },
          status: 'completed'
        })
        .eq('id', assignmentId);

      if (dbError) throw dbError;

      setCompleted(true);
      toast.success('Response submitted successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit response');
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

  if (!submissionData || !assignmentData) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center bg-white rounded-xl shadow-sm border mt-10">
        <p className="text-slate-500">Invalid link or assignment not found.</p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="max-w-lg mx-auto p-12 text-center bg-white rounded-xl shadow-lg border mt-10 space-y-6">
        <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Submission Successful!</h2>
          <p className="text-slate-500">Your feedback for Round {round} has been recorded and synced to the tracking sheet.</p>
        </div>
        <Button variant="outline" onClick={() => window.close()} className="w-full">Close Window</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
      {/* Read-Only Sample Details */}
      <Card className="border-0 shadow-sm bg-white overflow-hidden">
        <div className="h-1.5 bg-primary w-full" />
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
