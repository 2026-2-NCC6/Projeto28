import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Clock,
  TrendingUp,
  User,
  Wifi,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Cloud
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { testServerConnection, getSavedServerUrl, isNativeMobile } from '../services/serverConfig';
import { cloudAuthService } from '../services/cloudAuthService';
import { isWebDemoMode, isCloudOnlyMode, isEquipmentMode } from '../services/appEnvironment';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function MobileLayout() {
  const { user, isGuest } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [connectionState, setConnectionState] = useState({
    online: true,
    latency: null,
    serverName: 'Motion Tennis Server'
  });
  const [isChecking, setIsChecking] = useState(false);
  const [cloudActive, setCloudActive] = useState(false);

  useEffect(() => {
    const session = cloudAuthService.getStoredCloudSession();
    setCloudActive(Boolean(session?.access_token || user?.isCloudOnly || user?.cloud_user_id || user?.cloudUserId));
  }, [user]);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 12000);

    const onServerChanged = () => checkConnection();
    window.addEventListener('smart_tennis_server_changed', onServerChanged);

    return () => {
      clearInterval(interval);
      window.removeEventListener('smart_tennis_server_changed', onServerChanged);
    };
  }, []);

  const checkConnection = async () => {
    if (isWebDemoMode() && !getSavedServerUrl()) {
      setConnectionState({
        online: false,
        latency: null,
        serverName: null
      });
      return;
    }
    if ((isCloudOnlyMode() || isNativeMobile()) && !getSavedServerUrl()) {
      setConnectionState({
        online: false,
        latency: null,
        serverName: null
      });
      return;
    }

    setIsChecking(true);
    const res = await testServerConnection();
    setIsChecking(false);
    if (res.success) {
      setConnectionState({
        online: true,
        latency: res.latency,
        serverName: res.serverName || 'Motion Tennis Server'
      });
    } else {
      setConnectionState({
        online: false,
        latency: null,
        serverName: null
      });
    }
  };

  const navItems = [
    { to: '/mobile/dashboard', label: 'Início', icon: Home, testId: 'nav-mobile-home' },
    { to: '/mobile/history', label: 'Histórico', icon: Clock, testId: 'nav-mobile-history' },
    { to: '/mobile/evolution', label: 'Evolução', icon: TrendingUp, testId: 'nav-mobile-evolution' },
    { to: '/mobile/profile', label: 'Perfil', icon: User, testId: 'nav-mobile-profile' },
  ];

  return (
    <div className="min-h-screen bg-[#DCE3E8] dark:bg-[#101820] text-[#142B3D] dark:text-[#F1F5F9] flex flex-col justify-between selection:bg-[#B8F044] selection:text-[#101820] transition-colors duration-200">
      
      
      <header className="sticky top-0 z-40 bg-[#142B3D]/95 dark:bg-[#0D1B2A]/95 backdrop-blur border-b border-[#1C3A52] dark:border-[#344653] px-3 sm:px-4 py-2.5 flex items-center justify-between safe-area-top text-white">
        
        <div 
          onClick={() => navigate('/mobile/dashboard')}
          className="flex items-center space-x-2 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-[#0D1C28] border border-[#B8F044]/50 flex items-center justify-center text-[#B8F044] shadow-xs">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" fill="#B8F044" />
            </svg>
          </div>
          <span className="text-sm font-black tracking-wider uppercase">
            MOTION <span className="text-[#B8F044]">TENNIS</span>
          </span>
        </div>

        
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          <ThemeToggle className="py-1 px-1.5 text-xs" />

          
          {isEquipmentMode() && !isNativeMobile() ? (
            <button
              onClick={() => navigate('/mobile/connect')}
              data-testid="header-connection-pill"
              className={`px-2 py-1 rounded-full text-[10px] font-mono font-bold flex items-center space-x-1 border transition ${
                connectionState.online
                  ? 'bg-[#0D1C28] border-[#B8F044]/40 text-[#B8F044] hover:bg-[#1C3A52]'
                  : cloudActive
                    ? 'bg-[#0D1C28] border-[#B8F044]/40 text-[#B8F044] hover:bg-[#1C3A52]'
                    : 'bg-rose-950/60 border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
              }`}
              title={connectionState.online ? 'Conectado à quadra' : cloudActive ? 'Acessando via Supabase Cloud' : 'Toque para gerenciar conexão do servidor'}
            >
              {connectionState.online ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8F044] shadow-[0_0_6px_#B8F044] animate-pulse" />
                  <span>{connectionState.latency ? `${connectionState.latency}ms` : 'Quadra'}</span>
                </>
              ) : cloudActive ? (
                <>
                  <Cloud className="w-3 h-3 text-[#B8F044]" />
                  <span>Nuvem</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Offline</span>
                </>
              )}
            </button>
          ) : (
            <div
              data-testid="header-connection-pill"
              className={`px-2 py-1 rounded-full text-[10px] font-mono font-bold flex items-center space-x-1 border ${
                cloudActive
                  ? 'bg-[#0D1C28] border-[#B8F044]/40 text-[#B8F044]'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
              }`}
            >
              {cloudActive ? (
                <>
                  <Cloud className="w-3 h-3 text-[#B8F044]" />
                  <span>Nuvem</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Offline</span>
                </>
              )}
            </div>
          )}

          
          {user ? (
            <div 
              onClick={() => navigate('/mobile/profile')}
              className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-[#0D1C28] border border-[#1C3A52] cursor-pointer"
            >
              <span className="text-xs">{user.avatar || '🎾'}</span>
              <span className="text-[11px] font-bold text-white max-w-[70px] truncate">
                {user.name}
              </span>
            </div>
          ) : isGuest ? (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-400/40 text-blue-200 text-[10px] font-mono font-bold">
              <Sparkles className="w-3 h-3 text-blue-300" />
              <span>Visitante</span>
            </div>
          ) : null}
        </div>
      </header>

      
      {!cloudActive && !connectionState.online && location.pathname !== '/mobile/connect' && (
        <div className="bg-rose-950/90 border-b border-rose-500/30 px-4 py-2 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center space-x-2 truncate mr-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">Sem conexão com a internet. Verifique sua rede.</span>
          </div>
          {isEquipmentMode() && !isNativeMobile() && (
            <button
              onClick={() => navigate('/mobile/connect')}
              className="px-2.5 py-1 rounded-lg bg-rose-900 text-rose-100 font-bold text-[10px] shrink-0 uppercase"
            >
              Reconectar
            </button>
          )}
        </div>
      )}

      
      <main className="flex-1 pb-24 overflow-y-auto">
        <Outlet />
      </main>

      
      <nav 
        data-testid="mobile-bottom-navigation"
        className="fixed bottom-0 inset-x-0 z-40 bg-[#142B3D]/98 dark:bg-[#0D1B2A]/98 backdrop-blur-md border-t border-[#1C3A52] dark:border-[#344653] px-1 py-1.5 safe-area-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.2)] text-slate-300"
      >
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={item.testId}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-semibold transition ${
                    isActive
                      ? 'bg-[#122A1A] text-[#39FF88] font-bold shadow-[0_0_12px_rgba(57,255,136,0.15)]'
                      : 'text-[#8C9891] hover:text-[#F5F7F5]'
                  }`
                }
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
