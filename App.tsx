
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
          allResults = [...allResults, ...data.map(r => ({ ...r, source: 'cloud' as const }))];
          if (data.length < 1000) hasMore = false;
          else from += 1000;
        } else hasMore = false;
      }
      setCloudData(allResults);
    } catch (err) {
      showToast("Database Sync Error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const combinedData = useMemo(() => {
    const all = [...cloudData, ...sessionAiData];
    // ลบตัวซ้ำ
    const unique = all.reduce((acc: CDPDbModel[], current) => {
      const x = acc.find(item => normalize(item.model) === normalize(current.model));
      if (!x) return acc.concat([current]);
      return acc;
    }, []);
    return unique.sort((a, b) => a.model.localeCompare(b.model));
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
        showToast("AI could not find exact specs", "error");
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
        
        // เช็คว่ามีใน DB ไหม
        const term = normalize(detected);
        const exists = cloudData.some(m => normalize(m.model).includes(term) || term.includes(normalize(m.model)));
        
        if (!exists && aiStatus === 'ready') {
          showToast(`Detected: ${detected}. Fetching specs...`, 'success');
          await handleAISearch(detected);
        } else {
          showToast(`Identified: ${detected}`, 'success');
        }
      } else {
        showToast("ไม่พบรุ่นในรูปภาพ (ลองเล็งให้ชัดกว่านี้)", "error");
      }
    } catch (err) { 
      showToast("Vision Process Error", "error"); 
    } finally { 
      setIsProcessingImage(false); 
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // ตั้งค่าความละเอียดสูง
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/png'); // PNG เพื่อ OCR ที่แม่นยำกว่า
      closeCamera();
      await processImage(imageData);
    }
  };

  const openCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', 
          width: { ideal: 4096 },
          height: { ideal: 2160 } 
        } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { 
      setIsCameraActive(false); 
      showToast("Camera access denied", "error"); 
    }
  };

  const closeCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setIsCameraActive(false);
  };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f8fafc] shadow-2xl relative font-sans pb-24 overflow-x-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 w-[90%] border-l-[6px] ${toast.type === 'success' ? 'bg-white text-emerald-800 border-emerald-500' : 'bg-white text-rose-800 border-rose-500'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" /> : <AlertCircle className="w-6 h-6 text-rose-500 shrink-0" />}
          <span className="text-sm font-black italic">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#0f172a] text-white p-6 sticky top-0 z-40 shadow-2xl border-b border-white/5">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-500/30">
              <Database className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black italic tracking-tighter text-blue-400">CD FINDER</h1>
          </div>
          <button onClick={fetchAllCloudData} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 border border-white/10 transition-all active:scale-90">
            <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="bg-blue-500/10 px-4 py-2 rounded-2xl border border-blue-500/20">
            <p className="text-[10px] text-blue-300 uppercase tracking-widest font-black flex items-center gap-2">
              <Globe className="w-3.5 h-3.5" /> 
              {isLoading ? 'SYNCING...' : `${cloudData.length} MODELS`}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 border shadow-sm ${aiStatus === 'ready' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            <Zap className={`w-3.5 h-3.5 ${aiStatus === 'ready' ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-tighter">{aiStatus === 'ready' ? 'GEMINI 3 ON' : 'AI ERROR'}</span>
          </div>
        </div>
      </header>

      {/* Search Bar & Actions */}
      <div className="p-4 bg-white/95 backdrop-blur-xl sticky top-[146px] z-30 shadow-md border-b space-y-4">
        <div className="relative">
          <input 
            type="text"
            placeholder="Search model, DAC, etc..."
            className="w-full pl-14 pr-12 py-5 bg-slate-100 rounded-[2.2rem] border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-lg placeholder:text-slate-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 w-6 h-6" />
          {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 bg-slate-200 rounded-full p-1"><X className="w-4 h-4" /></button>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button onClick={openCamera} className="flex flex-col items-center justify-center gap-2 py-5 bg-[#2563eb] text-white rounded-[2rem] active:scale-95 shadow-xl shadow-blue-200 transition-all border-b-4 border-blue-800">
            <Camera className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">AI Scan</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-5 bg-white text-slate-600 rounded-[2rem] border-2 border-slate-100 shadow-sm transition-all active:scale-95"><ImageIcon className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Gallery</span></button>
          <button onClick={() => showToast("Microphone feature active", "success")} className="flex flex-col items-center justify-center gap-2 py-5 bg-white text-slate-600 rounded-[2rem] border-2 border-slate-100 shadow-sm transition-all active:scale-95"><Mic className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Voice</span></button>
        </div>
      </div>

      {/* Main Results */}
      <main className="flex-1 p-5 space-y-5">
        {(isProcessingImage || isSearchingAI) && (
          <div className="bg-[#1e293b] p-12 rounded-[3.5rem] text-center text-white space-y-5 animate-pulse shadow-2xl border-4 border-blue-500/20">
            {isProcessingImage ? <Camera className="w-16 h-16 mx-auto animate-bounce text-blue-400" /> : <Sparkles className="w-16 h-16 mx-auto animate-bounce text-purple-400" />}
            <div className="space-y-2">
              <p className="font-black text-xl uppercase tracking-widest italic">{isProcessingImage ? 'Analyzing Image' : 'Gemini Thinking'}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">กำลังวิเคราะห์สเปกอย่างละเอียด...</p>
            </div>
          </div>
        )}

        {!isLoading && filteredResults.length > 0 ? (
          filteredResults.map((item, idx) => (
            <div key={item.id || `${item.model}-${idx}`} className="bg-white border-2 border-slate-100 rounded-[3rem] p-8 shadow-sm hover:shadow-xl transition-all animate-in fade-in zoom-in-95 duration-300 mb-6">
              <div className="mb-8 flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl border shadow-sm flex items-center gap-2 ${item.source === 'ai' ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                      {item.source === 'ai' ? <Sparkles className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                      {item.source === 'ai' ? 'AI GENERATED' : 'CLOUD DATA'}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 text-3xl italic leading-tight break-words pr-4 tracking-tighter uppercase">{item.model}</h3>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl text-slate-200">
                   <ExternalLink className="w-6 h-6" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5">
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 transition-all hover:bg-white hover:shadow-lg group">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-3 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 group-hover:scale-125 transition-transform"></div> DAC CHIP
                  </p>
                  <p className="text-lg font-black text-slate-800 break-words leading-tight">{item.dac || '-'}</p>
                </div>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 transition-all hover:bg-white hover:shadow-lg group">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-3 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 group-hover:scale-125 transition-transform"></div> OPTICAL UNIT
                  </p>
                  <p className="text-lg font-black text-slate-800 break-words leading-tight">{item.laser || '-'}</p>
                </div>
              </div>
            </div>
          ))
        ) : !isLoading && !isProcessingImage && !isSearchingAI && (
          <div className="py-24 text-center space-y-12">
            <div className="w-44 h-44 bg-slate-100 rounded-[5rem] mx-auto flex items-center justify-center border-[10px] border-white shadow-2xl rotate-6">
               <Search className="w-16 h-16 text-slate-200" />
            </div>
            <div className="space-y-6 px-10">
               <p className="text-2xl font-black uppercase tracking-tighter text-slate-900 italic">No Database Entry</p>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">"{searchTerm || 'Unknown'}" was not found in our current library.</p>
               {searchTerm && aiStatus === 'ready' && (
                 <button onClick={() => handleAISearch(searchTerm)} className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 border-b-4 border-indigo-900">
                   <Sparkles className="w-7 h-7" /> Research with Gemini AI
                 </button>
               )}
            </div>
          </div>
        )}
      </main>

      {/* Camera Fullscreen UI */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-500">
          <div className="p-10 flex justify-between items-center text-white absolute top-0 w-full z-10">
            <div className="flex items-center gap-4 bg-black/50 px-6 py-3 rounded-full backdrop-blur-xl border border-white/20 shadow-2xl">
               <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(239,68,68,1)]"></div>
               <span className="font-black text-[11px] tracking-widest uppercase italic">Gemini Vision 3.0</span>
            </div>
            <button onClick={closeCamera} className="bg-white/10 p-5 rounded-full backdrop-blur-xl active:scale-90 border border-white/20"><X className="w-8 h-8" /></button>
          </div>
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-8">
            <div className="w-full aspect-[16/10] border-[5px] border-blue-400/80 rounded-[4rem] animate-pulse shadow-[0_0_200px_rgba(59,130,246,0.5)] relative">
               <div className="absolute -top-1 -left-1 w-16 h-16 border-t-[6px] border-l-[6px] border-blue-500 rounded-tl-[3.5rem]"></div>
               <div className="absolute -top-1 -right-1 w-16 h-16 border-t-[6px] border-r-[6px] border-blue-500 rounded-tr-[3.5rem]"></div>
               <div className="absolute -bottom-1 -left-1 w-16 h-16 border-b-[6px] border-l-[6px] border-blue-500 rounded-bl-[3.5rem]"></div>
               <div className="absolute -bottom-1 -right-1 w-16 h-16 border-b-[6px] border-r-[6px] border-blue-500 rounded-br-[3.5rem]"></div>
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/40 uppercase text-[12px] font-black tracking-[0.6em] whitespace-nowrap">Focus on Model Name</div>
            </div>
          </div>
          
          <div className="absolute bottom-20 w-full flex justify-center">
            <button onClick={captureImage} className="w-36 h-36 rounded-full border-[12px] border-white/20 bg-white/10 active:scale-90 transition-all flex items-center justify-center backdrop-blur-md shadow-2xl">
               <div className="w-24 h-24 bg-white rounded-full shadow-[inset_0_4px_10px_rgba(0,0,0,0.2)] flex items-center justify-center border-4 border-slate-100">
                  <Camera className="w-12 h-12 text-slate-900" />
               </div>
            </button>
          </div>
        </div>
      )}

      {/* Hidden inputs */}
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
