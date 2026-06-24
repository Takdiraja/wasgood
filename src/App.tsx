import React, { useState, useEffect, useRef } from 'react';
import { useOpenCV } from './hooks/useOpenCV';
import { 
  DEFAULT_SETTINGS, 
  processVideoFrame, 
  type OverlayInfo 
} from './utils/cvEngine';
import type { 
  AppSettings, 
  ROI, 
  AppState, 
  ColorType, 
  DetectionResults 
} from './types';
import { 
  Play, 
  Square, 
  Camera, 
  Tv, 
  Zap, 
  Sliders, 
  Activity, 
  RefreshCw,
  Upload,
  Video,
  Monitor,
  Image as ImageIcon,
  Smartphone,
  X,
  Plus,
  Minus
} from 'lucide-react';
import './App.css';

export default function App() {
  const { status: cvStatus, progressText: cvProgressText } = useOpenCV();
  
  // App Settings State (for settings panel controls)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  // ROI States (for visual indicators & numeric sliders)
  const [boardRoi, setBoardRoi] = useState<ROI>({ x: 54, y: 21, width: 32, height: 54 });
  const [questionRoi, setQuestionRoi] = useState<ROI>({ x: 71, y: 13, width: 19, height: 6 });
  
  // Mobile Layout Overlay State
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [guideSize, setGuideSize] = useState(50); // percentage size of grid guide frame
  
  // Interactive Calibration State
  const [activeTab, setActiveTab] = useState<'roi' | 'hsv' | 'general'>('roi');
  const [calibrateMode, setCalibrateMode] = useState<'none' | 'board' | 'question'>('none');
  const [activeColorTab, setActiveColorTab] = useState<ColorType>('green');
  
  // Input Selection Tab
  const [inputTab, setInputTab] = useState<'screen' | 'camera' | 'file'>('screen');
  
  // Screen/Camera Capture States
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Camera Enumerate States
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Static File Upload States
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // References for Animation & Stream Capture
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);
  const uploadedImageRef = useRef<HTMLImageElement | null>(null);

  // Mutable Refs for Real-time processing loop to read from (prevents closure stale data)
  const settingsRef = useRef<AppSettings>(settings);
  const boardRoiRef = useRef<ROI>(boardRoi);
  const questionRoiRef = useRef<ROI>(questionRoi);
  const isFrozenRef = useRef<boolean>(isFrozen);
  const inputTabRef = useRef<'screen' | 'camera' | 'file'>(inputTab);
  const guideSizeRef = useRef<number>(guideSize);
  const isMobileLayoutRef = useRef<boolean>(isMobileLayout);
  
  // Mutable Refs for State Machine logic
  const internalStateRef = useRef<AppState>('IDLE');
  const lastCountsRef = useRef<DetectionResults>({ green: 0, yellow: 0, blue: 0, total: 0 });
  const lockedCountsRef = useRef<DetectionResults>({ green: 0, yellow: 0, blue: 0, total: 0 });
  const isGridActiveRef = useRef<boolean>(false);

  // Direct DOM Refs to update counters & metrics at 30+ FPS without re-rendering React tree (Low CPU)
  const greenTextRef = useRef<HTMLSpanElement | null>(null);
  const yellowTextRef = useRef<HTMLSpanElement | null>(null);
  const blueTextRef = useRef<HTMLSpanElement | null>(null);
  const totalTextRef = useRef<HTMLSpanElement | null>(null);
  
  const questionTextRef = useRef<HTMLSpanElement | null>(null);
  const questionContainerRef = useRef<HTMLDivElement | null>(null);
  const answerTextRef = useRef<HTMLSpanElement | null>(null);
  const answerContainerRef = useRef<HTMLDivElement | null>(null);

  // Mobile layout duplicate DOM refs
  const mobGreenTextRef = useRef<HTMLSpanElement | null>(null);
  const mobYellowTextRef = useRef<HTMLSpanElement | null>(null);
  const mobBlueTextRef = useRef<HTMLSpanElement | null>(null);
  
  const mobQuestionTextRef = useRef<HTMLSpanElement | null>(null);
  const mobQuestionContainerRef = useRef<HTMLDivElement | null>(null);
  const mobAnswerTextRef = useRef<HTMLSpanElement | null>(null);
  const mobAnswerContainerRef = useRef<HTMLDivElement | null>(null);
  
  const fpsTextRef = useRef<HTMLSpanElement | null>(null);
  const latencyTextRef = useRef<HTMLSpanElement | null>(null);
  const statePillTextRef = useRef<HTMLSpanElement | null>(null);
  const statePillContainerRef = useRef<HTMLSpanElement | null>(null);

  // Sync settings and ROIs to mutable refs immediately when they change in UI
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { boardRoiRef.current = boardRoi; }, [boardRoi]);
  useEffect(() => { questionRoiRef.current = questionRoi; }, [questionRoi]);
  useEffect(() => { isFrozenRef.current = isFrozen; }, [isFrozen]);
  useEffect(() => { inputTabRef.current = inputTab; }, [inputTab]);
  useEffect(() => { guideSizeRef.current = guideSize; }, [guideSize]);
  useEffect(() => { isMobileLayoutRef.current = isMobileLayout; }, [isMobileLayout]);

  // Save/restore ROI states when switching between file upload and other inputs
  const prevInputTabRef = useRef<'screen' | 'camera' | 'file'>(inputTab);
  const nonFileBoardRoiRef = useRef<ROI>({ x: 54, y: 21, width: 32, height: 54 });
  const nonFileQuestionRoiRef = useRef<ROI>({ x: 71, y: 13, width: 19, height: 6 });

  useEffect(() => {
    const prevTab = prevInputTabRef.current;
    if (prevTab !== inputTab) {
      if (prevTab !== 'file') {
        // Save current ROIs before leaving screen/camera
        nonFileBoardRoiRef.current = boardRoi;
        nonFileQuestionRoiRef.current = questionRoi;
      }
      
      if (inputTab === 'file') {
        // Set board ROI to 1,1 (margin 1% all around) and question ROI to empty/hidden
        setBoardRoi({ x: 1, y: 1, width: 98, height: 98 });
        setQuestionRoi({ x: 0, y: 0, width: 0, height: 0 });
      } else {
        // Restore screen/camera ROIs
        setBoardRoi(nonFileBoardRoiRef.current);
        setQuestionRoi(nonFileQuestionRoiRef.current);
      }
      prevInputTabRef.current = inputTab;
    }
  }, [inputTab]);

  // Handle Guide Frame proportional scaling (centered guide system for mobile)
  useEffect(() => {
    if (isMobileLayout) {
      const canvas = canvasRef.current;
      const canvasWidth = canvas && canvas.width > 0 ? canvas.width : 1280;
      const canvasHeight = canvas && canvas.height > 0 ? canvas.height : 720;
      const S = Math.min(canvasWidth, canvasHeight);
      
      const pixelSize = (guideSize / 100) * S;
      
      const bW = (pixelSize / canvasWidth) * 100;
      const bH = (pixelSize / canvasHeight) * 100;
      const bX = Math.round(50 - bW / 2);
      const bY = Math.round(40 - bH / 2);

      const qW = bW;
      const qH = 8;
      const qX = bX;
      const qY = Math.round(bY + bH + 3);

      setBoardRoi({ x: bX, y: bY, width: bW, height: bH });
      setQuestionRoi({ x: qX, y: qY, width: qW, height: qH });
    }
  }, [guideSize, isMobileLayout]);

  // Audio effect context for target announcements (subtle synthetic chimes)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPlayedColorRef = useRef<string | null>(null);

  const playChime = (color: ColorType) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      let freq = 440; // Green
      if (color === 'yellow') freq = 554.37; // C#5
      if (color === 'blue') freq = 659.25; // E5

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio feedback failed', e);
    }
  };

  // Enumerate cameras when input type is camera
  useEffect(() => {
    if (inputTab === 'camera') {
      enumerateCameras();
    } else {
      stopStreamsAndClear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputTab]);

  const enumerateCameras = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
      setDevices(videoDevices);
      
      // Auto-prefer rear camera on mobile (only if not set yet)
      if (videoDevices.length > 0 && !selectedDeviceId) {
        const backCamera = videoDevices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('environment')
        );
        setSelectedDeviceId(backCamera ? backCamera.deviceId : videoDevices[0].deviceId);
      }
    } catch (err: any) {
      console.warn('Failed to enumerate devices', err);
    }
  };

  // Keyboard shortcut overrides: 'g' = green, 'y' = yellow, 'b' = blue, 'r' = reset
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'g' || key === 'y' || key === 'b') {
        let color: ColorType = 'green';
        if (key === 'y') color = 'yellow';
        if (key === 'b') color = 'blue';
        
        forceTriggerQuestion(color);
      } else if (key === 'r') {
        resetStateAndCounters();
      } else if (key === 'f') {
        toggleFreeze();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCapturing, isFrozen, isMobileLayout]);

  // Handle global paste event for clipboard screenshots (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            // Automatically switch to file upload tab
            setInputTab('file');
            // Upload the photo
            handlePhotoUpload(file);
            
            // Prevent default browser paste behavior
            e.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const forceTriggerQuestion = (color: ColorType) => {
    if (inputTabRef.current === 'file') return;
    if (internalStateRef.current === 'IDLE' && !isFrozenRef.current && inputTab !== 'file') return;
    
    internalStateRef.current = 'QUESTION_DETECTED';
    updateStatePill('QUESTION FOUND', 'status-locked');
    
    // Draw desktop question label
    if (questionTextRef.current) {
      questionTextRef.current.textContent = color.toUpperCase();
      questionTextRef.current.className = `display-content active ${color}-text`;
    }
    if (questionContainerRef.current) {
      questionContainerRef.current.className = `display-box ${color}-match`;
    }

    // Draw mobile question label
    if (mobQuestionTextRef.current) {
      mobQuestionTextRef.current.textContent = color.toUpperCase();
      mobQuestionTextRef.current.className = `display-content active ${color}-text`;
    }
    if (mobQuestionContainerRef.current) {
      mobQuestionContainerRef.current.className = `display-box ${color}-match`;
    }

    // Retrieve corresponding answer from locked count (or current count if not locked yet)
    const count = lockedCountsRef.current[color] || lastCountsRef.current[color];
    
    // Desktop Answer
    if (answerTextRef.current) {
      answerTextRef.current.textContent = count.toString();
      answerTextRef.current.className = `giant-answer ${color}-text`;
    }
    if (answerContainerRef.current) {
      answerContainerRef.current.className = `display-box active ${color}-match`;
    }

    // Mobile Answer
    if (mobAnswerTextRef.current) {
      mobAnswerTextRef.current.textContent = count.toString();
      mobAnswerTextRef.current.className = `giant-answer ${color}-text`;
    }
    if (mobAnswerContainerRef.current) {
      mobAnswerContainerRef.current.className = `display-box active ${color}-match`;
    }

    if (lastPlayedColorRef.current !== color) {
      playChime(color);
      lastPlayedColorRef.current = color;
    }
  };

  const resetStateAndCounters = () => {
    lockedCountsRef.current = { green: 0, yellow: 0, blue: 0, total: 0 };
    lastCountsRef.current = { green: 0, yellow: 0, blue: 0, total: 0 };
    isGridActiveRef.current = false;
    lastPlayedColorRef.current = null;
    
    if (isCapturing) {
      internalStateRef.current = 'SEARCHING_BOARD';
      updateStatePill('SEARCHING GRID', 'status-active');
    } else if (inputTab === 'file' && uploadedImageSrc) {
      internalStateRef.current = 'SEARCHING_BOARD';
      updateStatePill('STATIC FILE ANALYZER', 'status-active');
    } else {
      internalStateRef.current = 'IDLE';
      updateStatePill('IDLE', 'status-idle');
    }

    // Direct DOM resets
    if (greenTextRef.current) greenTextRef.current.textContent = '0';
    if (yellowTextRef.current) yellowTextRef.current.textContent = '0';
    if (blueTextRef.current) blueTextRef.current.textContent = '0';
    if (totalTextRef.current) totalTextRef.current.textContent = '0';

    if (mobGreenTextRef.current) mobGreenTextRef.current.textContent = '0';
    if (mobYellowTextRef.current) mobYellowTextRef.current.textContent = '0';
    if (mobBlueTextRef.current) mobBlueTextRef.current.textContent = '0';
    
    // Desktop HUD Resets
    if (questionTextRef.current) {
      questionTextRef.current.textContent = 'WAITING';
      questionTextRef.current.className = 'display-content';
    }
    if (questionContainerRef.current) {
      questionContainerRef.current.className = 'display-box';
    }
    if (answerTextRef.current) {
      answerTextRef.current.textContent = '0';
      answerTextRef.current.className = 'giant-answer';
    }
    if (answerContainerRef.current) {
      answerContainerRef.current.className = 'display-box';
    }

    // Mobile HUD Resets
    if (mobQuestionTextRef.current) {
      mobQuestionTextRef.current.textContent = 'WAITING';
      mobQuestionTextRef.current.className = 'display-content';
    }
    if (mobQuestionContainerRef.current) {
      mobQuestionContainerRef.current.className = 'display-box';
    }
    if (mobAnswerTextRef.current) {
      mobAnswerTextRef.current.textContent = '0';
      mobAnswerTextRef.current.className = 'giant-answer';
    }
    if (mobAnswerContainerRef.current) {
      mobAnswerContainerRef.current.className = 'display-box';
    }
  };

  const updateStatePill = (text: string, className: string) => {
    if (statePillTextRef.current) statePillTextRef.current.textContent = text;
    if (statePillContainerRef.current) {
      statePillContainerRef.current.className = `status-pill ${className}`;
    }
  };

  // Core Real-time Processing Loop (Used for Screen Share and Webcam Camera)
  const runFrameProcess = () => {
    if (inputTabRef.current === 'file') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended || isFrozenRef.current) {
      requestRef.current = requestAnimationFrame(runFrameProcess);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      requestRef.current = requestAnimationFrame(runFrameProcess);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      if (isMobileLayoutRef.current) {
        // Recalculate guide box to maintain perfect square coordinates relative to new canvas aspect ratio
        const S = Math.min(canvas.width, canvas.height);
        const pixelSize = (guideSizeRef.current / 100) * S;
        const bW = (pixelSize / canvas.width) * 100;
        const bH = (pixelSize / canvas.height) * 100;
        const bX = Math.round(50 - bW / 2);
        const bY = Math.round(40 - bH / 2);

        const newBoardRoi = { x: bX, y: bY, width: bW, height: bH };
        const newQuestionRoi = { x: bX, y: bY + bH + 3, width: bW, height: 8 };

        boardRoiRef.current = newBoardRoi;
        questionRoiRef.current = newQuestionRoi;

        setTimeout(() => {
          setBoardRoi(newBoardRoi);
          setQuestionRoi(newQuestionRoi);
        }, 0);
      }
    }

    // 1. Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const startTime = performance.now();

    // 2. OpenCV Process Frame
    const result = processVideoFrame(
      canvas,
      settingsRef.current,
      boardRoiRef.current,
      questionRoiRef.current
    );

    const processingTime = performance.now() - startTime;

    // 3. Compute FPS & Latency stats
    updatePerformanceStats(processingTime);

    if (result) {
      applyEngineResults(result);
    }

    requestRef.current = requestAnimationFrame(runFrameProcess);
  };

  // Process a static image frame (used for uploaded screenshots/photos)
  const processStaticImage = () => {
    const img = uploadedImageRef.current;
    const canvas = canvasRef.current;
    if (inputTab !== 'file' || !img || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const startTime = performance.now();

    const result = processVideoFrame(
      canvas,
      settings,
      boardRoi,
      questionRoi
    );

    const processingTime = performance.now() - startTime;

    if (latencyTextRef.current) {
      latencyTextRef.current.textContent = `${processingTime.toFixed(1)} ms`;
      latencyTextRef.current.className = `perf-val ${
        processingTime < 15 ? 'perf-good' : 'perf-ok'
      }`;
    }
    if (fpsTextRef.current) {
      fpsTextRef.current.textContent = 'N/A';
      fpsTextRef.current.className = 'perf-val';
    }

    if (result) {
      applyEngineResults(result);
    }
  };

  // Trigger static image recalculation when settings, ROIs, or the image changes
  useEffect(() => {
    if (inputTab === 'file' && uploadedImageSrc) {
      const timer = setTimeout(() => {
        processStaticImage();
      }, 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, boardRoi, questionRoi, uploadedImageSrc, inputTab]);

  // Unified Handler to process extraction results
  const applyEngineResults = (result: ReturnType<typeof processVideoFrame>) => {
    if (!result || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { counts, detectedQuestion, overlays } = result;

    // 1. Update counter DOM displays directly
    if (greenTextRef.current) greenTextRef.current.textContent = counts.green.toString();
    if (yellowTextRef.current) yellowTextRef.current.textContent = counts.yellow.toString();
    if (blueTextRef.current) blueTextRef.current.textContent = counts.blue.toString();
    if (totalTextRef.current) totalTextRef.current.textContent = counts.total.toString();

    // Mobile specific duplicate counters
    if (mobGreenTextRef.current) mobGreenTextRef.current.textContent = counts.green.toString();
    if (mobYellowTextRef.current) mobYellowTextRef.current.textContent = counts.yellow.toString();
    if (mobBlueTextRef.current) mobBlueTextRef.current.textContent = counts.blue.toString();

    // State machine logic (for stream captures)
    const sensitivity = settingsRef.current.gridDetectionSensitivity;
    const wasGridActive = isGridActiveRef.current;
    const isGridActive = counts.total >= sensitivity;
    isGridActiveRef.current = isGridActive;

    if (isGridActive) {
      lastCountsRef.current = counts;
      
      if (internalStateRef.current !== 'COUNTING') {
        internalStateRef.current = 'COUNTING';
        updateStatePill(
          inputTab === 'file' ? 'STATIC GRID' : 'COUNTING', 
          'status-counting'
        );
        
        if (questionTextRef.current) {
          questionTextRef.current.textContent = 'COUNTING...';
          questionTextRef.current.className = 'display-content active';
        }
        if (questionContainerRef.current) questionContainerRef.current.className = 'display-box';
        if (answerTextRef.current) {
          answerTextRef.current.textContent = counts.total.toString();
          answerTextRef.current.className = 'giant-answer';
        }
        if (answerContainerRef.current) answerContainerRef.current.className = 'display-box';

        // Mobile
        if (mobQuestionTextRef.current) {
          mobQuestionTextRef.current.textContent = 'COUNTING...';
          mobQuestionTextRef.current.className = 'display-content active';
        }
        if (mobQuestionContainerRef.current) mobQuestionContainerRef.current.className = 'display-box';
        if (mobAnswerTextRef.current) {
          mobAnswerTextRef.current.textContent = counts.total.toString();
          mobAnswerTextRef.current.className = 'giant-answer';
        }
        if (mobAnswerContainerRef.current) mobAnswerContainerRef.current.className = 'display-box';
      }
    } else if (wasGridActive && !isGridActive) {
      // Locked State
      internalStateRef.current = 'COOLDOWN';
      updateStatePill('LOCKED (PENDING)', 'status-locked');
      lockedCountsRef.current = { ...lastCountsRef.current };

      if (questionTextRef.current) {
        questionTextRef.current.textContent = 'AWAITING QUESTION';
        questionTextRef.current.className = 'display-content active';
      }
      if (mobQuestionTextRef.current) {
        mobQuestionTextRef.current.textContent = 'AWAITING QUESTION';
        mobQuestionTextRef.current.className = 'display-content active';
      }
    }

    // Auto Answer HUD
    if (settingsRef.current.autoAnswerEnabled && detectedQuestion) {
      forceTriggerQuestion(detectedQuestion);
    }

    // 2. Draw debugging overlays directly onto canvas
    if (settingsRef.current.debugOverlayEnabled) {
      const boardX = (boardRoiRef.current.x / 100) * canvas.width;
      const boardY = (boardRoiRef.current.y / 100) * canvas.height;
      const boardW = (boardRoiRef.current.width / 100) * canvas.width;
      const boardH = (boardRoiRef.current.height / 100) * canvas.height;

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(boardX, boardY, boardW, boardH);

      if (inputTabRef.current !== 'file') {
        const questX = (questionRoiRef.current.x / 100) * canvas.width;
        const questY = (questionRoiRef.current.y / 100) * canvas.height;
        const questW = (questionRoiRef.current.width / 100) * canvas.width;
        const questH = (questionRoiRef.current.height / 100) * canvas.height;

        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(questX, questY, questW, questH);
      }

      ctx.setLineDash([]);
      ctx.lineWidth = 2;

      overlays.forEach((ov: OverlayInfo) => {
        let colorHex = '#34d399';
        if (ov.type === 'yellow') colorHex = '#fbbf24';
        if (ov.type === 'blue') colorHex = '#60a5fa';

        ctx.strokeStyle = colorHex;
        ctx.strokeRect(ov.rect.x, ov.rect.y, ov.rect.w, ov.rect.h);

        ctx.fillStyle = colorHex;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(
          ov.type.substring(0, 1).toUpperCase(), 
          ov.rect.x + 3, 
          ov.rect.y + 13
        );
      });
    }
  };

  // FPS calculation variables
  const frameTimesRef = useRef<number[]>([]);
  
  const updatePerformanceStats = (processingTime: number) => {
    if (latencyTextRef.current) {
      latencyTextRef.current.textContent = `${processingTime.toFixed(1)} ms`;
      latencyTextRef.current.className = `perf-val ${
        processingTime < 10 ? 'perf-good' : processingTime < 30 ? 'perf-ok' : 'perf-warn'
      }`;
    }

    const now = performance.now();
    const frameTimes = frameTimesRef.current;
    frameTimes.push(now);

    while (frameTimes.length > 0 && frameTimes[0] < now - 1000) {
      frameTimes.shift();
    }

    const currentFps = frameTimes.length;
    if (fpsTextRef.current) {
      fpsTextRef.current.textContent = currentFps.toString();
      fpsTextRef.current.className = `perf-val ${
        currentFps > 28 ? 'perf-good' : currentFps > 15 ? 'perf-ok' : 'perf-warn'
      }`;
    }
  };

  // Screen Share Setup
  const startScreenCapture = async () => {
    setCaptureError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false,
      });

      streamRef.current = stream;
      setIsCapturing(true);
      setIsFrozen(false);
      resetStateAndCounters();

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          internalStateRef.current = 'SEARCHING_BOARD';
          updateStatePill('SEARCHING GRID', 'status-active');
          requestRef.current = requestAnimationFrame(runFrameProcess);
        };
      }

      stream.getVideoTracks()[0].onended = () => {
        stopStreamsAndClear();
      };
    } catch (err: any) {
      console.error('Error selecting media source', err);
      setCaptureError(
        err.name === 'NotAllowedError' 
          ? 'Screen share selection was cancelled or permission denied.' 
          : `Failed to capture screen: ${err.message}`
      );
    }
  };

  // Camera Streaming Setup (Webcam / HP Camera)
  const startCameraCapture = async () => {
    setCaptureError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setIsCapturing(true);
      setIsFrozen(false);
      resetStateAndCounters();

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        
        const handleStartLoop = () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
          internalStateRef.current = 'SEARCHING_BOARD';
          updateStatePill('SEARCHING GRID', 'status-active');
          requestRef.current = requestAnimationFrame(runFrameProcess);
        };

        // Trigger loop immediately after play promise resolves or fallback to events
        video.play()
          .then(() => {
            handleStartLoop();
          })
          .catch((err) => {
            console.warn("Autoplay was blocked or video play failed, binding fallbacks", err);
            video.onloadedmetadata = handleStartLoop;
            video.onplay = handleStartLoop;
          });

        // Safe fallback delay timer
        setTimeout(() => {
          if (internalStateRef.current === 'IDLE' || internalStateRef.current === 'COOLDOWN') {
            handleStartLoop();
          }
        }, 600);
      }
    } catch (err: any) {
      console.error('Error starting camera stream', err);
      setCaptureError(`Failed to access camera: ${err.message}. Make sure permissions are granted.`);
    }
  };

  const stopStreamsAndClear = () => {
    setIsCapturing(false);
    setIsFrozen(false);
    resetStateAndCounters();

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    internalStateRef.current = 'IDLE';
    updateStatePill('IDLE', 'status-idle');
  };

  const toggleFreeze = () => {
    if (!isCapturing) return;
    
    const newFrozen = !isFrozen;
    setIsFrozen(newFrozen);
    isFrozenRef.current = newFrozen;

    if (newFrozen) {
      updateStatePill('FROZEN FRAME', 'status-locked');
    } else {
      internalStateRef.current = isGridActiveRef.current ? 'COUNTING' : 'SEARCHING_BOARD';
      updateStatePill(
        isGridActiveRef.current ? 'COUNTING' : 'SEARCHING GRID',
        isGridActiveRef.current ? 'status-counting' : 'status-active'
      );
    }
  };

  // Static File Upload Handlers
  const handlePhotoUpload = (file: File) => {
    if (!file) return;
    setCaptureError(null);
    stopStreamsAndClear();

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setUploadedImageSrc(e.target.result as string);
        resetStateAndCounters();
        internalStateRef.current = 'SEARCHING_BOARD';
        updateStatePill('STATIC FILE ANALYZER', 'status-active');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePhotoUpload(e.dataTransfer.files[0]);
    }
  };

  const clearUploadedPhoto = () => {
    setUploadedImageSrc(null);
    if (uploadedImageRef.current) uploadedImageRef.current = null;
    resetStateAndCounters();
  };

  // Presets
  const applyPresetRoi = (preset: 'standard' | 'centered-large' | 'bottom-centered') => {
    if (preset === 'standard') {
      setBoardRoi({ x: 54, y: 21, width: 32, height: 54 });
      setQuestionRoi({ x: 71, y: 13, width: 19, height: 6 });
    } else if (preset === 'centered-large') {
      setBoardRoi({ x: 20, y: 10, width: 60, height: 70 });
      setQuestionRoi({ x: 25, y: 82, width: 50, height: 12 });
    } else if (preset === 'bottom-centered') {
      setBoardRoi({ x: 30, y: 5, width: 40, height: 55 });
      setQuestionRoi({ x: 30, y: 65, width: 40, height: 15 });
    }
  };

  // Interactive Drag-and-Map ROI coordinates
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (calibrateMode === 'none' || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    isDraggingRef.current = true;
    dragStartRef.current = { x: xPercent, y: yPercent };

    const initialRoi: ROI = {
      x: Math.round(xPercent),
      y: Math.round(yPercent),
      width: 1,
      height: 1
    };

    if (calibrateMode === 'board') {
      setBoardRoi(initialRoi);
    } else {
      setQuestionRoi(initialRoi);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || calibrateMode === 'none' || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const curXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const curYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    const x = Math.max(0, Math.min(100, Math.round(Math.min(dragStartRef.current.x, curXPercent))));
    const y = Math.max(0, Math.min(100, Math.round(Math.min(dragStartRef.current.y, curYPercent))));
    const w = Math.max(1, Math.min(100 - x, Math.round(Math.abs(dragStartRef.current.x - curXPercent))));
    const h = Math.max(1, Math.min(100 - y, Math.round(Math.abs(dragStartRef.current.y - curYPercent))));

    const updatedRoi: ROI = { x, y, width: w, height: h };

    if (calibrateMode === 'board') {
      setBoardRoi(updatedRoi);
    } else {
      setQuestionRoi(updatedRoi);
    }
  };

  const handleCanvasMouseUp = () => {
    isDraggingRef.current = false;
  };

  const launchMobileView = () => {
    setIsMobileLayout(true);
    setInputTab('camera');
    // Start camera stream immediately
    setTimeout(() => {
      startCameraCapture();
    }, 300);
  };

  const closeMobileView = () => {
    setIsMobileLayout(false);
    stopStreamsAndClear();
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  // RENDER DUAL VIEWS (MOBILE FULL-SCREEN SCANNER VS STANDARD DESKTOP VIEW)
  if (isMobileLayout) {
    return (
      <div className="mobile-scanner-layout">
        {/* Top Header Row */}
        <div className="mobile-hud-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span ref={statePillContainerRef} className="status-pill status-active">
              <span style={{ width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%' }}></span>
              <span ref={statePillTextRef}>SEARCHING</span>
            </span>
          </div>
          <button onClick={closeMobileView} className="btn btn-secondary" style={{ padding: '0.4rem', border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: '50%' }}>
            <X size={16} />
          </button>
        </div>

        {/* Full-Screen Camera Viewport */}
        <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
        
        {captureError && (
          <div style={{
            position: 'absolute',
            top: '80px',
            left: '1rem',
            right: '1rem',
            zIndex: 10,
            color: '#ef4444', 
            fontSize: '0.85rem', 
            background: 'rgba(239, 68, 68, 0.9)', 
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '0.75rem',
            borderRadius: 'var(--border-radius-sm)',
            textAlign: 'center'
          }}>
            {captureError}
          </div>
        )}
        <canvas ref={canvasRef} className="mobile-scanner-canvas" />

        {/* Center Target Answer Panel */}
        <div ref={mobAnswerContainerRef} className="mobile-hud-answer">
          <span className="display-title" style={{ fontSize: '0.7rem' }}>TARGET ANSWER</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span ref={mobQuestionTextRef} className="display-content" style={{ fontSize: '1.25rem' }}>WAITING</span>
            <span ref={mobAnswerTextRef} className="giant-answer" style={{ fontSize: '3.0rem' }}>0</span>
          </div>
        </div>

        {/* Floating Mini Tile Counters */}
        <div className="mobile-hud-counters">
          <div className="counter-card green" style={{ padding: '0.4rem', background: 'rgba(52,211,153,0.15)', borderColor: 'var(--color-green-border)' }}>
            <span className="counter-label" style={{ fontSize: '0.65rem' }}>🟩 GRN</span>
            <span ref={mobGreenTextRef} className="counter-value" style={{ fontSize: '1.5rem' }}>0</span>
          </div>
          <div className="counter-card yellow" style={{ padding: '0.4rem', background: 'rgba(251,191,36,0.15)', borderColor: 'var(--color-yellow-border)' }}>
            <span className="counter-label" style={{ fontSize: '0.65rem' }}>🟨 YEL</span>
            <span ref={mobYellowTextRef} className="counter-value" style={{ fontSize: '1.5rem' }}>0</span>
          </div>
          <div className="counter-card blue" style={{ padding: '0.4rem', background: 'rgba(96,165,250,0.15)', borderColor: 'var(--color-blue-border)' }}>
            <span className="counter-label" style={{ fontSize: '0.65rem' }}>🟦 BLU</span>
            <span ref={mobBlueTextRef} className="counter-value" style={{ fontSize: '1.5rem' }}>0</span>
          </div>
        </div>

        {/* Floating Bottom Calibration Controls */}
        <div className="mobile-hud-controls">
          <div className="mobile-guide-slider-row">
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              Guide Box Size:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', marginLeft: '0.5rem' }}>
              <Minus size={14} style={{ color: 'var(--color-text-secondary)' }} />
              <input 
                type="range" min="30" max="85" value={guideSize}
                onChange={(e) => setGuideSize(parseInt(e.target.value))}
                style={{ flex: 1 }}
              />
              <Plus size={14} style={{ color: 'var(--color-text-secondary)' }} />
            </div>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', width: '30px', textAlign: 'right' }}>
              {guideSize}%
            </span>
          </div>

          {/* Quick Manual Override hotkey rows */}
          <div className="mobile-row">
            <button onClick={() => forceTriggerQuestion('green')} className="btn btn-secondary" style={{ border: '1px solid var(--color-green-border)', background: 'rgba(52,211,153,0.06)' }}>
              🟩 G
            </button>
            <button onClick={() => forceTriggerQuestion('yellow')} className="btn btn-secondary" style={{ border: '1px solid var(--color-yellow-border)', background: 'rgba(251,191,36,0.06)' }}>
              🟨 Y
            </button>
            <button onClick={() => forceTriggerQuestion('blue')} className="btn btn-secondary" style={{ border: '1px solid var(--color-blue-border)', background: 'rgba(96,165,250,0.06)' }}>
              🟦 B
            </button>
            <button 
              onClick={toggleFreeze} 
              className={`btn btn-secondary ${isFrozen ? 'active' : ''}`}
              style={{ flex: 'none', width: '50px', border: isFrozen ? '1px solid var(--color-accent)' : '1px solid rgba(255, 255, 255, 0.1)', background: isFrozen ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)' }}
              title="Freeze frame"
            >
              <Camera size={14} style={{ color: isFrozen ? '#c084fc' : 'white' }} />
            </button>
            <button onClick={resetStateAndCounters} className="btn btn-danger" style={{ flex: 'none', width: '50px' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STANDARD DESKTOP / MAIN VIEW
  return (
    <div className="app-container">
      {/* 1. Brand Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">
            <Tv size={20} />
          </div>
          <div>
            <h1 className="brand-title">GTA RP Color Count Assistant</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              Lightweight real-time visual grid analyzer
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={launchMobileView}
            className="btn btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.35rem', boxShadow: 'none' }}
          >
            <Smartphone size={14} /> 📱 Open Mobile Scan HUD
          </button>
          
          <span className="brand-badge">Vercel Ready</span>
          <span 
            ref={statePillContainerRef} 
            className="status-pill status-idle"
          >
            <span style={{ 
              width: '8px', 
              height: '8px', 
              background: 'currentColor', 
              borderRadius: '50%' 
            }}></span>
            <span ref={statePillTextRef}>IDLE</span>
          </span>
        </div>
      </header>

      {/* 2. Loading State if OpenCV is not ready */}
      {cvStatus !== 'ready' ? (
        <div className="glass-panel opencv-loading-container">
          <div className="spinner-glow"></div>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h2 className="loading-text">Loading OpenCV Engine</h2>
            <p className="loading-subtext">{cvProgressText}</p>
          </div>
        </div>
      ) : (
        /* 3. Live Dashboard Content */
        <div className="dashboard-grid">
          
          {/* Left Column: Visual Capture & Live Output */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Viewport Card */}
            <div className="glass-panel" style={{ gap: '1.0rem' }}>
              <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem', border: 'none', padding: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <h3 className="panel-title">
                    <Tv size={18} style={{ color: 'var(--color-accent)' }} /> Capture Viewport
                  </h3>
                  {calibrateMode !== 'none' && (
                    <span className="status-pill status-locked" style={{ animation: 'none' }}>
                      Drag on preview to map {calibrateMode.toUpperCase()} ROI
                    </span>
                  )}
                </div>

                {/* Input selection tabs */}
                <div className="settings-tabs" style={{ width: '100%' }}>
                  <button 
                    onClick={() => { setInputTab('screen'); stopStreamsAndClear(); }} 
                    className={`tab-btn ${inputTab === 'screen' ? 'active' : ''}`}
                  >
                    <Monitor size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                    Screen Share
                  </button>
                  <button 
                    onClick={() => { setInputTab('camera'); stopStreamsAndClear(); }} 
                    className={`tab-btn ${inputTab === 'camera' ? 'active' : ''}`}
                  >
                    <Video size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                    Live Camera (HP)
                  </button>
                  <button 
                    onClick={() => { setInputTab('file'); stopStreamsAndClear(); }} 
                    className={`tab-btn ${inputTab === 'file' ? 'active' : ''}`}
                  >
                    <ImageIcon size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                    Upload Photo
                  </button>
                </div>
              </div>

              {/* Bounded Video/Canvas Viewport */}
              <div className="capture-container">
                <video 
                  ref={videoRef} 
                  autoPlay
                  playsInline 
                  muted 
                  style={{ display: 'none' }} 
                />
                
                <canvas 
                  ref={canvasRef} 
                  className="preview-canvas"
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  style={{ cursor: calibrateMode !== 'none' ? 'crosshair' : 'default' }}
                />

                {/* Invisible element to buffer the static upload */}
                {inputTab === 'file' && uploadedImageSrc && (
                  <img 
                    ref={uploadedImageRef}
                    src={uploadedImageSrc}
                    style={{ display: 'none' }}
                    onLoad={processStaticImage}
                    alt="buffer upload"
                  />
                )}

                {/* Placeholder Overlay based on selected input source */}
                {!isCapturing && inputTab !== 'file' && (
                  <div className="placeholder-overlay">
                    {inputTab === 'screen' ? (
                      <>
                        <Monitor size={48} className="placeholder-icon" />
                        <div>
                          <h4 style={{ marginBottom: '0.25rem', fontWeight: 700 }}>No active Screen Share</h4>
                          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            Click "Start Screen Capture" below and share your GTA V window.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Video size={48} className="placeholder-icon" />
                        <div>
                          <h4 style={{ marginBottom: '0.25rem', fontWeight: 700 }}>Camera feed disconnected</h4>
                          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            Click "Start Camera Stream" below. Point your HP camera at the gaming monitor.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Drag and Drop Zone for static file input */}
                {inputTab === 'file' && !uploadedImageSrc && (
                  <div 
                    className={`placeholder-overlay file-drop-zone ${isDragOver ? 'drag-over' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <Upload size={48} className="placeholder-icon" />
                    <div>
                      <h4 style={{ marginBottom: '0.25rem', fontWeight: 700 }}>Drag & Drop Game Screenshot</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.0rem' }}>
                        Supports JPEG, PNG photos taken directly from your phone.
                      </p>
                      <label className="btn btn-primary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                        Browse Photo
                        <input 
                          type="file" 
                          accept="image/*"
                          style={{ display: 'none' }} 
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              handlePhotoUpload(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Action Controls */}
              <div className="controls-row">
                {/* Screen Share Mode */}
                {inputTab === 'screen' && (
                  !isCapturing ? (
                    <button onClick={startScreenCapture} className="btn btn-primary">
                      <Play size={16} /> Start Screen Capture
                    </button>
                  ) : (
                    <>
                      <button onClick={stopStreamsAndClear} className="btn btn-danger">
                        <Square size={16} /> Stop Capture
                      </button>
                      <button 
                        onClick={toggleFreeze} 
                        className={`btn btn-secondary ${isFrozen ? 'active' : ''}`}
                      >
                        <Camera size={16} /> {isFrozen ? 'Resume' : 'Freeze'}
                      </button>
                      <button onClick={resetStateAndCounters} className="btn btn-secondary">
                        <RefreshCw size={16} /> Reset
                      </button>
                    </>
                  )
                )}

                {/* Live Camera Mode */}
                {inputTab === 'camera' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                    {devices.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          Select Camera Source:
                        </span>
                        <select 
                          value={selectedDeviceId}
                          onChange={(e) => {
                            setSelectedDeviceId(e.target.value);
                            if (isCapturing) {
                              stopStreamsAndClear();
                              setTimeout(() => startCameraCapture(), 200);
                            }
                          }}
                          className="tab-btn"
                          style={{ background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--border-radius-sm)', padding: '0.4rem', color: 'white', cursor: 'pointer', maxWidth: '250px' }}
                        >
                          {devices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId} style={{ background: 'var(--bg-primary)' }}>
                              {d.label || `Camera ${d.deviceId.substring(0, 5)}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="controls-row">
                      {!isCapturing ? (
                        <button onClick={startCameraCapture} className="btn btn-primary">
                          <Play size={16} /> Start Camera Stream
                        </button>
                      ) : (
                        <>
                          <button onClick={stopStreamsAndClear} className="btn btn-danger">
                            <Square size={16} /> Stop Camera
                          </button>
                          <button 
                            onClick={toggleFreeze} 
                            className={`btn btn-secondary ${isFrozen ? 'active' : ''}`}
                          >
                            <Camera size={16} /> {isFrozen ? 'Resume' : 'Freeze'}
                          </button>
                          <button onClick={resetStateAndCounters} className="btn btn-secondary">
                            <RefreshCw size={16} /> Reset
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Upload Photo Mode */}
                {inputTab === 'file' && uploadedImageSrc && (
                  <>
                    <button onClick={clearUploadedPhoto} className="btn btn-danger">
                      Clear/Upload Another
                    </button>
                    <button onClick={() => processStaticImage()} className="btn btn-secondary">
                      <RefreshCw size={16} /> Re-run Scan
                    </button>
                    <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                      Change Photo
                      <input 
                        type="file" 
                        accept="image/*"
                        style={{ display: 'none' }} 
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handlePhotoUpload(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </>
                )}
              </div>

              {captureError && (
                <div style={{ 
                  color: '#ef4444', 
                  fontSize: '0.85rem', 
                  background: 'rgba(239, 68, 68, 0.1)', 
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--border-radius-sm)',
                  marginTop: '0.5rem'
                }}>
                  {captureError}
                </div>
              )}
            </div>

            {/* Keyboard Hotkeys & Overrides */}
            {inputTab !== 'file' && (
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div className="panel-header" style={{ paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                  <h4 className="panel-title" style={{ fontSize: '1rem' }}>
                    <Activity size={16} style={{ color: 'var(--color-accent)' }} /> Keyboard Hotkeys
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'center' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                    Press <kbd className="brand-badge" style={{ padding: '1px 4px' }}>G</kbd>, <kbd className="brand-badge" style={{ padding: '1px 4px' }}>Y</kbd>, or <kbd className="brand-badge" style={{ padding: '1px 4px' }}>B</kbd> on your keyboard to instantly trigger a manual color query. Press <kbd className="brand-badge" style={{ padding: '1px 4px' }}>R</kbd> to clear counters.
                  </p>
                  <div className="controls-row" style={{ justifyContent: 'flex-end' }}>
                    <button onClick={() => forceTriggerQuestion('green')} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                      🟩 Green (G)
                    </button>
                    <button onClick={() => forceTriggerQuestion('yellow')} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                      🟨 Yellow (Y)
                    </button>
                    <button onClick={() => forceTriggerQuestion('blue')} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                      🟦 Blue (B)
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Counts, Answer Panel, & Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Real-time Counters */}
            <div className="glass-panel">
              <h3 className="panel-title">Detected Counts</h3>
              
              <div className="counters-grid">
                <div className="counter-card green active">
                  <span className="counter-label">Green</span>
                  <span ref={greenTextRef} className="counter-value">0</span>
                </div>
                <div className="counter-card yellow active">
                  <span className="counter-label">Yellow</span>
                  <span ref={yellowTextRef} className="counter-value">0</span>
                </div>
                <div className="counter-card blue active">
                  <span className="counter-label">Blue</span>
                  <span ref={blueTextRef} className="counter-value">0</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0 0.25rem' }}>
                <span>Grand Total Active Tiles:</span>
                <strong ref={totalTextRef}>0</strong>
              </div>
            </div>

            {/* Auto Answer HUD */}
            {inputTab !== 'file' && (
              <div className="glass-panel auto-answer-panel">
                <div className="panel-header" style={{ border: 'none', padding: 0 }}>
                  <h3 className="panel-title">
                    <Zap size={18} style={{ color: '#c084fc' }} /> Question recognition HUD
                  </h3>
                  <span className="brand-badge" style={{ background: settings.autoAnswerEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.15)', color: settings.autoAnswerEnabled ? '#10b981' : 'var(--color-text-secondary)', borderColor: 'transparent' }}>
                    {settings.autoAnswerEnabled ? 'AUTO DETECT' : 'MANUAL OVERRIDE'}
                  </span>
                </div>

                <div className="auto-answer-display">
                  <div ref={questionContainerRef} className="display-box">
                    <span className="display-title">Target Question</span>
                    <span ref={questionTextRef} className="display-content">WAITING</span>
                  </div>

                  <div ref={answerContainerRef} className="display-box">
                    <span className="display-title">Correct Answer</span>
                    <span ref={answerTextRef} className="giant-answer">0</span>
                  </div>
                </div>
              </div>
            )}

            {/* Performance Card */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div className="performance-grid">
                <div className="perf-stat">
                  <span className="perf-name">FPS</span>
                  <span ref={fpsTextRef} className="perf-val">0</span>
                </div>
                <div className="perf-stat">
                  <span className="perf-name">Latency</span>
                  <span ref={latencyTextRef} className="perf-val">0 ms</span>
                </div>
              </div>
            </div>

            {/* Configuration Drawer */}
            <div className="glass-panel">
              <h3 className="panel-title">
                <Sliders size={18} style={{ color: 'var(--color-accent)' }} /> Configuration Settings
              </h3>

              <div className="settings-tabs">
                <button 
                  onClick={() => { setActiveTab('roi'); setCalibrateMode('none'); }} 
                  className={`tab-btn ${activeTab === 'roi' ? 'active' : ''}`}
                >
                  ROI Borders
                </button>
                <button 
                  onClick={() => { setActiveTab('hsv'); setCalibrateMode('none'); }} 
                  className={`tab-btn ${activeTab === 'hsv' ? 'active' : ''}`}
                >
                  HSV Tuning
                </button>
                <button 
                  onClick={() => { setActiveTab('general'); setCalibrateMode('none'); }} 
                  className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                >
                  Sensitivities
                </button>
              </div>

              <div className="settings-section">
                
                {/* ROI tab */}
                {activeTab === 'roi' && (
                  <div className="roi-calibration-box">
                    <span className="setting-group-title">Board ROI Calibration</span>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <button 
                        onClick={() => setCalibrateMode(calibrateMode === 'board' ? 'none' : 'board')}
                        className={`btn btn-secondary ${calibrateMode === 'board' ? 'active' : ''}`}
                        style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                      >
                        {calibrateMode === 'board' ? 'Cancel Calibration' : 'Map Board Region'}
                      </button>
                    </div>

                    <div className="slider-container">
                      <span className="slider-label">X Pos (%)</span>
                      <input 
                        type="range" min="0" max="100" value={boardRoi.x}
                        onChange={(e) => setBoardRoi({ ...boardRoi, x: parseInt(e.target.value) })}
                      />
                      <span className="slider-val">{boardRoi.x}%</span>
                    </div>
                    <div className="slider-container">
                      <span className="slider-label">Y Pos (%)</span>
                      <input 
                        type="range" min="0" max="100" value={boardRoi.y}
                        onChange={(e) => setBoardRoi({ ...boardRoi, y: parseInt(e.target.value) })}
                      />
                      <span className="slider-val">{boardRoi.y}%</span>
                    </div>
                    <div className="slider-container">
                      <span className="slider-label">Width (%)</span>
                      <input 
                        type="range" min="1" max="100" value={boardRoi.width}
                        onChange={(e) => setBoardRoi({ ...boardRoi, width: parseInt(e.target.value) })}
                      />
                      <span className="slider-val">{boardRoi.width}%</span>
                    </div>
                    <div className="slider-container">
                      <span className="slider-label">Height (%)</span>
                      <input 
                        type="range" min="1" max="100" value={boardRoi.height}
                        onChange={(e) => setBoardRoi({ ...boardRoi, height: parseInt(e.target.value) })}
                      />
                      <span className="slider-val">{boardRoi.height}%</span>
                    </div>

                    {inputTab !== 'file' && (
                      <>
                        <span className="setting-group-title" style={{ marginTop: '0.5rem' }}>Question ROI Calibration</span>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <button 
                            onClick={() => setCalibrateMode(calibrateMode === 'question' ? 'none' : 'question')}
                            className={`btn btn-secondary ${calibrateMode === 'question' ? 'active' : ''}`}
                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                          >
                            {calibrateMode === 'question' ? 'Cancel Calibration' : 'Map Question Region'}
                          </button>
                        </div>

                        <div className="slider-container">
                          <span className="slider-label">X Pos (%)</span>
                          <input 
                            type="range" min="0" max="100" value={questionRoi.x}
                            onChange={(e) => setQuestionRoi({ ...questionRoi, x: parseInt(e.target.value) })}
                          />
                          <span className="slider-val">{questionRoi.x}%</span>
                        </div>
                        <div className="slider-container">
                          <span className="slider-label">Y Pos (%)</span>
                          <input 
                            type="range" min="0" max="100" value={questionRoi.y}
                            onChange={(e) => setQuestionRoi({ ...questionRoi, y: parseInt(e.target.value) })}
                          />
                          <span className="slider-val">{questionRoi.y}%</span>
                        </div>
                        <div className="slider-container">
                          <span className="slider-label">Width (%)</span>
                          <input 
                            type="range" min="1" max="100" value={questionRoi.width}
                            onChange={(e) => setQuestionRoi({ ...questionRoi, width: parseInt(e.target.value) })}
                          />
                          <span className="slider-val">{questionRoi.width}%</span>
                        </div>
                        <div className="slider-container">
                          <span className="slider-label">Height (%)</span>
                          <input 
                            type="range" min="1" max="100" value={questionRoi.height}
                            onChange={(e) => setQuestionRoi({ ...questionRoi, height: parseInt(e.target.value) })}
                          />
                          <span className="slider-val">{questionRoi.height}%</span>
                        </div>

                        <span className="setting-group-title" style={{ marginTop: '0.5rem' }}>Layout Presets</span>
                        <div className="preset-grid">
                          <button onClick={() => applyPresetRoi('standard')} className="btn btn-secondary btn-preset">
                            Standard
                          </button>
                          <button onClick={() => applyPresetRoi('centered-large')} className="btn btn-secondary btn-preset">
                            Large Centered
                          </button>
                          <button onClick={() => applyPresetRoi('bottom-centered')} className="btn btn-secondary btn-preset">
                            Bottom Board
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* HSV Tab */}
                {activeTab === 'hsv' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="settings-tabs" style={{ marginBottom: '0.5rem' }}>
                      {(['green', 'yellow', 'blue'] as ColorType[]).map((col) => (
                        <button 
                          key={col}
                          onClick={() => setActiveColorTab(col)} 
                          className={`tab-btn ${activeColorTab === col ? 'active' : ''}`}
                        >
                          {col.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    <div className="setting-group">
                      <span className="setting-group-title">
                        {activeColorTab.toUpperCase()} Threshold Bounds
                      </span>

                      <div className="slider-container">
                        <span className="slider-label">Hue Min</span>
                        <input 
                          type="range" min="0" max="180" value={settings.colors[activeColorTab].hMin}
                          onChange={(e) => {
                            const newColors = { ...settings.colors };
                            newColors[activeColorTab].hMin = parseInt(e.target.value);
                            setSettings({ ...settings, colors: newColors });
                          }}
                        />
                        <span className="slider-val">{settings.colors[activeColorTab].hMin}</span>
                      </div>
                      <div className="slider-container">
                        <span className="slider-label">Hue Max</span>
                        <input 
                          type="range" min="0" max="180" value={settings.colors[activeColorTab].hMax}
                          onChange={(e) => {
                            const newColors = { ...settings.colors };
                            newColors[activeColorTab].hMax = parseInt(e.target.value);
                            setSettings({ ...settings, colors: newColors });
                          }}
                        />
                        <span className="slider-val">{settings.colors[activeColorTab].hMax}</span>
                      </div>

                      <div className="slider-container">
                        <span className="slider-label">Sat Min</span>
                        <input 
                          type="range" min="0" max="255" value={settings.colors[activeColorTab].sMin}
                          onChange={(e) => {
                            const newColors = { ...settings.colors };
                            newColors[activeColorTab].sMin = parseInt(e.target.value);
                            setSettings({ ...settings, colors: newColors });
                          }}
                        />
                        <span className="slider-val">{settings.colors[activeColorTab].sMin}</span>
                      </div>
                      <div className="slider-container">
                        <span className="slider-label">Sat Max</span>
                        <input 
                          type="range" min="0" max="255" value={settings.colors[activeColorTab].sMax}
                          onChange={(e) => {
                            const newColors = { ...settings.colors };
                            newColors[activeColorTab].sMax = parseInt(e.target.value);
                            setSettings({ ...settings, colors: newColors });
                          }}
                        />
                        <span className="slider-val">{settings.colors[activeColorTab].sMax}</span>
                      </div>

                      <div className="slider-container">
                        <span className="slider-label">Val Min</span>
                        <input 
                          type="range" min="0" max="255" value={settings.colors[activeColorTab].vMin}
                          onChange={(e) => {
                            const newColors = { ...settings.colors };
                            newColors[activeColorTab].vMin = parseInt(e.target.value);
                            setSettings({ ...settings, colors: newColors });
                          }}
                        />
                        <span className="slider-val">{settings.colors[activeColorTab].vMin}</span>
                      </div>
                      <div className="slider-container">
                        <span className="slider-label">Val Max</span>
                        <input 
                          type="range" min="0" max="255" value={settings.colors[activeColorTab].vMax}
                          onChange={(e) => {
                            const newColors = { ...settings.colors };
                            newColors[activeColorTab].vMax = parseInt(e.target.value);
                            setSettings({ ...settings, colors: newColors });
                          }}
                        />
                        <span className="slider-val">{settings.colors[activeColorTab].vMax}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* General/Sensitivity Tab */}
                {activeTab === 'general' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <span className="setting-group-title">Tile Contour Bounds</span>
                    <div className="slider-container">
                      <span className="slider-label">Min Area</span>
                      <input 
                        type="range" min="10" max="2000" value={settings.minArea}
                        onChange={(e) => setSettings({ ...settings, minArea: parseInt(e.target.value) })}
                      />
                      <span className="slider-val">{settings.minArea}px</span>
                    </div>
                    <div className="slider-container">
                      <span className="slider-label">Max Area</span>
                      <input 
                        type="range" min="2000" max="40000" step="500" value={settings.maxArea}
                        onChange={(e) => setSettings({ ...settings, maxArea: parseInt(e.target.value) })}
                      />
                      <span className="slider-val">{settings.maxArea}px</span>
                    </div>
                    <div className="slider-container">
                      <span className="slider-label">Aspect Ratio Diff</span>
                      <input 
                        type="range" min="0.05" max="0.6" step="0.05" value={settings.aspectRatioTolerance}
                        onChange={(e) => setSettings({ ...settings, aspectRatioTolerance: parseFloat(e.target.value) })}
                      />
                      <span className="slider-val">{settings.aspectRatioTolerance}</span>
                    </div>

                    <span className="setting-group-title" style={{ marginTop: '0.5rem' }}>Auto-Answer Behavior</span>
                    <div className="slider-container">
                      <span className="slider-label">Grid Trigger Min</span>
                      <input 
                        type="range" min="2" max="25" value={settings.gridDetectionSensitivity}
                        onChange={(e) => setSettings({ ...settings, gridDetectionSensitivity: parseInt(e.target.value) })}
                      />
                      <span className="slider-val">{settings.gridDetectionSensitivity}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={settings.autoAnswerEnabled}
                          onChange={(e) => setSettings({ ...settings, autoAnswerEnabled: e.target.checked })}
                          style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }}
                        />
                        Enable Auto Question Color Recognition
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={settings.debugOverlayEnabled}
                          onChange={(e) => setSettings({ ...settings, debugOverlayEnabled: e.target.checked })}
                          style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }}
                        />
                        Draw Box Contours on Canvas
                      </label>
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
