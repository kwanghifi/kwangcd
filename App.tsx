
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
      showToast("เชื่อมต่อ Supabase ไม่ได้", "error");
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
      showToast("ดึงข้อมูลผิดพลาด", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const normalizeForSearch = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const combinedData = useMemo(() => {
    const all = [...cloudData, ...sessionAiData];
    return all.sort((a, b) => a.model.localeCompare(b.model));
  }, [cloudData, sessionAiData]);

  const filteredResults = useMemo(() => {
    if (!searchTerm.trim()) return combinedData;
    const normalizedSearch = normalizeForSearch(searchTerm);
    
    return combinedData.filter(item => {
      const normalizedModel = normalizeForSearch(item.model);
      return normalizedModel.includes(normalizedSearch) || 
             normalizedSearch.includes(normalizedModel);
    });
  }, [searchTerm, combinedData]);

  const handleAISearch = async (modelToSearch?: string) => {
    const target = modelToSearch || searchTerm;
    if (!target || aiStatus !== 'ready') return;
    
    setIsSearchingAI(true);
    try {
      const specs = await fetchSpecsWithAI(target);
      if (specs) {
        const newResult: CDPDbModel = {
          model: target.toUpperCase(),
          dac: specs.dac,
          laser: specs.laser,
          isAiGenerated: true,
          source: 'ai'
        };
        setSessionAiData(prev => [newResult, ...prev]);
        setSearchTerm(target); // บังคับให้แสดงผลตัวนี้
        showToast("พบข้อมูลสเปกด้วย AI แล้ว", "success");
      } else {
        showToast("AI ไม่พบข้อมูลรุ่นนี้", "error");
      }
    } catch (err) {
      showToast("ระบบ AI ขัดข้อง", "error");
    } finally {
      setIsSearchingAI(false);
    }
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("อุปกรณ์ไม่รองรับเสียง", "error");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      setSearchTerm(event.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  const processImage = async (data: string) => {
    setIsProcessingImage(true);
    try {
      const detected = await identifyModelFromImage(data);
      if (detected) {
        setSearchTerm(detected);
        showToast(`AI พบรุ่น: ${detected}`, 'success');
        
        // ตรวจสอบว่ามีใน DB ไหม ถ้าไม่มีให้ Auto-AI Search ทันที
        const normDetected = normalizeForSearch(detected);
        const existsInDb = cloudData.some(m => normalizeForSearch(m.model).includes(normDetected));
        
        if (!existsInDb && aiStatus === 'ready') {
          await handleAISearch(detected);
        }
      } else {
        showToast("ไม่พบรุ่นในรูปภาพ", "error");
      }
    } catch (err) { 
      showToast("AI Vision ผิดพลาด", "error"); 
    } finally { 
      setIsProcessingImage(false); 
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // ตั้งค่าความละเอียดภาพให้สูงพอที่ AI จะเห็นตัวหนังสือ
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    closeCamera();
    await processImage(imageData);
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
      showToast("เปิดกล้องไม่ได้", "error"); 
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
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 w-[90%] border-l-8 ${toast.type === 'success' ? 'bg-white text-emerald-800 border-emerald-500' : 'bg-white text-rose-800 border-rose-500'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" /> : <AlertCircle className="w-6 h-6 text-rose-500 shrink-0" />}
          <span className="text-sm font-black italic">{toast.msg}</span>
        </div>
      )}

      <header className="bg-slate-900 text-white p-6 sticky top-0 z-40 shadow-xl border-b border-white/10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black flex items-center gap-2 italic uppercase text-blue-400 tracking-tighter">
            <Database className="w-7 h-7" /> CD FINDER
          </h1>
          <button onClick={fetchAllCloudData} className="p-3 bg-white/5 rounded-2xl border border-white/10 active:scale-90 transition-all">
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
          <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 border ${aiStatus === 'ready' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            <Zap className={`w-3.5 h-3.5 ${aiStatus === 'ready' ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-tighter">{aiStatus === 'ready' ? 'GEMINI ON' : 'AI OFF'}</span>
          </div>
        </div>
      </header>

      <div className="p-4 bg-white/95 backdrop-blur-xl sticky top-[138px] z-30 shadow-md border-b space-y-4">
        <div className="relative">
          <input 
            type="text"
            placeholder="Search brand, model, dac..."
            className="w-full pl-14 pr-12 py-5 bg-slate-100 rounded-[2rem] border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-lg"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
          {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 bg-slate-200 rounded-full p-1"><X className="w-4 h-4" /></button>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button onClick={openCamera} className="flex flex-col items-center justify-center gap-2 py-5 bg-blue-600 text-white rounded-[1.8rem] active:scale-95 shadow-lg">
            <Camera className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Scan</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-5 bg-white text-slate-600 rounded-[1.8rem] border-2 border-slate-100"><ImageIcon className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Gallery</span></button>
          <button onClick={startVoiceSearch} className={`flex flex-col items-center justify-center gap-2 py-5 rounded-[1.8rem] border-2 ${isListening ? 'bg-rose-500 text-white border-rose-600 animate-pulse' : 'bg-white text-slate-600 border-slate-100'}`}><Mic className="w-7 h-7" /><span className="text-[10px] font-black uppercase tracking-tighter">Voice</span></button>
        </div>
      </div>

      <main className="flex-1 p-5 space-y-5">
        {(isProcessingImage || isSearchingAI) && (
          <div className="bg-slate-900 p-12 rounded-[3rem] text-center text-white space-y-5 animate-pulse shadow-2xl border-4 border-blue-500/30">
            {isProcessingImage ? <Camera className="w-16 h-16 mx-auto animate-bounce text-blue-400" /> : <Sparkles className="w-16 h-16 mx-auto animate-bounce text-purple-400" />}
            <div className="space-y-2">
              <p className="font-black text-xl uppercase tracking-widest italic">{isProcessingImage ? 'AI Vision Processing' : 'Gemini Spec Fetching'}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Please wait, AI is analyzing data...</p>
            </div>
          </div>
        )}

        {!isLoading && filteredResults.length > 0 ? (
          filteredResults.map((item, idx) => (
            <div key={item.id || `${item.model}-${idx}`} className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:shadow-lg transition-all animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-6 flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border flex items-center gap-2 ${item.source === 'ai' ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                      {item.source === 'ai' ? <Sparkles className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                      {item.source === 'ai' ? 'AI SEARCHED' : 'DATABASE'}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 text-2xl italic leading-tight break-words pr-4 tracking-tighter uppercase">{item.model}</h3>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl text-slate-300 transition-colors hover:text-blue-500">
                   <ExternalLink className="w-5 h-5" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 transition-all hover:bg-white hover:shadow-md">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> DAC CHIP</p>
                  <p className="text-base font-black text-slate-800 break-words">{item.dac || '-'}</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 transition-all hover:bg-white hover:shadow-md">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> OPTICAL UNIT</p>
                  <p className="text-base font-black text-slate-800 break-words">{item.laser || '-'}</p>
                </div>
              </div>
            </div>
          ))
        ) : !isLoading && !isProcessingImage && !isSearchingAI && (
          <div className="py-24 text-center space-y-10">
            <div className="w-32 h-32 bg-slate-100 rounded-[3rem] mx-auto flex items-center justify-center border-4 border-white shadow-xl rotate-3">
               <Search className="w-12 h-12 text-slate-300" />
            </div>
            <div className="space-y-6 px-10">
               <p className="text-lg font-black uppercase tracking-tighter text-slate-900 italic">No Database Record</p>
               <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">"{searchTerm || 'Model'}" was not found in our records.</p>
               {searchTerm && aiStatus === 'ready' && (
                 <button onClick={() => handleAISearch()} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3">
                   <Sparkles className="w-6 h-6" /> Force AI Search
                 </button>
               )}
            </div>
          </div>
        )}
      </main>

      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="p-8 flex justify-between items-center text-white absolute top-0 w-full z-10">
            <span className="font-black text-[11px] tracking-widest uppercase bg-blue-600 px-6 py-2 rounded-full shadow-lg">Vision Active</span>
            <button onClick={closeCamera} className="bg-white/10 p-4 rounded-full backdrop-blur-xl active:scale-90"><X className="w-7 h-7" /></button>
          </div>
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-10">
            <div className="w-full aspect-[1.6/1] border-4 border-blue-400 rounded-[3rem] animate-pulse shadow-[0_0_100px_rgba(59,130,246,0.5)]"></div>
          </div>
          <div className="absolute bottom-16 w-full flex justify-center">
            <button onClick={captureImage} className="w-28 h-28 rounded-full border-8 border-white bg-white/20 active:scale-90 transition-all flex items-center justify-center">
               <div className="w-20 h-20 bg-white rounded-full shadow-inner flex items-center justify-center"><Camera className="w-10 h-10 text-slate-800" /></div>
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
