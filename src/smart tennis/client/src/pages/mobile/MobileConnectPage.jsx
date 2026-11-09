import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Wifi,
  WifiOff,
  QrCode,
  Edit3,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Server,
  ArrowRight,
  ShieldCheck,
  GraduationCap,
  LogIn,
  Sparkles
} from 'lucide-react';
import {
  getSavedServerUrl,
  saveServerUrl,
  testServerConnection,
  validateServerUrl,
  isNativeMobile
} from '../../services/serverConfig';
import { isCloudOnlyMode } from '../../services/appEnvironment';
import { useAuth } from '../../context/AuthContext';
import QrScannerOverlay from '../../components/mobile/QrScannerOverlay';

export default function MobileConnectPage() {
  const navigate = useNavigate();
  const { user, isGuest, enterAsGuest } = useAuth();

  const [configuredUrl, setConfiguredUrl] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [serverDetails, setServerDetails] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [inputError, setInputError] = useState(null);

  useEffect(() => {
    if (isNativeMobile() || isCloudOnlyMode()) {
      navigate('/mobile/dashboard', { replace: true });
      return;
    }

    const saved = getSavedServerUrl();
    if (saved) {
      setConfiguredUrl(saved);
      setManualInput(saved);
      handleTestConnection(saved);
    } else {
      const defaultHost = isNativeMobile() ? '' : window.location.origin;
      if (defaultHost) {
        setConfiguredUrl(defaultHost);
        setManualInput(defaultHost);
        handleTestConnection(defaultHost);
      } else {
        setConnectionStatus('idle');
      }
    }
  }, []);

  const handleTestConnection = async (urlToTest) => {
    const target = urlToTest !== undefined ? urlToTest : configuredUrl;
    if (!target) {
      setConnectionStatus('idle');
      setErrorMessage('Nenhum endereço de servidor configurado. Escaneie o QR Code ou digite o IP.');
      return;
    }

    setConnectionStatus('testing');
    setErrorMessage(null);

    const result = await testServerConnection(target);

    if (result.success) {
      setConnectionStatus('connected');
      setServerDetails({
        name: result.serverName,
        url: result.serverUrl,
        latency: result.latency,
        product: result.data?.product,
        version: result.data?.version,
        database: result.data?.database?.status
      });
      setErrorMessage(null);
    } else {
      setConnectionStatus('error');
      setServerDetails(null);
      setErrorMessage(result.error || 'Falha ao conectar com o servidor.');
    }
  };

  const handleSaveManualUrl = (e) => {
    e.preventDefault();
    setInputError(null);

    const validation = validateServerUrl(manualInput);
    if (!validation.valid) {
      setInputError(validation.error);
      return;
    }

    try {
      const saved = saveServerUrl(validation.normalizedUrl);
      setConfiguredUrl(saved);
      setManualInput(saved);
      setShowManualForm(false);
      handleTestConnection(saved);
    } catch (err) {
      setInputError(err.message || 'Erro ao salvar endereço.');
    }
  };

  const handleQrScanSuccess = (scannedUrl, testResult) => {
    setShowScanner(false);
    try {
      const saved = saveServerUrl(scannedUrl);
      setConfiguredUrl(saved);
      setManualInput(saved);
      if (testResult && testResult.success) {
        setConnectionStatus('connected');
        setServerDetails({
          name: testResult.serverName,
          url: testResult.serverUrl,
          latency: testResult.latency,
          product: testResult.data?.product,
          version: testResult.data?.version,
          database: testResult.data?.database?.status
        });
        setErrorMessage(null);
      } else {
        handleTestConnection(saved);
      }
    } catch (err) {
      setErrorMessage(err.message || 'QR Code inválido.');
      setConnectionStatus('error');
    }
  };

  const handleGuestAccess = async () => {
    try {
      if (enterAsGuest) {
        await enterAsGuest();
      }
      navigate('/mobile/academy');
    } catch (e) {
      navigate('/mobile/academy');
    }
  };

  return (
    <div className="min-h-screen bg-[#060D09] text-[#F5F7F5] flex flex-col justify-between p-4 sm:p-6 pb-24 select-none">
      
      
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D1E13] border border-[#39FF88]/40 flex items-center justify-center shadow-[0_0_15px_rgba(57,255,136,0.2)]">
              <svg className="w-6 h-6 text-[#39FF88]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v18" strokeDasharray="2 2" strokeOpacity="0.6" />
                <path d="M3 12h18" strokeDasharray="2 2" strokeOpacity="0.6" />
                <circle cx="12" cy="12" r="3" fill="#39FF88" />
              </svg>
            </div>
            <div>
              <div className="text-lg font-black tracking-wider leading-none">
                <span className="text-white">MOTION </span>
                <span className="text-[#39FF88]">TENNIS</span>
              </div>
              <span className="text-[10px] text-[#8C9891] tracking-widest uppercase font-mono">
                App Mobile Oficial
              </span>
            </div>
          </div>

          
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border flex items-center space-x-1.5 ${
            connectionStatus === 'connected'
              ? 'bg-[#122A1A] border-[#39FF88]/50 text-[#39FF88]'
              : connectionStatus === 'testing'
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-[#39FF88] shadow-[0_0_8px_#39FF88]'
                : connectionStatus === 'testing'
                ? 'bg-amber-400 animate-ping'
                : 'bg-rose-500'
            }`} />
            <span>
              {connectionStatus === 'connected'
                ? 'CONECTADO'
                : connectionStatus === 'testing'
                ? 'TESTANDO'
                : 'OFFLINE'}
            </span>
          </div>
        </div>

        
        <div className="pt-2">
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">
            Conectar ao Motion Tennis
          </h1>
          <p className="text-xs text-[#8C9891] leading-relaxed">
            Conecte o seu smartphone ao servidor local no notebook para sincronizar sessões e treinos.
          </p>
        </div>
      </div>

      
      <div className="my-5 space-y-4">
        <div className={`p-5 rounded-3xl border transition-all duration-300 ${
          connectionStatus === 'connected'
            ? 'bg-[#0B1A10] border-[#39FF88]/40 shadow-[0_0_20px_rgba(57,255,136,0.1)]'
            : connectionStatus === 'testing'
            ? 'bg-[#121914] border-amber-500/30'
            : 'bg-[#140F11] border-rose-500/30'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                connectionStatus === 'connected'
                  ? 'bg-[#14301D] text-[#39FF88]'
                  : connectionStatus === 'testing'
                  ? 'bg-amber-950/60 text-amber-400'
                  : 'bg-rose-950/60 text-rose-400'
              }`}>
                {connectionStatus === 'connected' ? (
                  <Wifi className="w-6 h-6" />
                ) : connectionStatus === 'testing' ? (
                  <RefreshCw className="w-6 h-6 animate-spin" />
                ) : (
                  <WifiOff className="w-6 h-6" />
                )}
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase text-[#8C9891] block">
                  Estado da Conexão
                </span>
                <span className="text-base font-bold text-white">
                  {connectionStatus === 'connected'
                    ? (serverDetails?.name || 'Servidor Motion Tennis')
                    : connectionStatus === 'testing'
                    ? 'Testando comunicação...'
                    : 'Servidor Desconectado'}
                </span>
              </div>
            </div>

            
            <button
              onClick={() => handleTestConnection()}
              disabled={connectionStatus === 'testing'}
              className="p-2.5 rounded-xl bg-[#122417] hover:bg-[#1A3822] text-[#8C9891] hover:text-[#39FF88] border border-[#1E3B26] transition disabled:opacity-50"
              title="Testar Conexão Novamente"
            >
              <RefreshCw className={`w-4 h-4 ${connectionStatus === 'testing' ? 'animate-spin text-[#39FF88]' : ''}`} />
            </button>
          </div>

          
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono">
            <div className="truncate mr-2">
              <span className="text-[#8C9891]">Endereço: </span>
              <span className="text-[#39FF88] font-bold">
                {configuredUrl || '(nenhum configurado)'}
              </span>
            </div>
            {serverDetails?.latency && (
              <span className="px-2 py-0.5 rounded bg-black/40 text-[10px] text-emerald-400 font-mono shrink-0">
                {serverDetails.latency} ms
              </span>
            )}
          </div>

          
          {errorMessage && connectionStatus === 'error' && (
            <div className="mt-3 p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-tight">
                <span className="font-semibold block">Erro de Conexão:</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          
          {connectionStatus === 'connected' && (
            <div className="mt-3 p-2.5 rounded-xl bg-[#0F2617] border border-[#39FF88]/20 text-[11px] text-[#A2C7AE] flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#39FF88]" />
                <span>API e Banco SQLite operacionais</span>
              </span>
              <span className="font-mono text-[10px] text-[#39FF88]">v{serverDetails?.version || '1.0'}</span>
            </div>
          )}
        </div>

        
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#8C9891] block px-1">
            Opções de Conexão
          </span>

          
          <button
            onClick={() => setShowScanner(true)}
            data-testid="btn-scan-qr"
            className="w-full p-4 rounded-2xl bg-[#0D1E13] hover:bg-[#122A1A] border border-[#1E3B26] hover:border-[#39FF88]/50 flex items-center justify-between text-left transition group shadow-sm"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#14301D] border border-[#39FF88]/30 flex items-center justify-center text-[#39FF88] group-hover:scale-105 transition">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white group-hover:text-[#39FF88] transition tracking-wide uppercase">
                  ESCANEAR QR CODE
                </h3>
                <p className="text-[11px] text-[#8C9891]">
                  Aponte a câmera do aplicativo para a tela do notebook
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-[#8C9891] group-hover:text-[#39FF88] transition" />
          </button>

          
          <div className="rounded-2xl bg-[#0D1E13] border border-[#1E3B26] overflow-hidden">
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              data-testid="btn-toggle-manual-ip"
              className="w-full p-4 flex items-center justify-between text-left transition hover:bg-[#122A1A]"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#14301D] border border-[#39FF88]/30 flex items-center justify-center text-[#39FF88]">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Opção B — Informar Endereço Manualmente
                  </h3>
                  <p className="text-[11px] text-[#8C9891]">
                    Digite o IP local (ex: http:
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-[#39FF88]">
                {showManualForm ? 'Fechar' : 'Editar'}
              </span>
            </button>

            
            {showManualForm && (
              <form onSubmit={handleSaveManualUrl} className="p-4 pt-1 bg-[#09140D] border-t border-[#162E1D] space-y-3">
                <div>
                  <label className="text-[11px] font-mono text-[#8C9891] block mb-1">
                    Endereço IP e Porta do Servidor:
                  </label>
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="http://192.168.0.27:3000"
                    data-testid="input-manual-ip"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#060D09] border border-[#1E3B26] focus:border-[#39FF88] text-sm text-[#F5F7F5] font-mono outline-none transition"
                  />
                  {inputError && (
                    <span className="text-[11px] text-rose-400 mt-1 block">
                      {inputError}
                    </span>
                  )}
                  <p className="text-[10px] text-[#718278] mt-1">
                    Certifique-se de que o celular está no mesmo Wi-Fi do notebook.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    data-testid="btn-save-manual-ip"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#39FF88] hover:bg-[#2fe677] text-slate-950 font-bold text-xs uppercase tracking-wider transition"
                  >
                    Salvar e Conectar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualInput('http://192.168.0.27:3000');
                    }}
                    className="px-3 py-2.5 rounded-xl bg-[#14301D] text-[#39FF88] hover:bg-[#1B3F27] text-xs font-mono transition"
                    title="Preencher exemplo"
                  >
                    Exemplo
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      
      <div className="space-y-3 pt-2">
        
        {user && connectionStatus === 'connected' && (
          <Link
            to="/mobile/dashboard"
            data-testid="btn-mobile-goto-dashboard"
            className="w-full py-3 px-4 rounded-2xl bg-[#39FF88] hover:bg-[#2fe677] text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition shadow-neon-sm"
          >
            <span>Ir para o Dashboard ({user.name || user.username})</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3">
          
          <button
            onClick={handleGuestAccess}
            data-testid="btn-mobile-academy"
            className="p-3 rounded-2xl bg-[#0D1E13] border border-[#1E3B26] hover:border-[#39FF88]/40 flex flex-col items-center justify-center text-center space-y-1.5 transition"
          >
            <GraduationCap className="w-5 h-5 text-[#39FF88]" />
            <div>
              <span className="text-xs font-bold text-white block">Academy</span>
              <span className="text-[10px] text-[#39FF88] font-mono">100% Gratuita</span>
            </div>
          </button>

          
          <Link
            to="/login"
            data-testid="btn-mobile-login"
            className="p-3 rounded-2xl bg-[#0D1E13] border border-[#1E3B26] hover:border-[#39FF88]/40 flex flex-col items-center justify-center text-center space-y-1.5 transition"
          >
            <LogIn className="w-5 h-5 text-[#39FF88]" />
            <div>
              <span className="text-xs font-bold text-white block">Entrar</span>
              <span className="text-[10px] text-[#8C9891]">Conta de Jogador</span>
            </div>
          </Link>
        </div>

        <div className="flex items-center justify-center space-x-1.5 text-[11px] text-[#6F8176]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#39FF88]" />
          <span>Comunicação direta em rede local segura</span>
        </div>
      </div>

      
      <QrScannerOverlay
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleQrScanSuccess}
      />

    </div>
  );
}
