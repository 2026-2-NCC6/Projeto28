import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { isValidQrCodeContent, testServerConnection, saveServerUrl } from '../../services/serverConfig';

export default function QrScannerOverlay({ isOpen, onClose, onScanSuccess }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameId = useRef(null);
  const streamRef = useRef(null);
  const isProcessingRef = useRef(false);

  const [permissionError, setPermissionError] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [scanSuccessData, setScanSuccessData] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    setScanSuccessData(null);
    setIsValidating(false);
    isProcessingRef.current = false;
    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = () => {
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async () => {
    setIsInitializing(true);
    setPermissionError(null);
    setScanError(null);
    setScanSuccessData(null);
    isProcessingRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError('Acesso à câmera não é suportado neste navegador ou ambiente.');
      setIsInitializing(false);
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          });
        } catch (e2) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsInitializing(false);
        scanFrame();
      }
    } catch (err) {
      console.warn('Erro ao acessar câmera:', err);
      setIsInitializing(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError('Permissão de câmera negada. Você pode conceder a permissão nas configurações ou digitar o IP do notebook manualmente.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionError('Nenhuma câmera encontrada no aparelho. Por favor, utilize a digitação manual do IP.');
      } else {
        setPermissionError(`Não foi possível iniciar a câmera (${err.message || 'Erro desconhecido'}). Utilize o IP manual.`);
      }
    }
  };

  const handleDetectedCode = async (rawText) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsValidating(true);
    setScanError(null);

    const validation = isValidQrCodeContent(rawText);
    if (!validation.valid) {
      setScanError(validation.error || 'QR Code não é um endereço de servidor Motion Tennis válido.');
      setIsValidating(false);
      isProcessingRef.current = false;
      animFrameId.current = requestAnimationFrame(scanFrame);
      return;
    }

    const targetUrl = validation.normalizedUrl;

    try {
      const testResult = await testServerConnection(targetUrl);
      if (testResult.success) {
        saveServerUrl(targetUrl);
        setScanSuccessData({
          url: targetUrl,
          name: testResult.serverName,
          latency: testResult.latency
        });

        setTimeout(() => {
          stopCamera();
          if (onScanSuccess) {
            onScanSuccess(targetUrl, testResult);
          }
        }, 900);
      } else {
        setScanError(testResult.error || 'O servidor não respondeu. Verifique se o notebook está na mesma rede Wi-Fi.');
        setIsValidating(false);
        isProcessingRef.current = false;
        animFrameId.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      setScanError('Falha ao validar servidor: ' + (err.message || 'Erro de rede.'));
      setIsValidating(false);
      isProcessingRef.current = false;
      animFrameId.current = requestAnimationFrame(scanFrame);
    }
  };

  const scanFrame = () => {
    if (isProcessingRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        handleDetectedCode(code.data.trim());
        return;
      }
    }

    animFrameId.current = requestAnimationFrame(scanFrame);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 animate-fadeIn select-none">
      
      <div className="flex items-center justify-between pt-6 px-2">
        <div className="flex items-center space-x-2 text-[#39FF88]">
          <Camera className="w-5 h-5" />
          <span className="text-sm font-bold tracking-wider uppercase">Leitor de QR Code</span>
        </div>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="p-2 rounded-full bg-slate-800/80 text-slate-300 hover:text-white"
          aria-label="Fechar leitor"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      
      <div className="relative flex-1 my-4 flex items-center justify-center overflow-hidden rounded-3xl bg-black border border-slate-800">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        
        {!permissionError && !isInitializing && !scanSuccessData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64 border-2 border-dashed border-[#39FF88]/40 rounded-2xl flex items-center justify-center">
              
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#39FF88] rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#39FF88] rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#39FF88] rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#39FF88] rounded-br-lg" />

              
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#39FF88] to-transparent shadow-[0_0_12px_#39FF88] animate-pulse" />
            </div>
          </div>
        )}

        
        {isInitializing && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#39FF88] animate-spin" />
            <span className="text-xs text-slate-400">Iniciando câmera...</span>
          </div>
        )}

        
        {isValidating && !scanSuccessData && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center space-y-3 z-10">
            <RefreshCw className="w-10 h-10 text-[#39FF88] animate-spin" />
            <span className="text-sm font-bold text-white">Validando servidor Motion Tennis...</span>
            <span className="text-xs text-slate-400">Testando comunicação via Wi-Fi</span>
          </div>
        )}

        
        {scanSuccessData && (
          <div className="absolute inset-x-6 p-6 rounded-3xl bg-[#091A10] border-2 border-[#39FF88] text-center space-y-3 z-20 shadow-[0_0_30px_rgba(57,255,136,0.3)] animate-fadeIn">
            <CheckCircle2 className="w-12 h-12 text-[#39FF88] mx-auto animate-bounce" />
            <h4 className="text-base font-black text-white uppercase tracking-wider">Servidor Conectado!</h4>
            <p className="text-xs font-mono text-[#39FF88]">{scanSuccessData.url}</p>
            <div className="text-[11px] text-slate-300">
              <span>{scanSuccessData.name}</span>
              <span className="mx-1">•</span>
              <span className="text-emerald-400 font-mono">{scanSuccessData.latency} ms</span>
            </div>
          </div>
        )}

        
        {permissionError && (
          <div className="absolute inset-x-6 p-6 rounded-2xl bg-slate-900 border border-rose-500/40 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">Acesso à Câmera Indisponível</h4>
            <p className="text-xs text-slate-300 leading-relaxed">{permissionError}</p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={startCamera}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
              >
                Tentar Câmera Novamente
              </button>
              <button
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#39FF88] text-slate-950 text-xs font-bold transition"
              >
                Digitar IP Manualmente
              </button>
            </div>
          </div>
        )}
      </div>

      
      <div className="pb-6 text-center px-4 space-y-2">
        {scanError ? (
          <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{scanError}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Aponte a câmera para o QR Code exibido na tela do notebook Motion Tennis.
          </p>
        )}
      </div>
    </div>
  );
}
