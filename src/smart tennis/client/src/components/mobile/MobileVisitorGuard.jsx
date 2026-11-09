import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, LogIn, GraduationCap, Wifi, Sparkles } from 'lucide-react';

export default function MobileVisitorGuard({ featureName = 'esta área' }) {
  const navigate = useNavigate();

  return (
    <div className="p-6 text-center space-y-5 my-8">
      <div className="w-16 h-16 mx-auto rounded-3xl bg-cyan-950/40 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
        <Sparkles className="w-8 h-8" />
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] font-mono uppercase tracking-widest text-cyan-400 font-bold block">
          Modo Visitante
        </span>
        <h2 className="text-xl font-black text-white uppercase tracking-tight">
          Acesso Exclusivo para Atletas
        </h2>
        <p className="text-xs text-[#8C9891] max-w-xs mx-auto leading-relaxed">
          O histórico pessoal, evolução de precisão, progressão de nível e conquistas são salvos individualmente para jogadores cadastrados.
        </p>
      </div>

      <div className="space-y-2.5 pt-2 max-w-xs mx-auto">
        <button
          onClick={() => navigate('/login')}
          data-testid="btn-visitor-login"
          className="w-full py-3 px-4 rounded-2xl bg-[#39FF88] hover:bg-[#2fe677] text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-[0_0_15px_rgba(57,255,136,0.25)] transition"
        >
          <LogIn className="w-4 h-4" />
          <span>Entrar com Minha Conta</span>
        </button>

        <button
          onClick={() => navigate('/mobile/academy')}
          data-testid="btn-visitor-academy"
          className="w-full py-3 px-4 rounded-2xl bg-[#0D1E13] hover:bg-[#132A1B] border border-[#1E3B26] text-[#39FF88] font-bold text-xs flex items-center justify-center space-x-2 transition"
        >
          <GraduationCap className="w-4 h-4" />
          <span>Acessar Academy Gratuita</span>
        </button>

        <button
          onClick={() => navigate('/mobile/connect')}
          className="w-full py-2 px-4 rounded-xl bg-transparent text-[#8C9891] hover:text-white text-[11px] font-mono flex items-center justify-center space-x-1.5 transition"
        >
          <Wifi className="w-3.5 h-3.5" />
          <span>Configurações do Servidor</span>
        </button>
      </div>
    </div>
  );
}
