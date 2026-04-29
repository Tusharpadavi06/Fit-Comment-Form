/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { LogIn, LogOut, User as UserIcon, FileText, Users } from 'lucide-react';
import { FormTab } from './components/FormTab';
import { ManageModelsTab } from './components/ManageModelsTab';
import { ModelResponseView } from './components/ModelResponseView';
import { Toaster } from './components/ui/sonner';
import { supabase } from './lib/supabase';

export default function App() {
  const [activeTab, setActiveTab] = useState('form');
  const [modelPool, setModelPool] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);

  // Fetch model pool once at app level with local cache
  const fetchModelPool = async () => {
    try {
      // Check cache first
      const cached = localStorage.getItem('model_pool_cache');
      if (cached) {
        setModelPool(JSON.parse(cached));
        setLoadingModels(false);
      }

      const { data, error } = await supabase
        .from('models')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      if (data) {
        setModelPool(data);
        localStorage.setItem('model_pool_cache', JSON.stringify(data));
      }
    } catch (error) {
      console.error("Error fetching models at App level:", error);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModelPool();
  }, []);

  // Check for response link in URL
  const query = new URLSearchParams(window.location.search);
  const submissionId = query.get('submissionId');
  const assignmentId = query.get('assignmentId');
  const round = query.get('round');

  // If viewing a response link
  if (submissionId && assignmentId) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <Toaster />
        <div className="max-w-3xl mx-auto">
          <ModelResponseView 
            submissionId={submissionId} 
            assignmentId={assignmentId} 
            round={round || '1'} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0ebf8] font-sans selection:bg-[#d1c4e9]">
      <Toaster />
      <div className="w-full h-2.5 bg-primary rounded-t-lg hidden md:block"></div>
      
      <main className="max-w-2xl mx-auto mt-6 px-4 pb-20">
        {/* Header Image and Box */}
        <div className="mb-6 rounded-xl overflow-hidden bg-white shadow-sm border border-slate-200">
          <img 
            src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=1200&h=300" 
            alt="Apparel Management" 
            className="w-full h-40 object-cover"
          />
          <div className="p-6 border-b">
            <h1 className="text-2xl font-normal text-slate-900 tracking-tight">Sample Fit Request</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Assign samples to models for fitting comments. Feedback is synced automatically.
            </p>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white">
            <div className="flex justify-center py-4 border-b bg-slate-50/30">
              <TabsList className="bg-white border shadow-sm p-1 h-auto gap-2">
                <TabsTrigger 
                  value="form" 
                  className="px-10 py-2.5 rounded-md data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all font-medium"
                >
                  Form
                </TabsTrigger>
                <TabsTrigger 
                  value="models" 
                  className="px-10 py-2.5 rounded-md data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all font-medium"
                >
                  Models
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 bg-[#f0ebf8]">
              <TabsContent value="form" className="outline-none mt-0">
                <FormTab 
                  modelPool={modelPool} 
                  loadingModels={loadingModels} 
                  refreshModels={fetchModelPool} 
                />
              </TabsContent>

              <TabsContent value="models" className="outline-none mt-0">
                <ManageModelsTab 
                  modelPool={modelPool} 
                  loadingModels={loadingModels} 
                  onModelsChange={fetchModelPool} 
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t py-2 px-4 text-center text-[10px] text-slate-400 font-medium md:hidden shadow-lg">
        Fit Comment System
      </footer>
    </div>
  );
}
