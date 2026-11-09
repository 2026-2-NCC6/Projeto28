import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Radio, 
  Users, 
  Cpu, 
  FileText, 
  GraduationCap, 
  Activity, 
  ArrowLeft, 
  LogOut, 
  ShieldCheck,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ui/ThemeToggle';

class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[AdminErrorBoundary] Erro ao renderizar área:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 rounded-3xl bg-[#08120B] border-2 border-rose-500/50 text-center space-y-4 font-mono text-xs">
          <div className="text-rose-400 font-bold text-base">Falha ao carregar conteúdo desta área</div>
          <p className="text-[#8C9891]">{this.state.error?.message || 'Erro inesperado de renderização.'}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-xl bg-amber-400 text-[#07110B] font-bold uppercase hover:bg-amber-300 transition"
          >
            Tentar Novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/admin/sensors', label: 'Sensores e Parede', icon: Radio },
    { to: '/admin/users', label: 'Contas', icon: Users },
    { to: '/admin/equipments', label: 'Equipamentos', icon: Cpu },
    { to: '/admin/reports', label: 'Relatórios', icon: FileText },
    { to: '/admin/academy', label: 'Academy', icon: GraduationCap },
    { to: '/admin/diagnostic', label: 'Diagnóstico IoT', icon: Activity },
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#DCE3E8] dark:bg-[#101820] text-[#142B3D] dark:text-[#F1F5F9] flex flex-col font-sans transition-colors duration-200">
      
      
      <header className="sticky top-0 z-50 bg-[#142B3D]/95 dark:bg-[#0D1B2A]/98 backdrop-blur border-b border-[#1C3A52] dark:border-[#344653] text-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 gap-2">
            
            
            <div className="flex items-center space-x-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-sm">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="text-sm sm:text-base font-black tracking-wider leading-none">
                  <span className="text-[#F5F7F5]">MOTION TENNIS </span>
                  <span className="text-amber-400">ADMIN</span>
                </div>
                <span className="text-[9px] text-[#8C9891] tracking-widest uppercase font-mono mt-0.5">
                  Painel de Controle
                </span>
              </div>
            </div>

            
            <nav className="hidden lg:flex items-center space-x-1 font-mono">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-amber-400/15 text-amber-400 border border-amber-400/40 font-bold shadow-sm'
                          : 'text-[#8C9891] hover:text-[#F5F7F5] hover:bg-[#0C1A11]'
                      }`
                    }
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            
            <div className="flex items-center space-x-2 shrink-0">
              <ThemeToggle />

              <Link
                to="/app/dashboard"
                data-testid="admin-link-player-area"
                className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#0C1A11] border border-[#1B3624] text-xs font-mono text-[#39FF88] hover:bg-[#39FF88]/10 hover:border-[#39FF88]/40 transition"
                title="Voltar à tela de treinamento esportivo"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="font-bold">Área do Atleta</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                data-testid="admin-btn-logout"
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-[#0C1A11] border border-[#1B3624] text-xs font-mono text-[#8C9891] hover:text-rose-400 hover:border-rose-500/40 transition"
                title="Sair do painel administrativo"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Sair</span>
              </button>

              
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="p-1.5 rounded-xl bg-[#0C1A11] border border-[#1B3624] text-[#8C9891] hover:text-[#F5F7F5] lg:hidden"
                aria-label="Abrir menu administrativo"
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-amber-400" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>
        </div>

        
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#1B3624] bg-[#07110B] px-4 py-3 space-y-1 font-mono animate-fadeIn">
            <div className="text-[10px] text-[#8C9891] uppercase px-2 py-1 font-bold">Menu Administrativo</div>
            <div className="grid grid-cols-2 gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-xl text-xs flex items-center space-x-2 transition ${
                        isActive
                          ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40 font-bold'
                          : 'bg-[#0C1A11] text-[#8C9891] hover:text-[#F5F7F5] border border-[#1B3624]'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
            <div className="pt-2 border-t border-[#1B3624] flex items-center justify-between">
              <Link
                to="/app/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs text-[#39FF88] hover:underline flex items-center space-x-1 py-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar à Área do Jogador</span>
              </Link>
              <button
                onClick={handleLogout}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center space-x-1 py-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Encerrar Sessão</span>
              </button>
            </div>
          </div>
        )}
      </header>

      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AdminErrorBoundary key={location.pathname}>
          <Outlet />
        </AdminErrorBoundary>
      </main>

      <footer className="border-t border-[#B8C6D0] dark:border-[#344653] py-4 text-center text-xs font-mono text-[#475569] dark:text-[#A8BAC8]">
        Motion Tennis Admin • Gestão de Sensores, Equipamentos e Atletas
      </footer>

    </div>
  );
}
