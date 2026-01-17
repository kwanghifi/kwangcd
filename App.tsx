
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, Camera, Mic, X, RefreshCcw, Loader2, 
  Image as ImageIcon, Edit2, Trash2, Plus, LogIn, 
  LogOut, Shield, Save, AlertCircle, Database, CheckCircle2, UploadCloud, CloudOff, Info, Code2, Copy, ExternalLink, Zap, ZapOff, Sparkles, Globe
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

  // ฟังก์ชันดึงข้อมูลแบบวนลูปจนกว่าจะหมด (Recursive Fetch) เพื่อให้มั่นใจว่าได้ครบถ้วน
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
      let to = 999;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('cdp_models')
          .select('*')
          .order('model', { ascending: true })
          .range(from, to);

        if (error) throw error;
        
        if (data && data.length > 0) {
          const mapped = data.map(r => ({ ...r, source: 'cloud' as const }));
          allResults = [...allResults, ...mapped];
          
          // ถ้าได้ข้อมูลมาน้อยกว่า 1000 แสดงว่าหมดแล้ว
          if (data.length < 1000) {
            hasMore = false;
          } else {
            from += 1000;
            to += 1000;
          }
        } else {
          hasMore = false;
        }
      }

      setCloudData(allResults);
    } catch (err) {
      console.error("Fetch Error:", err);
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
    // รวมข้อมูล Cloud และ AI เข้าด้วยกัน
    const all = [...cloudData, ...sessionAiData];
    // จัดเรียงตามชื่อรุ่น
    return all.sort((a, b) => a.model.localeCompare(b.model));
  }, [cloudData, sessionAiData]);

  const filteredResults = useMemo(() => {
    if (!searchTerm.trim()) return combinedData;
    const normalizedSearch = normalizeForSearch(searchTerm);
    return combinedData.filter(item => 
      normalizeForSearch(item.model).includes(normalizedSearch) ||
      normalizeForSearch(item.dac || '').includes(normalizedSearch) ||
      normalizeForSearch(item.laser || '').includes(normalizedSearch)
    );
  }, [searchTerm, combinedData]);

  const handleAISearch = async () => {
    if (!searchTerm || aiStatus !== 'ready') return;
    setIsSearchingAI(true);
    try {
      const specs = await fetchSpecsWithAI(searchTerm);
      if (specs) {
        const newResult: CDPDbModel = {
          model: searchTerm.toUpperCase(),
          dac: specs.dac,
          laser: specs.laser,
          isAiGenerated: true,
          source: 'ai'
        };
        setSessionAiData(prev => [newResult, ...prev]);
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
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const processImage = async (data: string) => {
    setIsProcessingImage(true);
    try {
      const detected = await identifyModelFromImage(data);
      if (detected) {
        setSearchTerm(detected);
        showToast(`AI พบรุ่น: ${detected}`, 'success');
      } else {
        showToast("ไม่สามารถอ่านชื่อรุ่นได้", "error");
      }
    } catch (err) { showToast("AI ผิดพลาด", "error"); } finally { setIsProcessingImage(false); }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    closeCamera();
    await processImage(canvas.toDataURL('image/jpeg'));
  };

  const openCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
          <span className="text-sm font-black">{toast.msg}</span>
        </div>
      )}

      <header className="bg-slate-900 text-white p-6 sticky top-0 z-40 shadow-xl border-b border-white/10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-black flex items-center gap-2 italic uppercase text-blue-400 tracking-tighter">
            <Database className="w-7 h-7" /> CD FINDER
          </h1>
          <button 
            onClick={fetchAllCloudData} 
            disabled={isLoading}
            className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 active:scale-90 transition-all border border-white/10"
          >
            <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <div className="bg-blue-500/10 px-4 py-2 rounded-2xl border border-blue-500/20">
              <p className="text-[10px] text-blue-300 uppercase tracking-widest font-black flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" /> 
                {isLoading ? 'SYNCING...' : `${cloudData.length} MODELS READY`}
              </p>
            </div>
          </div>
          <div className={`px-3 py-2 rounded-2xl flex items-center gap-2 border ${aiStatus === 'ready' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            <Zap className={`w-3.5 h-3.5 ${aiStatus === 'ready' ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] font-black uppercase">{aiStatus === 'ready' ? 'GEMINI ON' : 'AI OFF'}</span>
          </div>
        </div>
      </header>

      <div className="p-4 bg-white/90 backdrop-blur-xl sticky top-[138px] z-30 shadow-md border-b space-y-4">
        <div className="relative">
          <input 
            type="text"
            placeholder="ค้นหาชื่อรุ่น / ชิป / หัวอ่าน..."
            className="w-full pl-14 pr-12 py-5 bg-slate-100 rounded-[2rem] border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-lg"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 bg-slate-200 rounded-full p-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button onClick={openCamera} className="flex flex-col items-center justify-center gap-2 py-5 bg-blue-600 text-white rounded-[1.8rem] active:scale-95 shadow-xl shadow-blue-200 transition-all">
            <Camera className="w-7 h-7" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Scan</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-5 bg-white text-slate-600 rounded-[1.8rem] active:scale-95 border-2 border-slate-100 shadow-sm transition-all">
            <ImageIcon className="w-7 h-7" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Gallery</span>
          </button>
          <button onClick={startVoiceSearch} className={`flex flex-col items-center justify-center gap-2 py-5 rounded-[1.8rem] active:scale-95 border-2 transition-all ${isListening ? 'bg-rose-500 text-white border-rose-600 animate-pulse' : 'bg-white text-slate-600 border-slate-100'}`}>
            <Mic className={`w-7 h-7 ${isListening ? 'animate-bounce' : ''}`} />
            <span className="text-[10px] font-black uppercase tracking-tighter">{isListening ? 'Listening' : 'Voice'}</span>
          </button>
        </div>
      </div>

      <main className="flex-1 p-5 space-y-5">
        {isLoading && cloudData.length === 0 && (
          <div className="py-24 text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full animate-ping"></div>
              <Loader2 className="w-20 h-20 animate-spin text-blue-500" />
              <Database className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-900 italic">Syncing Cloud Database</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">กรุณารอสักครู่ กำลังดึงข้อมูลทั้งหมด...</p>
            </div>
          </div>
        )}

        {(isSearchingAI || isProcessingImage) && (
          <div className="bg-indigo-600 p-12 rounded-[3rem] text-center text-white space-y-5 animate-pulse shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20"><Sparkles className="w-20 h-20" /></div>
            <Sparkles className="w-16 h-16 mx-auto animate-bounce text-indigo-200" />
            <div className="space-y-2">
              <p className="font-black text-xl uppercase tracking-widest italic">Gemini AI Active</p>
              <p className="text-xs text-indigo-200 font-bold uppercase tracking-wider">กำลังวิเคราะห์สเปกให้คุณ...</p>
            </div>
          </div>
        )}

        {!isLoading && filteredResults.length > 0 ? (
          filteredResults.map((item, idx) => (
            <div key={item.id || `${item.model}-${idx}`} className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:shadow-lg transition-all active:scale-[0.98]">
              <div className="mb-6 flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {item.source === 'ai' && (
                      <span className="text-[9px] font-black text-purple-600 uppercase tracking-[0.1em] bg-purple-100 px-3 py-1.5 rounded-xl flex items-center gap-2 border border-purple-200 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5" /> AI DATA
                      </span>
                    )}
                    {item.source === 'cloud' && (
                      <span className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.1em] bg-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-2 border border-emerald-200 shadow-sm">
                        <Globe className="w-3.5 h-3.5" /> DATABASE
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-slate-900 text-2xl italic leading-[1.2] break-words pr-4 tracking-tighter">
                    {item.model}
                  </h3>
                </div>
                <div className="p-4 bg-slate-50 rounded-[1.5rem] shadow-inner">
                   <ExternalLink className="w-5 h-5 text-slate-300" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 group transition-all hover:bg-white hover:shadow-md">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div> DAC CHIP
                    </p>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity"><Info className="w-3 h-3 text-blue-300" /></div>
                  </div>
                  <p className="text-base font-black text-slate-800 leading-snug break-words">{item.dac || '-'}</p>
                </div>
                
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 group transition-all hover:bg-white hover:shadow-md">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500"></div> OPTICAL UNIT
                    </p>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity"><Info className="w-3 h-3 text-indigo-300" /></div>
                  </div>
                  <p className="text-base font-black text-slate-800 leading-snug break-words">{item.laser || '-'}</p>
                </div>
              </div>
            </div>
          ))
        ) : !isLoading && !isSearchingAI && (
          <div className="py-24 text-center space-y-10">
            <div className="relative w-40 h-40 mx-auto">
              <div className="absolute inset-0 bg-white rounded-[3rem] shadow-xl rotate-12 border border-slate-100"></div>
              <div className="absolute inset-0 bg-white rounded-[3rem] shadow-xl -rotate-6 flex items-center justify-center border-4 border-slate-50">
                 <Search className="w-16 h-16 text-slate-200" />
              </div>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-lg font-black uppercase tracking-tighter text-slate-900 italic">No Exact Match Found</p>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest max-w-[80%] mx-auto leading-relaxed">
                  ไม่พบสเปกของ "{searchTerm}" ในฐานข้อมูลระบบคลาวด์ของคุณ
                </p>
              </div>
              
              {searchTerm && aiStatus === 'ready' && (
                <button 
                  onClick={handleAISearch}
                  className="mx-auto flex items-center gap-4 px-10 py-5 bg-indigo-600 text-white rounded-[2.5rem] font-black text-sm uppercase tracking-widest shadow-2xl shadow-indigo-200 active:scale-95 hover:bg-indigo-700 transition-all border-b-4 border-indigo-900"
                >
                  <Sparkles className="w-6 h-6" /> Search with AI
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="p-8 flex justify-between items-center text-white absolute top-0 w-full z-10">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
              <span className="font-black text-[11px] tracking-widest uppercase bg-black/40 px-4 py-2 rounded-full backdrop-blur-md border border-white/20 shadow-lg">AI VISION SCANNER</span>
            </div>
            <button onClick={closeCamera} className="bg-white/10 p-4 rounded-full backdrop-blur-xl border border-white/30 active:scale-90 transition-all shadow-2xl">
              <X className="w-7 h-7" />
            </button>
          </div>
          
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-10">
            <div className="w-full aspect-[16/10] border-2 border-blue-400 rounded-[3rem] animate-pulse shadow-[0_0_200px_rgba(59,130,246,0.5)] relative">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-500 text-[10px] font-black px-6 py-2 rounded-full text-white uppercase tracking-wider shadow-lg">Place Model Name Inside</div>
               <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-xl"></div>
               <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-xl"></div>
               <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-xl"></div>
               <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-xl"></div>
            </div>
          </div>
          
          <div className="absolute bottom-16 w-full flex justify-center items-center">
            <button onClick={captureImage} className="w-28 h-28 rounded-full border-[8px] border-white bg-white/30 active:scale-90 transition-all shadow-2xl flex items-center justify-center group relative">
               <div className="w-20 h-20 bg-white rounded-full group-active:scale-95 transition-transform shadow-inner"></div>
               <Camera className="w-8 h-8 text-slate-800 absolute opacity-50" />
            </button>
          </div>
        </div>
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const r = new FileReader();
            r.onload = (ev) => processImage(ev.target?.result as string);
            r.readAsDataURL(file);
          }
        }} 
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
