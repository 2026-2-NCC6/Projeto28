import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Play, 
  Target, 
  Flame, 
  BarChart2, 
  GitFork, 
  Clock, 
  Zap, 
  Radio, 
  ArrowRight 
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { isCloudOnlyMode } from '../services/appEnvironment';

export default function DashboardPage() {
  const { user } = useAuth();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayerData();
  }, []);

  const loadPlayerData = async () => {
    try {
      const data = await api.getPlayer();
      setPlayer(data);
    } catch (e) {
      console.error('Erro ao carregar atleta:', e);
    } finally {
      setLoading(false);
    }
  };

  const currentXp = player?.xp ?? user?.xp ?? 0;
  const targetXp = player?.xp_next ?? user?.xp_next ?? 250;
  const xpPercent = targetXp > 0 ? Math.min(100, Math.round((currentXp / targetXp) * 100)) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      
      
      <div className="p-6 sm:p-8 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] space-y-6 shadow-sm relative overflow-hidden transition-colors">
        
        
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#2563EB]/5 dark:bg-[#B8F044]/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <span className="text-xs font-mono font-bold tracking-widest text-[#2563EB] dark:text-[#B8F044] uppercase">
              BEM-VINDO DE VOLTA
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#142B3D] dark:text-[#F1F5F9] uppercase tracking-tight">
              OLÁ, {user?.name || player?.name || 'ATLETA'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono">
              <span className="text-xs sm:text-sm font-bold text-[#142B3D] dark:text-[#B8F044] bg-[#E8EDF1] dark:bg-[#18242E] px-2.5 py-0.5 rounded border border-[#B8C6D0] dark:border-[#344653]">
                LV. {player?.level ?? user?.level ?? 1} — {player?.title || user?.title || 'INICIANTE'}
              </span>
              <span className="text-xs text-[#475569] dark:text-[#A8BAC8]">
                • Equipamento {user?.equipment?.name || (isCloudOnlyMode() ? 'Nuvem Supabase' : 'Motion Tennis #001')}
              </span>
            </div>
          </div>

          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border-2 border-[#B8C6D0] dark:border-[#B8F044] flex items-center justify-center text-3xl sm:text-4xl shadow-sm">
            {user?.avatar || player?.avatar || '🎾'}
          </div>
        </div>

        
        <div className="space-y-2 pt-2 relative z-10">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#475569] dark:text-[#A8BAC8] font-bold">PROGRESSO DE EXPERIÊNCIA</span>
            <span className="text-[#2563EB] dark:text-[#B8F044] font-bold">
              {currentXp} / {targetXp} XP ({xpPercent}%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#2563EB] to-[#B8F044] rounded-full transition-all duration-700"
              style={{ width: `${xpPercent}%` }}
            ></div>
          </div>
        </div>

        
        <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-4 border-t border-[#B8C6D0] dark:border-[#344653] font-mono text-center relative z-10">
          <div className="p-3 sm:p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]">
            <span className="text-[10px] sm:text-[11px] text-[#475569] dark:text-[#A8BAC8] block uppercase">Precisão</span>
            <span className="text-xl sm:text-3xl font-black text-[#2563EB] dark:text-[#B8F044] mt-1 block">
              {player?.precision !== undefined ? Math.round(Number(player.precision)) : 0}%
            </span>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]">
            <span className="text-[10px] sm:text-[11px] text-[#475569] dark:text-[#A8BAC8] block uppercase">Treinos</span>
            <span className="text-xl sm:text-3xl font-black text-[#142B3D] dark:text-[#F1F5F9] mt-1 block">
              {player?.trainings_completed ?? player?.total_matches ?? 0}
            </span>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]">
            <span className="text-[10px] sm:text-[11px] text-[#475569] dark:text-[#A8BAC8] block uppercase">Melhor Score</span>
            <span className="text-xl sm:text-3xl font-black text-amber-500 dark:text-amber-400 mt-1 block">
              {player?.best_score || 0} pts
            </span>
          </div>
        </div>

      </div>

      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-mono font-bold tracking-widest text-[#2563EB] dark:text-[#B8F044] uppercase">
            CONTINUAR TREINANDO (SELEÇÃO DE MODOS)
          </h2>
          <Link
            to="/app/play"
            className="text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] hover:text-[#2563EB] dark:hover:text-[#B8F044] flex items-center space-x-1"
          >
            <span>Ir para Arena</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          
          <Link
            to="/app/play?mode=free"
            className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] transition-all hover:-translate-y-1 group shadow-sm hover:shadow-md"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#142B3D] dark:text-[#B8F044] mb-4 group-hover:scale-110 group-hover:border-[#B8F044] transition-all">
              <Play className="w-6 h-6 fill-current" />
            </div>
            <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] transition-colors">
              TREINO LIVRE
            </h3>
            <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1.5 leading-relaxed">
              Realize jogadas sem objetivo específico. Todos os sensores medem seus acertos.
            </p>
          </Link>

          
          <Link
            to="/app/play?mode=single"
            className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] transition-all hover:-translate-y-1 group shadow-sm hover:shadow-md"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#142B3D] dark:text-[#B8F044] mb-4 group-hover:scale-110 group-hover:border-[#B8F044] transition-all">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] transition-colors">
              ALVO ÚNICO
            </h3>
            <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1.5 leading-relaxed">
              Acerte o sensor iluminado em tempo hábil para alternar para o próximo alvo.
            </p>
          </Link>

          
          <Link
            to="/app/play?mode=clear_all"
            className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] transition-all hover:-translate-y-1 group shadow-sm hover:shadow-md"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#142B3D] dark:text-[#B8F044] mb-4 group-hover:scale-110 group-hover:border-[#B8F044] transition-all">
              <Flame className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] transition-colors">
              APAGUE TODOS
            </h3>
            <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1.5 leading-relaxed">
              Desligue todos os sensores. Se acertar um sensor já desligado, ele religa!
            </p>
          </Link>

        </div>
      </div>

      
      <div className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] space-y-4 shadow-sm">
        <h3 className="text-xs font-mono font-bold tracking-widest text-[#475569] dark:text-[#A8BAC8] uppercase">
          ÁREAS DE ACOMPANHAMENTO DO ATLETA
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          <Link
            to="/app/statistics"
            className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] flex items-center justify-between transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <BarChart2 className="w-5 h-5 text-[#2563EB] dark:text-[#B8F044]" />
              <div>
                <h4 className="text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044]">Estatísticas</h4>
                <span className="text-[10px] text-[#475569] dark:text-[#A8BAC8]">6 Atributos & Dicas</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#475569] dark:text-[#A8BAC8] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            to="/app/evolution"
            className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] flex items-center justify-between transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <GitFork className="w-5 h-5 text-[#2563EB] dark:text-[#B8F044]" />
              <div>
                <h4 className="text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044]">Evolução</h4>
                <span className="text-[10px] text-[#475569] dark:text-[#A8BAC8]">Skill Tree do Atleta</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#475569] dark:text-[#A8BAC8] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            to="/app/history"
            className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] flex items-center justify-between transition-colors group"
          >
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-[#2563EB] dark:text-[#B8F044]" />
              <div>
                <h4 className="text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044]">Histórico</h4>
                <span className="text-[10px] text-[#475569] dark:text-[#A8BAC8]">Sessões Anteriores</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#475569] dark:text-[#A8BAC8] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] group-hover:translate-x-0.5 transition-transform" />
          </Link>

        </div>
      </div>

    </div>
  );
}
