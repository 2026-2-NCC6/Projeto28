import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Smartphone, QrCode, X, Copy, Check, Wifi, ShieldCheck, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function ConnectMobileModal({ isOpen, onClose }) {
  const [lanUrl, setLanUrl] = useState('');
  const [lanAddresses, setLanAddresses] = useState([]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    loadNetworkInfo();
  }, [isOpen]);

  const loadNetworkInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await api.getStatus();
      const serverInfo = status?.server || {};
      const url = serverInfo.lanUrl || `http://${window.location.hostname || '192.168.0.27'}:3000`;
      const addrs = serverInfo.lanAddresses?.length > 0 ? serverInfo.lanAddresses : [url];
      
      setLanUrl(url);
      setLanAddresses(addrs);
      await generateQr(url);
    } catch (err) {
      console.error('Erro ao carregar dados de rede do servidor:', err);
      const fallbackUrl = `http://${window.location.hostname || '192.168.0.27'}:3000`;
      setLanUrl(fallbackUrl);
      setLanAddresses([fallbackUrl]);
      await generateQr(fallbackUrl);
    } finally {
      setLoading(false);
    }
  };

  const generateQr = async (text) => {
    try {
      const url = await QRCode.toDataURL(text, {
        width: 280,
        margin: 2,
        color: {
          dark: '#05160E',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      setQrDataUrl(url);
    } catch (e) {
      setError('Falha ao gerar imagem do QR Code.');
    }
  };

  const handleSelectAddress = async (addr) => {
    setLanUrl(addr);
    await generateQr(addr);
  };

  const handleCopy = () => {
    if (!lanUrl) return;
    navigator.clipboard?.writeText(lanUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0A120E] border border-[#1B3624] rounded-3xl p-6 sm:p-8 shadow-2xl text-[#F5F7F5] space-y-6">
        
        
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-[#122418] hover:bg-[#1B3624] text-[#8C9891] hover:text-[#F5F7F5] transition"
          aria-label="Fechar modal"
        >
          <X className="w-5 h-5" />
        </button>

        
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-[#122418] border border-[#39FF88]/30 flex items-center justify-center text-[#39FF88]">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-wider text-[#F5F7F5]">
              Conectar Celular Android
            </h2>
            <p className="text-xs text-[#8C9891]">
              Pareie o aplicativo mobile Motion Tennis via QR Code ou IP local
            </p>
          </div>
        </div>

        
        <div className="flex flex-col items-center justify-center p-6 bg-[#0E1B13] rounded-2xl border border-[#1B3624] space-y-4">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-[#39FF88] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[#8C9891]">Detectando rede local...</span>
            </div>
          ) : qrDataUrl ? (
            <>
              <div className="p-3 bg-white rounded-2xl shadow-lg border-2 border-[#39FF88]/40">
                <img
                  src={qrDataUrl}
                  alt={`QR Code para ${lanUrl}`}
                  className="w-56 h-56 rounded-lg object-contain"
                />
              </div>
              <div className="text-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#122418] text-[#39FF88] border border-[#39FF88]/30">
                  <Wifi className="w-3.5 h-3.5 mr-1.5" />
                  Rede Local Wi-Fi
                </span>
              </div>
            </>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-rose-400 text-xs">
              <AlertCircle className="w-8 h-8 mb-2" />
              {error || 'Não foi possível gerar o QR Code'}
            </div>
          )}

          
          <div className="w-full">
            <div className="flex items-center justify-between p-3 bg-[#070E0A] border border-[#1B3624] rounded-xl text-xs font-mono">
              <span className="text-[#39FF88] truncate mr-2 font-semibold">
                {lanUrl || 'Carregando endereço...'}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-[#122418] hover:bg-[#1B3624] text-[#F5F7F5] transition text-xs font-sans shrink-0 font-bold"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#39FF88]" />
                    <span className="text-[#39FF88]">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          
          {lanAddresses.length > 1 && (
            <div className="w-full text-left space-y-1">
              <span className="text-[11px] text-[#8C9891]">Outras interfaces de rede:</span>
              <div className="flex flex-wrap gap-1.5">
                {lanAddresses.map((addr) => (
                  <button
                    key={addr}
                    onClick={() => handleSelectAddress(addr)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono border transition ${
                      addr === lanUrl
                        ? 'bg-[#1B3624] border-[#39FF88] text-[#39FF88]'
                        : 'bg-[#0A120E] border-[#1B3624] text-[#8C9891] hover:text-[#F5F7F5]'
                    }`}
                  >
                    {addr}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        
        <div className="space-y-2.5 text-xs text-[#8C9891] bg-[#070E0A] p-4 rounded-xl border border-[#16271D]">
          <h4 className="font-bold text-[#F5F7F5] uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
            <QrCode className="w-3.5 h-3.5 text-[#39FF88]" />
            <span>Instruções de conexão:</span>
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-[#A6B4AB]">
            <li>Conecte o smartphone na <strong>mesma rede Wi-Fi</strong> deste notebook.</li>
            <li>Abra o aplicativo <strong>Motion Tennis</strong> no celular Android.</li>
            <li>Dentro do aplicativo, toque no botão verde <strong>ESCANEAR QR CODE</strong>.</li>
            <li className="text-amber-300 font-semibold">
              ⚠️ Não use a câmera do Android fora do app (Google Lens), pois ela abrirá o endereço no Chrome em vez de configurar o aplicativo.
            </li>
          </ol>
        </div>

        
        <div className="flex items-center space-x-2 text-[11px] text-[#8C9891]">
          <ShieldCheck className="w-4 h-4 text-[#39FF88] shrink-0" />
          <span>
            Este QR Code contém apenas o endereço do servidor. Nenhuma senha, token JWT ou credencial é transmitida.
          </span>
        </div>

      </div>
    </div>
  );
}
