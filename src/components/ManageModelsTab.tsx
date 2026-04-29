import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, Trash2, UserPlus, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';

interface Model {
  id: string;
  name: string;
  email: string;
}

interface ManageModelsTabProps {
  modelPool: Model[];
  loadingModels: boolean;
  onModelsChange: () => Promise<void>;
}

export function ManageModelsTab({ modelPool, loadingModels, onModelsChange }: ManageModelsTabProps) {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    
    setSubmitting(true);
    const toastId = toast.loading('Adding model to pool...');
    try {
      const { error } = await supabase
        .from('models')
        .insert([{ 
          name: newName.trim(), 
          email: newEmail.trim().toLowerCase() 
        }]);

      if (error) {
        if (error.code === '23505') {
          throw new Error('A model with this email already exists.');
        }
        throw error;
      }

      setNewName('');
      setNewEmail('');
      toast.success(`Model "${newName.trim()}" added successfully`, { id: toastId });
      onModelsChange(); // Refresh list via prop
    } catch (error: any) {
      console.error("Add model error:", error);
      toast.error(error.message || 'Failed to add model', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this model?')) return;
    try {
      const { error } = await supabase
        .from('models')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Model removed');
      onModelsChange();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
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

  return (
    <div className="space-y-6 max-w-full mx-auto pb-10">
      <Card className="shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-normal text-slate-900 tracking-tight flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Add New Model
          </CardTitle>
          <CardDescription className="text-xs">Add a model to the pool for sample assignments.</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleAddModel} className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">Model Name <span className="text-destructive">*</span></Label>
              <Input 
                placeholder="e.g. Name of Model" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none"
                required
              />
            </div>
            <div className="space-y-4">
              <Label className="text-base font-normal text-slate-900">Email Address <span className="text-destructive">*</span></Label>
              <Input 
                type="email" 
                placeholder="model@example.com" 
                value={newEmail} 
                onChange={(e) => setNewEmail(e.target.value)}
                className="border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary transition-all bg-transparent h-10 text-base shadow-none"
                required
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" className="px-8 h-10 font-medium" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Model
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="px-1 text-sm font-bold uppercase tracking-widest text-slate-400">Current Pool ({modelPool.length})</h3>
        
        {loadingModels && modelPool.length === 0 ? (
          <div className="flex justify-center p-12 bg-white rounded-lg border shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {modelPool.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-12 text-center text-slate-400">
                  No models added yet. Start by adding one above.
                </CardContent>
              </Card>
            ) : (
              modelPool.map((model) => (
                <Card key={model.id} className="shadow-sm hover:shadow-md transition-shadow group">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {model.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{model.name}</p>
                        <p className="text-sm text-primary font-medium">{model.email}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-slate-300 hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(model.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
