import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  PlayCircle, 
  BarChart2, 
  GitFork, 
  GraduationCap, 
  Clock, 
  Trophy, 
  User, 
  LogOut, 
  LogIn,
  ShieldAlert, 
  Radio, 
  Menu, 
  X,
  Sparkles,
  QrCode,
  Smartphone,
  ChevronDown,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isMobileDevice } from '../services/serverConfig';
import ConnectMobileModal from '../components/ConnectMobileModal';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function PlayerLayout() {
  const { user, isGuest, logout, exitGuest, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [desempenhoOpen, setDesempenhoOpen] = useState(false);
  const desempenhoRef = useRef(null);

  useEffect(() => {
    if (isMobileDevice() && (location.pathname === '/app' || location.pathname === '/app/dashboard')) {
      navigate('/mobile/dashboard', { replace: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (desempenhoRef.current && !desempenhoRef.current.contains(event.target)) {
        setDesempenhoOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setDesempenhoOpen(false);
      }
    }
    if (desempenhoOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [desempenhoOpen]);

  useEffect(() => {
    setDesempenhoOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    if (isGuest) {
      await exitGuest();
    } else {
      await logout();
    }
    navigate('/login');
  };

  const isDesempenhoActive = 
    location.pathname.startsWith('/app/statistics') || 
    location.pathname.startsWith('/app/evolution') ||
    location.pathname.startsWith('/app/achievements');

  const navItems = isGuest
    ? [
        { to: '/app/play', label: 'Jogar', icon: PlayCircle, highlight: true },
        { to: '/app/academy', label: 'Academy', icon: GraduationCap },
      ]
    : [
        { to: '/app/dashboard', label: 'Dashboard', icon: Home },
        { to: '/app/play', label: 'Jogar', icon: PlayCircle, highlight: true },
        { to: '/app/academy', label: 'Academy', icon: GraduationCap },
        { to: '/app/history', label: 'Histórico', icon: Clock },
        { to: '/app/achievements', label: 'Conquistas', icon: Trophy },
        { to: '/app/profile', label: 'Perfil', icon: User },
      ];

  return (
    <div className="min-h-screen bg-[#DCE3E8] dark:bg-[#101820] text-[#142B3D] dark:text-[#F1F5F9] flex flex-col font-sans transition-colors duration-200">
      
      <header className="sticky top-0 z-50 bg-[#142B3D]/95 dark:bg-[#0D1B2A]/95 backdrop-blur border-b border-[#1C3A52] dark:border-[#344653] text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            
            
            <Link to={isGuest ? '/app/play' : '/app/dashboard'} className="flex items-center space-x-2.5 group shrink-0">
              <div className="w-8 h-8 rounded-xl bg-[#0D1C28] border border-[#B8F044]/50 flex items-center justify-center shadow-xs transition-transform group-hover:scale-105">
                <svg className="w-5 h-5 text-[#B8F044]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v18" strokeDasharray="2 2" strokeOpacity="0.7" />
                  <path d="M3 12h18" strokeDasharray="2 2" strokeOpacity="0.7" />
                  <circle cx="12" cy="12" r="2.5" fill="#B8F044" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-black tracking-wider leading-none">
                  <span className="text-white">MOTION </span>
                  <span className="text-[#B8F044]">TENNIS</span>
                </span>
                <span className="text-[9px] text-[#94A3B8] tracking-widest uppercase font-semibold">
                  {isGuest ? 'Modo Visitante' : 'Área do Jogador'}
                </span>
              </div>
            </Link>

            
            <nav className="hidden lg:flex items-center space-x-1">
              
              {!isGuest && (
                <NavLink
                  to="/app/dashboard"
                  className={({ isActive }) =>
                    `flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                      isActive
                        ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/40 shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/50'
                    }`
                  }
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </NavLink>
              )}

              
              <NavLink
                to="/app/play"
                className={({ isActive }) =>
                  `flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wide transition-all ${
                    isActive
                      ? 'bg-[#B8F044] text-[#142B3D] shadow-sm'
                      : 'bg-[#B8F044]/20 text-[#B8F044] hover:bg-[#B8F044] hover:text-[#142B3D] border border-[#B8F044]/40'
                  }`
                }
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Jogar</span>
              </NavLink>

              
              {!isGuest && (
                <div className="relative" ref={desempenhoRef}>
                  <button
                    type="button"
                    data-testid="btn-nav-desempenho"
                    aria-haspopup="true"
                    aria-expanded={desempenhoOpen}
                    aria-controls="dropdown-desempenho"
                    onClick={() => setDesempenhoOpen((prev) => !prev)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all outline-none ${
                      isDesempenhoActive
                        ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/40 shadow-xs'
                        : desempenhoOpen
                        ? 'bg-[#1C3A52] text-white border border-[#1C3A52]'
                        : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/50'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-[#B8F044]" />
                    <span>Desempenho</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        desempenhoOpen ? 'rotate-180 text-[#B8F044]' : 'text-slate-400'
                      }`}
                    />
                  </button>

                  
                  {desempenhoOpen && (
                    <div
                      id="dropdown-desempenho"
                      role="menu"
                      data-testid="dropdown-desempenho"
                      className="absolute top-full left-0 mt-2 w-56 rounded-2xl bg-[#142B3D] border border-[#1C3A52] shadow-2xl p-1.5 z-50 flex flex-col space-y-1 backdrop-blur-md animate-fadeIn"
                    >
                      <NavLink
                        to="/app/statistics"
                        role="menuitem"
                        data-testid="link-nav-statistics"
                        onClick={() => setDesempenhoOpen(false)}
                        className={({ isActive }) =>
                          `flex items-start space-x-2.5 p-2.5 rounded-xl text-xs transition-all ${
                            isActive
                              ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/30 font-bold'
                              : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/60'
                          }`
                        }
                      >
                        <BarChart2 className="w-4 h-4 text-[#B8F044] mt-0.5 shrink-0" />
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-white">Estatísticas</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Métricas de golpes e precisão
                          </span>
                        </div>
                      </NavLink>

                      <NavLink
                        to="/app/evolution"
                        role="menuitem"
                        data-testid="link-nav-evolution"
                        onClick={() => setDesempenhoOpen(false)}
                        className={({ isActive }) =>
                          `flex items-start space-x-2.5 p-2.5 rounded-xl text-xs transition-all ${
                            isActive
                              ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/30 font-bold'
                              : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/60'
                          }`
                        }
                      >
                        <GitFork className="w-4 h-4 text-[#B8F044] mt-0.5 shrink-0" />
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-white">Evolução</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Árvore de habilidades e atributos
                          </span>
                        </div>
                      </NavLink>

                      <NavLink
                        to="/app/achievements"
                        role="menuitem"
                        data-testid="link-nav-achievements"
                        onClick={() => setDesempenhoOpen(false)}
                        className={({ isActive }) =>
                          `flex items-start space-x-2.5 p-2.5 rounded-xl text-xs transition-all ${
                            isActive
                              ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/30 font-bold'
                              : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/60'
                          }`
                        }
                      >
                        <Trophy className="w-4 h-4 text-[#B8F044] mt-0.5 shrink-0" />
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-white">Conquistas</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Medalhas e marcos desbloqueados
                          </span>
                        </div>
                      </NavLink>
                    </div>
                  )}
                </div>
              )}

              
              <NavLink
                to="/app/academy"
                className={({ isActive }) =>
                  `flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                    isActive
                      ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/40 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/50'
                  }`
                }
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Academy</span>
              </NavLink>

              
              {!isGuest && (
                <NavLink
                  to="/app/history"
                  className={({ isActive }) =>
                    `flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                      isActive
                        ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/40 shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/50'
                    }`
                  }
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Histórico</span>
                </NavLink>
              )}

              
              {!isGuest && (
                <NavLink
                  to="/app/profile"
                  className={({ isActive }) =>
                    `flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                      isActive
                        ? 'bg-[#1C3A52] text-[#B8F044] border border-[#B8F044]/40 shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-[#1C3A52]/50'
                    }`
                  }
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Perfil</span>
                </NavLink>
              )}
            </nav>

            
            <div className="hidden sm:flex items-center space-x-2 lg:space-x-2.5 shrink-0">
              <ThemeToggle />

              <button
                onClick={() => setShowConnectModal(true)}
                data-testid="btn-connect-mobile-modal"
                className="p-1.5 rounded-xl bg-[#0D1C28] border border-[#1C3A52] hover:border-[#B8F044]/50 text-slate-300 hover:text-[#B8F044] transition-all"
                title="Conectar Celular via QR Code"
              >
                <QrCode className="w-4 h-4" />
              </button>

              {isGuest ? (
                <>
                  <div
                    data-testid="guest-mode-badge"
                    className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-blue-900/40 border border-blue-400 text-blue-200 text-xs font-bold"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                    <span className="hidden sm:inline">VISITANTE</span>
                  </div>

                  <button
                    onClick={handleLogout}
                    data-testid="btn-exit-guest"
                    className="px-3 py-1.5 rounded-xl btn-sport-lime text-xs font-extrabold flex items-center space-x-1.5 transition-all shadow-xs"
                    title="Encerrar sessão visitante e entrar com uma conta"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Entrar</span>
                  </button>
                </>
              ) : (
                <>
                  {isAdmin && (
                    <Link
                      to="/admin/overview"
                      className="px-2.5 py-1 rounded-lg bg-orange-500/20 border border-orange-400/50 text-[#FF7548] hover:bg-orange-500/30 text-xs font-bold flex items-center space-x-1 transition-all"
                      title="Acessar Painel de Controle Administrativo"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Admin</span>
                    </Link>
                  )}

                  <Link
                    to="/app/profile"
                    className="flex items-center space-x-2 px-2.5 py-1 rounded-xl bg-[#0D1C28] border border-[#1C3A52] hover:border-[#B8F044]/50 transition-all"
                    title="Acessar Meu Perfil"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#142B3D] border border-[#B8F044]/60 flex items-center justify-center text-xs shrink-0">
                      {user?.avatar || '🎾'}
                    </div>
                    <span className="text-xs font-bold text-white max-w-[80px] sm:max-w-[100px] truncate">{user?.name}</span>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="p-2 rounded-xl bg-[#0D1C28] border border-[#1C3A52] text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-all"
                    title="Sair da Conta"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            
            <div className="flex lg:hidden items-center space-x-2">
              <ThemeToggle />
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="p-2 rounded-xl bg-[#0D1C28] border border-[#1C3A52] text-slate-300 hover:text-white"
                aria-label="Abrir menu de navegação"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        
        {mobileOpen && (
          <div className="lg:hidden border-b border-[#1C3A52] bg-[#142B3D] p-4 space-y-2 animate-fadeIn">
            
            {!isGuest && (
              <NavLink
                to="/app/dashboard"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                    isActive ? 'bg-[#1C3A52] text-[#B8F044]' : 'text-slate-300 hover:text-white'
                  }`
                }
              >
                <Home className="w-4 h-4" />
                <span>Dashboard</span>
              </NavLink>
            )}

            
            <NavLink
              to="/app/play"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-black ${
                  isActive ? 'bg-[#B8F044] text-[#142B3D]' : 'bg-[#B8F044]/20 text-[#B8F044]'
                }`
              }
            >
              <PlayCircle className="w-4 h-4" />
              <span>Jogar</span>
            </NavLink>

            
            {!isGuest && (
              <div className="space-y-1 pt-1 pb-1">
                <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#B8F044]" />
                  <span>Desempenho</span>
                </div>
                <div className="pl-3 space-y-1 border-l-2 border-[#1C3A52] ml-3">
                  <NavLink
                    to="/app/statistics"
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-bold ${
                        isActive ? 'bg-[#1C3A52] text-[#B8F044]' : 'text-slate-300 hover:text-white'
                      }`
                    }
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Estatísticas</span>
                  </NavLink>
                  <NavLink
                    to="/app/evolution"
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-bold ${
                        isActive ? 'bg-[#1C3A52] text-[#B8F044]' : 'text-slate-300 hover:text-white'
                      }`
                    }
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Evolução</span>
                  </NavLink>
                </div>
              </div>
            )}

            
            <NavLink
              to="/app/academy"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                  isActive ? 'bg-[#1C3A52] text-[#B8F044]' : 'text-slate-300 hover:text-white'
                }`
              }
            >
              <GraduationCap className="w-4 h-4" />
              <span>Academy</span>
            </NavLink>

            
            {!isGuest && (
              <NavLink
                to="/app/history"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                    isActive ? 'bg-[#1C3A52] text-[#B8F044]' : 'text-slate-300 hover:text-white'
                  }`
                }
              >
                <Clock className="w-4 h-4" />
                <span>Histórico</span>
              </NavLink>
            )}

            
            {!isGuest && (
              <NavLink
                to="/app/achievements"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                    isActive ? 'bg-[#1C3A52] text-[#B8F044]' : 'text-slate-300 hover:text-white'
                  }`
                }
              >
                <Trophy className="w-4 h-4" />
                <span>Conquistas</span>
              </NavLink>
            )}

            
            {!isGuest && (
              <NavLink
                to="/app/profile"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-bold ${
                    isActive ? 'bg-[#1C3A52] text-[#B8F044]' : 'text-slate-300 hover:text-white'
                  }`
                }
              >
                <User className="w-4 h-4" />
                <span>Perfil</span>
              </NavLink>
            )}

            <div className="pt-3 border-t border-[#1C3A52] flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                {isGuest ? 'JOGANDO COMO VISITANTE' : user?.name}
              </span>
              <button onClick={handleLogout} className="text-xs text-rose-400 font-bold">
                {isGuest ? 'Entrar com Minha Conta' : 'Sair'}
              </button>
            </div>
          </div>
        )}
      </header>

      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      
      <footer className="border-t border-[#B8C6D0] dark:border-[#344653] py-4 text-center text-xs text-[#475569] dark:text-[#A8BAC8]">
        MOTION TENNIS © 2026 • Plataforma de Treinamento Esportivo e Gamificação
      </footer>

      
      <ConnectMobileModal isOpen={showConnectModal} onClose={() => setShowConnectModal(false)} />
    </div>
  );
}
