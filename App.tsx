
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, Camera, Mic, X, RefreshCcw, Loader2, 
  Image as ImageIcon, Database, CheckCircle2, Globe, Sparkles, Zap, ExternalLink, Info, AlertCircle
} from 'lucide-react';
import { CDPModel } from './types';
import { identifyModelFromImage, fetchSpecsWithAI } from './geminiService';
import { supabase } from './supabaseClient';

interface CDPDbModel extends CDPModel {
  id?: string | number;
  source?: 'cloud' | 'ai';
  isAiGenerated?: boolean;
}

const App: React.FC = () => {
  const [cloudData, setCloudData] = useState<CDPDbModel[]>([]);
  const [sessionAiData, setSessionAiData] = useState<CDPDbModel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isListening, setIsListening] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  
  const [aiStatus, setAiStatus] = useState<'ready' | 'missing_key' | 'checking'>('checking');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const key = process.env.API_KEY;
    setAiStatus((key && key !== 'undefined' && key.length > 10) ? 'ready' : 'missing_key');
    fetchAllCloudData();
  }, []);

  const fetchAllCloudData = async () => {
    setIsLoading(true);
    if (!supabase) {
      setIsLoading(false);
      showToast("Cloud Connection Failed", "error");
      return;
    }

    try {
      let allResults: CDPDbModel[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('cdp_models')
          .select('*')
          .order('model', { ascending: true })
          .range(from, from + 999);

        if (error) throw error;
        
        if (data && data.length > 0) {
          const mapped = data.map(r => ({ ...r, source: 'cloud' as const }));
          allResults = [...allResults, ...mapped];
          if (data.length < 1000) hasMore = false;
          else from += 1000;
        } else {
          hasMore = false;
        }
      }
      setCloudData(allResults);
    } catch (err) {
      showToast("Database Error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const combinedData = useMemo(() => {
    const all = [...cloudData, ...sessionAiData];
    return all.sort((a, b) => a.model.localeCompare(b.model));
  }, [cloudData, sessionAiData]);

  const filteredResults = useMemo(() => {
    if (!searchTerm.trim()) return combinedData;
    const term = normalize(searchTerm);
    
    return combinedData.filter(item => {
      const model = normalize(item.model);
      return model.includes(term) || term.includes(model);
    });
  }, [searchTerm, combinedData]);

  const handleAISearch = async (modelToSearch: string) => {
    if (!modelToSearch || aiStatus !== 'ready') return;
    
    setIsSearchingAI(true);
    try {
      const specs = await fetchSpecsWithAI(modelToSearch);
      if (specs) {
        const newResult: CDPDbModel = {
          model: modelToSearch.toUpperCase(),
          dac: specs.dac,
          laser: specs.laser,
          isAiGenerated: true,
          source: 'ai'
        };
        setSessionAiData(prev => [newResult, ...prev]);
        setSearchTerm(modelToSearch);
        showToast(`AI Found Specs for ${modelToSearch}`, "success");
      } else {
        showToast("AI could not find specs", "error");
      }
    } catch (err) {
      showToast("AI Search Error", "error");
    } finally {
      setIsSearchingAI(false);
    }
  };

  const processImage = async (data: string) => {
    setIsProcessingImage(true);
    try {
      const detected = await identifyModelFromImage(data);
      if (detected) {
        setSearchTerm(detected);
        showToast(`Identified: ${detected}`, 'success');
        
        // ตรวจสอบว่ามีข้อมูลใน Database ไหม (แบบ Fuzzy)
        const term = normalize(detected);
        const hasMatch = cloudData.some(m => {
          const mModel = normalize(m.model);
          return mModel.includes(term) || term.includes(mModel);
        });

        // ถ้าไม่มีข้อมูลในฐานข้อมูล ให้ AI ไปหามาให้เลยทันที
        if (!hasMatch && aiStatus === 'ready') {
          await handleAISearch(detected);
        }
      } else {
        showToast("No model detected in image", "error");
      }
    } catch (err) { 
      showToast("Vision Error", "error"); 
    } finally { 
      setIsProcessingImage(false); 
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // ตั้งค่าความคมชัดสูง
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.95);
      closeCamera();
      await processImage(imageData);
    }
  };

  const openCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { 
      setIsCameraActive(false); 
      showToast("Cannot access camera", "error"); 
    }
  };

  const closeCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setIsCameraActive(false);
  };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-slate-50 shadow-2xl relative font-sans pb-24 overflow-x-hidden">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 w-[90%] border-l-8 ${toast.type === 'success' ? 'bg-white text-emerald-800 border-emerald-500' : 'bg-white text-rose-800 border-rose-500'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" /> : <AlertCircle className="w-6 h-6 text-rose-500 shrink-0" />}
          <span className="text-sm font-black">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#0f172a] text-white p-6 sticky top-0 z-40 shadow-xl border-b border-white/5">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Database className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black italic tracking-tighter text-blue-400">CD FINDER</h1>
          </div>
          <button onClick={fetchAllCloudData} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 active:scale-90 transition-all border border-white/10">
            <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="bg-blue-500/10 px-4 py-2 rounded-2xl border border-blue-500/20">
            <p className="text-[10px] text-blue-300 uppercase tracking-widest font-black flex items-center gap-2">
              <Globe className="w-3.5 h-3.5" /> 
              {isLoading ? 'SYNCING...' : `${cloudData.length} MODELS READY`}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 border shadow-sm ${aiStatus === 'ready' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            <Zap className={`w-3.5 h-3.5 ${aiStatus === 'ready' ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-tighter">{aiStatus === 'ready' ? 'GEMINI ON' : 'AI OFF'}</span>
          </div>
        </div>
      </header>

      {/* Search & Actions */}
      <div className="p-4 bg-white/95 backdrop-blur-xl sticky top-[146px] z-30 shadow-md border-b space-y-4">
        <div className="relative">
          <input 
            type="text"
            placeholder="Search model, DAC or laser..."
            className="w-full pl-14 pr-12 py-5 bg-slate-100 rounded-[2.2rem] border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-lg placeholder:text-slate-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 w-6 h-6" />
          {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 bg-slate-200 rounded-full p-1"><X className="w-4 h-4" /></button>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button onClick={openCamera} className="flex flex-col items-center justify-center gap-2 py-5 bg-[#2563eb] text-white rounded-[2rem] active:scale-95 shadow-xl shadow-blue-200 transition-all">
            <Camera className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Scan</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-5 bg-white text-slate-600 rounded-[2rem] border-2 border-slate-100 shadow-sm"><ImageIcon className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Gallery</span></button>
          <button onClick={() => {(window as any).SpeechRecognition ? showToast("Coming Soon", "success") : showToast("Not supported", "error")}} className="flex flex-col items-center justify-center gap-2 py-5 bg-white text-slate-600 rounded-[2rem] border-2 border-slate-100 shadow-sm"><Mic className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Voice</span></button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 p-5 space-y-5">
        {(isProcessingImage || isSearchingAI) && (
          <div className="bg-[#1e293b] p-12 rounded-[3rem] text-center text-white space-y-5 animate-pulse shadow-2xl border-4 border-blue-500/20">
            {isProcessingImage ? <Camera className="w-16 h-16 mx-auto animate-bounce text-blue-400" /> : <Sparkles className="w-16 h-16 mx-auto animate-bounce text-purple-400" />}
            <div className="space-y-2">
              <p className="font-black text-xl uppercase tracking-widest italic">{isProcessingImage ? 'AI VISION' : 'AI SPECS'}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI is analyzing the hardware...</p>
            </div>
          </div>
        )}

        {!isLoading && filteredResults.length > 0 ? (
          filteredResults.map((item, idx) => (
            <div key={item.id || `${item.model}-${idx}`} className="bg-white border-2 border-slate-100 rounded-[2.8rem] p-8 shadow-sm hover:shadow-xl transition-all animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-7 flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl border shadow-sm flex items-center gap-2 ${item.source === 'ai' ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                      {item.source === 'ai' ? <Sparkles className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                      {item.source === 'ai' ? 'AI SEARCHED' : 'DATABASE'}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 text-3xl italic leading-tight break-words pr-4 tracking-tighter uppercase">{item.model}</h3>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl text-slate-200 transition-colors">
                   <ExternalLink className="w-6 h-6" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-slate-50 p-7 rounded-[2.2rem] border border-slate-100 transition-all hover:bg-white hover:shadow-md">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-3 mb-3"><div className="w-2 h-2 rounded-full bg-blue-500"></div> DAC CHIP</p>
                  <p className="text-lg font-black text-slate-800 break-words leading-tight">{item.dac || '-'}</p>
                </div>
                <div className="bg-slate-50 p-7 rounded-[2.2rem] border border-slate-100 transition-all hover:bg-white hover:shadow-md">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-3 mb-3"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> OPTICAL UNIT</p>
                  <p className="text-lg font-black text-slate-800 break-words leading-tight">{item.laser || '-'}</p>
                </div>
              </div>
            </div>
          ))
        ) : !isLoading && !isProcessingImage && !isSearchingAI && (
          <div className="py-24 text-center space-y-10">
            <div className="w-40 h-40 bg-slate-100 rounded-[4rem] mx-auto flex items-center justify-center border-8 border-white shadow-2xl rotate-3">
               <Search className="w-16 h-16 text-slate-200" />
            </div>
            <div className="space-y-6 px-10">
               <p className="text-2xl font-black uppercase tracking-tighter text-slate-900 italic">No Results</p>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">"{searchTerm || 'Model'}" was not found in our database.</p>
               {searchTerm && aiStatus === 'ready' && (
                 <button onClick={() => handleAISearch(searchTerm)} className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4">
                   <Sparkles className="w-7 h-7" /> Use Gemini AI
                 </button>
               )}
            </div>
          </div>
        )}
      </main>

      {/* Camera UI */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="p-8 flex justify-between items-center text-white absolute top-0 w-full z-10">
            <div className="flex items-center gap-3 bg-black/40 px-5 py-2 rounded-full backdrop-blur-md border border-white/20">
               <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
               <span className="font-black text-[11px] tracking-widest uppercase italic">Vision Ready</span>
            </div>
            <button onClick={closeCamera} className="bg-white/10 p-4 rounded-full backdrop-blur-xl active:scale-90 border border-white/20"><X className="w-7 h-7" /></button>
          </div>
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
            <div className="w-full aspect-[4/3] border-4 border-blue-400 rounded-[3.5rem] animate-pulse shadow-[0_0_150px_rgba(59,130,246,0.4)] relative">
               <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-blue-400 rounded-tl-3xl"></div>
               <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-blue-400 rounded-tr-3xl"></div>
               <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-blue-400 rounded-bl-3xl"></div>
               <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-blue-400 rounded-br-3xl"></div>
            </div>
          </div>
          <div className="absolute bottom-16 w-full flex justify-center">
            <button onClick={captureImage} className="w-32 h-32 rounded-full border-[10px] border-white/30 bg-white/10 active:scale-90 transition-all flex items-center justify-center backdrop-blur-sm">
               <div className="w-24 h-24 bg-white rounded-full shadow-2xl flex items-center justify-center"><Camera className="w-12 h-12 text-slate-900" /></div>
            </button>
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          const r = new FileReader();
          r.onload = (ev) => processImage(ev.target?.result as string);
          r.readAsDataURL(file);
        }
      }} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
