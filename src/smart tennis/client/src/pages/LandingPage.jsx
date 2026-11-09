import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ArrowRight, 
  Target, 
  Cpu, 
  Activity, 
  TrendingUp, 
  Radio, 
  Wifi, 
  Zap, 
  CheckCircle2, 
  ShieldCheck, 
  LogIn,
  GraduationCap,
  Sparkles,
  Award
} from 'lucide-react';
import CourtTarget from '../components/CourtTarget';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function LandingPage() {
  const navigate = useNavigate();

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#DCE3E8] dark:bg-[#101820] text-[#142B3D] dark:text-[#F1F5F9] selection:bg-[#B8F044] selection:text-[#101820] font-sans transition-colors duration-200">
      
      
      <header className="border-b border-[#1C3A52] dark:border-[#344653] bg-[#142B3D]/95 dark:bg-[#0D1B2A]/95 backdrop-blur sticky top-0 z-50 text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-[#0D1C28] border border-[#B8F044]/50 flex items-center justify-center shadow-[0_2px_10px_rgba(184,240,68,0.25)] transition-transform group-hover:scale-105">
              <svg className="w-5 h-5 text-[#B8F044]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v18" strokeDasharray="2 2" strokeOpacity="0.7" />
                <path d="M3 12h18" strokeDasharray="2 2" strokeOpacity="0.7" />
                <circle cx="12" cy="12" r="2.5" fill="#B8F044" />
              </svg>
            </div>
            <div className="flex flex-col">
              <div className="text-xl font-black tracking-wider leading-none">
                <span className="text-white">MOTION </span>
                <span className="text-[#B8F044]">TENNIS</span>
              </div>
              <span className="text-[9px] text-[#94A3B8] tracking-widest uppercase font-semibold mt-0.5">
                Sports Tech Platform
              </span>
            </div>
          </Link>

          
          <nav className="hidden md:flex items-center space-x-6 text-xs font-bold tracking-wider text-slate-300 uppercase">
            <button onClick={() => scrollTo('produto')} className="hover:text-white hover:text-[#B8F044] transition-colors">
              PRODUTO
            </button>
            <button onClick={() => scrollTo('como-funciona')} className="hover:text-white hover:text-[#B8F044] transition-colors">
              COMO FUNCIONA
            </button>
            <button onClick={() => scrollTo('tecnologia')} className="hover:text-white hover:text-[#B8F044] transition-colors">
              TECNOLOGIA
            </button>
            <button onClick={() => scrollTo('beneficios')} className="hover:text-white hover:text-[#B8F044] transition-colors">
              BENEFÍCIOS
            </button>
            <button onClick={() => scrollTo('sobre')} className="hover:text-white hover:text-[#B8F044] transition-colors">
              SOBRE
            </button>
          </nav>

          
          <div className="flex items-center space-x-2 sm:space-x-3">
            <ThemeToggle />

            <button
              onClick={() => scrollTo('como-funciona')}
              className="hidden lg:inline-flex px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-colors uppercase tracking-wider"
            >
              Conheça o Motion Tennis
            </button>
            <Link
              to="/login"
              className="btn-sport-lime px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold tracking-wider uppercase flex items-center space-x-2 transition-transform active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Acessar Plataforma</span>
            </Link>
          </div>

        </div>
      </header>

      
      <section className="relative pt-16 pb-20 lg:pt-24 lg:pb-32 overflow-hidden bg-gradient-to-b from-[#DCE3E8] via-[#D3DDE3] to-[#C9D4DC] dark:from-[#101820] dark:via-[#18242E] dark:to-[#101820] border-b border-[#B8C6D0] dark:border-[#344653]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              
              <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-xs text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B8F044] border border-[#142B3D] dark:border-[#B8F044] animate-pulse"></span>
                <span className="tracking-wide uppercase">Plataforma Esportiva Interativa</span>
              </div>

              
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-tight text-[#142B3D] dark:text-[#F1F5F9]">
                <span>MOTION </span>
                <span className="text-[#2563EB] dark:text-[#60A5FA]">TENNIS</span>
              </h1>

              <p className="text-2xl sm:text-3xl font-extrabold text-[#142B3D] dark:text-[#F1F5F9] leading-snug font-sport">
                Treine melhor. Acompanhe sua evolução.
              </p>

              <p className="text-base sm:text-lg text-[#475569] dark:text-[#A8BAC8] max-w-xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Transforme cada treino em uma experiência interativa. Desenvolva sua precisão, acompanhe seus resultados e evolua com o Motion Tennis.
              </p>

              
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-3">
                <button
                  onClick={() => scrollTo('como-funciona')}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl btn-sport-outline font-extrabold text-xs tracking-wider uppercase"
                >
                  CONHEÇA O MOTION TENNIS
                </button>
                <Link
                  to="/login"
                  className="w-full sm:w-auto px-7 py-3.5 rounded-xl btn-sport-lime font-black text-xs tracking-wider uppercase flex items-center justify-center space-x-2"
                >
                  <span>ACESSAR PLATAFORMA</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-[#B8C6D0] dark:border-[#344653] max-w-md mx-auto lg:mx-0 text-left">
                <div>
                  <div className="text-lg sm:text-xl font-black font-sport text-[#142B3D] dark:text-[#F1F5F9] leading-tight">INTERATIVO</div>
                  <div className="text-xs text-[#475569] dark:text-[#A8BAC8] font-medium">Treinamento Dinâmico</div>
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-black font-sport text-[#2563EB] dark:text-[#60A5FA] leading-tight">DESEMPENHO</div>
                  <div className="text-xs text-[#475569] dark:text-[#A8BAC8] font-medium">Acompanhamento Real</div>
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-black font-sport text-emerald-600 dark:text-[#B8F044] leading-tight">EVOLUÇÃO</div>
                  <div className="text-xs text-[#475569] dark:text-[#A8BAC8] font-medium">Progresso Esportivo</div>
                </div>
              </div>
            </div>

            
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="relative p-5 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-[0_10px_30px_-5px_rgba(16,24,32,0.15)] w-full max-w-[460px]">
                <div className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-[#142B3D] dark:bg-[#0D1B2A] text-[#B8F044] border border-[#142B3D] dark:border-[#344653] text-[10px] font-bold tracking-wider shadow-sm flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8F044] animate-ping"></span>
                  <span>ALVO MOTION TENNIS</span>
                </div>
                
                <div className="rounded-2xl bg-[#050D07] p-3 border border-[#1B3624] overflow-hidden">
                  <CourtTarget interactive={false} gameMode="single" activeSensorId={5} />
                </div>
                <div className="mt-3 text-center text-xs font-semibold text-[#475569] dark:text-[#A8BAC8]">
                  Seis setores de treinamento interativo
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      
      <section id="produto" className="py-20 bg-[#DCE3E8] dark:bg-[#101820] border-b border-[#B8C6D0] dark:border-[#344653]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs font-black tracking-widest text-[#2563EB] dark:text-[#60A5FA] uppercase">
            EQUIPAMENTO & PLATAFORMA
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#142B3D] dark:text-[#F1F5F9] mt-2 max-w-3xl mx-auto font-sport">
            Físico. Digital. Inteligente.
          </h2>
          <p className="text-sm text-[#475569] dark:text-[#A8BAC8] mt-3 max-w-2xl mx-auto">
            O Motion Tennis une o treino físico na parede esportiva a uma plataforma moderna de análise de dados em tempo real.
          </p>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm hover:shadow-md hover:border-[#B8F044] transition-all space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-500/40 flex items-center justify-center text-[#2563EB] dark:text-[#60A5FA] mb-3">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#142B3D] dark:text-[#F1F5F9]">Treinamento Interativo</h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Prática dinâmica com projeção inteligente de 6 setores que estimulam precisão, regularidade e foco nos golpes.
              </p>
            </div>

            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm hover:shadow-md hover:border-[#B8F044] transition-all space-y-3">
              <div className="w-12 h-12 rounded-xl bg-lime-100 dark:bg-lime-950/60 border border-lime-300 dark:border-lime-500/40 flex items-center justify-center text-[#142B3D] dark:text-[#B8F044] mb-3">
                <Cpu className="w-6 h-6 text-[#142B3D] dark:text-[#B8F044]" />
              </div>
              <h3 className="text-lg font-bold text-[#142B3D] dark:text-[#F1F5F9]">Métricas em Tempo Real</h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Feedback imediato de impacto, pontuação e zonas atingidas para direcionar os ajustes do atleta a cada repetição.
              </p>
            </div>

            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm hover:shadow-md hover:border-[#B8F044] transition-all space-y-3">
              <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-500/40 flex items-center justify-center text-[#FF7548] mb-3">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#142B3D] dark:text-[#F1F5F9]">Evolução Esportiva</h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Acompanhe seu histórico de treinos, evolução técnica de habilidades e conteúdos práticos da Motion Tennis Academy.
              </p>
            </div>
          </div>
        </div>
      </section>

      
      <section id="como-funciona" className="py-24 bg-[#C9D4DC] dark:bg-[#18242E] border-b border-[#B8C6D0] dark:border-[#344653]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-black tracking-widest text-[#142B3D] dark:text-[#F1F5F9] uppercase bg-[#B8C6D0]/60 dark:bg-[#344653] px-3.5 py-1 rounded-full inline-block">
              METODOLOGIA
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#142B3D] dark:text-[#F1F5F9] mt-3 font-sport">
              Como funciona o treinamento
            </h2>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] mt-2 font-medium">
              Da raquete aos dados digitais com feedback imediato
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm hover:shadow-md hover:border-[#B8F044] transition-all space-y-3">
              <span className="text-xs font-black text-[#B8F044] bg-[#142B3D] dark:bg-[#0D1B2A] px-3 py-1.5 rounded-lg inline-block font-mono tracking-wider">
                01
              </span>
              <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] font-sport tracking-wide">JOGUE</h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Desfira seus golpes na parede de treino interativa Motion Tennis.
              </p>
            </div>
            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm hover:shadow-md hover:border-[#B8F044] transition-all space-y-3">
              <span className="text-xs font-black text-[#B8F044] bg-[#142B3D] dark:bg-[#0D1B2A] px-3 py-1.5 rounded-lg inline-block font-mono tracking-wider">
                02
              </span>
              <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] font-sport tracking-wide">ACERTE</h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                O impacto é detectado instantaneamente no setor visual correspondente.
              </p>
            </div>
            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm hover:shadow-md hover:border-[#B8F044] transition-all space-y-3">
              <span className="text-xs font-black text-[#B8F044] bg-[#142B3D] dark:bg-[#0D1B2A] px-3 py-1.5 rounded-lg inline-block font-mono tracking-wider">
                03
              </span>
              <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] font-sport tracking-wide">PONTUE</h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Acompanhe a contagem de pontos, precisão e velocidade a cada repetição.
              </p>
            </div>
            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm hover:shadow-md hover:border-[#B8F044] transition-all space-y-3">
              <span className="text-xs font-black text-[#B8F044] bg-[#142B3D] dark:bg-[#0D1B2A] px-3 py-1.5 rounded-lg inline-block font-mono tracking-wider">
                04
              </span>
              <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] font-sport tracking-wide">EVOLUA</h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Acompanhe suas estatísticas, monitore seu histórico e acesse os treinos técnicos.
              </p>
            </div>
          </div>
        </div>
      </section>

      
      <section id="tecnologia" className="py-20 bg-[#DCE3E8] dark:bg-[#101820] border-b border-[#B8C6D0] dark:border-[#344653]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-black tracking-widest text-[#2563EB] dark:text-[#60A5FA] uppercase">
              INOVAÇÃO
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[#142B3D] dark:text-[#F1F5F9] mt-2 font-sport">
              Tecnologia a Serviço do Esporte
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm space-y-3 hover:border-[#B8F044] transition-all">
              <h3 className="text-lg font-bold text-[#142B3D] dark:text-[#F1F5F9] flex items-center space-x-2">
                <Radio className="w-5 h-5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>Detecção Instantânea</span>
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Estrutura de alta sensibilidade que registra o momento exato do impacto da bola, integrando a batida física aos setores visuais de treinamento.
              </p>
            </div>

            <div className="p-7 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm space-y-3 hover:border-[#B8F044] transition-all">
              <h3 className="text-lg font-bold text-[#142B3D] dark:text-[#F1F5F9] flex items-center space-x-2">
                <Wifi className="w-5 h-5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>Acesso Multidispositivo</span>
              </h3>
              <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                Treine na quadra com o equipamento e acompanhe suas estatísticas, histórico e videoaulas de onde estiver pelo celular ou computador.
              </p>
            </div>
          </div>
        </div>
      </section>

      
      <section id="beneficios" className="py-20 bg-[#C9D4DC] dark:bg-[#18242E] border-b border-[#B8C6D0] dark:border-[#344653]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs font-black tracking-widest text-[#142B3D] dark:text-[#F1F5F9] uppercase">
            RESULTADOS REAIS
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#142B3D] dark:text-[#F1F5F9] mt-2 font-sport">
            Benefícios para Treinadores e Atletas
          </h2>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
            <div className="p-6 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm space-y-2 hover:border-[#B8F044] transition-all">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h4 className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9]">Métricas Claras</h4>
              <p className="text-xs text-[#475569] dark:text-[#A8BAC8]">Acompanhe dados concretos de aproveitamento e precisão para aprimorar seu jogo.</p>
            </div>
            <div className="p-6 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm space-y-2 hover:border-[#B8F044] transition-all">
              <CheckCircle2 className="w-5 h-5 text-[#2563EB] dark:text-[#60A5FA]" />
              <h4 className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9]">Motivação e Metas</h4>
              <p className="text-xs text-[#475569] dark:text-[#A8BAC8]">Atletas mais motivados através de níveis, metas de evolução e desafios estruturados.</p>
            </div>
            <div className="p-6 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm space-y-2 hover:border-[#B8F044] transition-all">
              <CheckCircle2 className="w-5 h-5 text-[#FF7548]" />
              <h4 className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9]">Gestão Esportiva</h4>
              <p className="text-xs text-[#475569] dark:text-[#A8BAC8]">Ambiente prático para academias, clubes e técnicos acompanharem a evolução de atletas.</p>
            </div>
          </div>
        </div>
      </section>

      
      <section id="academy-info" className="py-20 bg-[#142B3D] dark:bg-[#0D1B2A] text-white border-b border-[#1C3A52] dark:border-[#344653]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto p-8 sm:p-10 rounded-3xl bg-[#0D1C28] dark:bg-[#18242E] border border-[#1C3A52] dark:border-[#344653] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 text-center md:text-left">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#142B3D] dark:bg-[#0D1B2A] border border-[#B8F044]/50 text-[#B8F044] text-xs font-bold">
                <GraduationCap className="w-4 h-4" />
                <span>METODOLOGIA DE TREINAMENTO</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-sport">
                Motion Tennis Academy
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 dark:text-[#A8BAC8] leading-relaxed max-w-xl font-normal">
                A Academy integra teoria biomecânica e prática em quadra. Desenvolva seus 6 atributos técnicos — Precisão, Consistência, Potência, Controle, Reação e Estratégia — com videoaulas oficiais disponíveis diretamente na área do atleta no notebook e no celular.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-bold text-[#B8F044]">
                <span className="flex items-center gap-1.5 bg-[#142B3D] dark:bg-[#0D1B2A] px-3 py-1.5 rounded-lg border border-[#1C3A52] dark:border-[#344653]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 6 Módulos Técnicos
                </span>
                <span className="flex items-center gap-1.5 bg-[#142B3D] dark:bg-[#0D1B2A] px-3 py-1.5 rounded-lg border border-[#1C3A52] dark:border-[#344653]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Acesso no Notebook e Celular
                </span>
                <span className="flex items-center gap-1.5 bg-[#142B3D] dark:bg-[#0D1B2A] px-3 py-1.5 rounded-lg border border-[#1C3A52] dark:border-[#344653]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Integrado ao Treino Físico
                </span>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center">
              <Link
                to="/login"
                className="btn-sport-lime px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center space-x-2 transition-transform active:scale-95 shadow-lg"
              >
                <span>Acessar Plataforma</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      
      <section id="sobre" className="py-16 bg-[#DCE3E8] dark:bg-[#101820] border-b border-[#B8C6D0] dark:border-[#344653] text-center">
        <div className="max-w-3xl mx-auto px-4 space-y-4">
          <h3 className="text-2xl font-black text-[#142B3D] dark:text-[#F1F5F9] font-sport">Sobre o Motion Tennis</h3>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
            Desenvolvido para conectar a prática esportiva na quadra ao acompanhamento de evolução técnica do atleta, unindo treinamento interativo e análise de desempenho.
          </p>
          <div className="pt-4">
            <Link
              to="/login"
              className="btn-sport-lime px-8 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider inline-flex items-center space-x-2 shadow-md"
            >
              <span>ACESSAR PLATAFORMA</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      
      <footer className="py-6 bg-[#0D1C28] dark:bg-[#0D1B2A] text-slate-400 dark:text-[#A8BAC8] text-xs text-center border-t border-[#1C3A52] dark:border-[#344653]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>MOTION TENNIS © 2026 • Plataforma Esportiva e Tecnológica</span>
          <Link to="/login" className="text-[#B8F044] hover:underline font-bold">
            Área de Login
          </Link>
        </div>
      </footer>

    </div>
  );
}
