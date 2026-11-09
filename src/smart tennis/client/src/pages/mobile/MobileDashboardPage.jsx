import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  Target,
  Flame,
  PlayCircle,
  TrendingUp,
  ArrowRight,
  Clock,
  Radio,
  Zap,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Cloud,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { cloudDataService } from '../../services/cloudDataService';
import { getStoredCloudSession } from '../../services/cloudAuthService';
import { isEquipmentMode, isCloudOnlyMode } from '../../services/appEnvironment';
import { isNativeMobile } from '../../services/serverConfig';
import MobileVisitorGuard from '../../components/mobile/MobileVisitorGuard';

export default function MobileDashboardPage() {
  const { user, isGuest } = useAuth();
  const navigate = useNavigate();

  const [player, setPlayer] = useState(null);
  const [latestSession, setLatestSession] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [bestScore, setBestScore] = useState(0);
  const [isCloudActive, setIsCloudActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isGuest) {
      setLoading(false);
      return;
    }
    loadData();
  }, [isGuest, user?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const cloudSession = getStoredCloudSession();
    let loadedFromCloud = false;

    if (cloudSession?.accessToken) {
      try {
        const overview = await cloudDataService.getCloudAthleteOverview({
          accessToken: cloudSession.accessToken
        });

        if (overview?.profile) {
          setPlayer({
            name: overview.profile.display_name || user?.name || 'Atleta',
            avatar: overview.profile.avatar || user?.avatar || '🎾',
            level: overview.profile.level || 1,
            xp: overview.profile.xp || 0,
            xp_next: overview.profile.xp_next || 250,
            title: overview.profile.title || 'Iniciante',
            precision: overview.profile.overall_accuracy !== undefined ? Number(overview.profile.overall_accuracy) : 0,
            total_shots: overview.profile.total_shots || 0,
            total_hits: overview.profile.total_hits || 0,
            total_matches: overview.profile.total_matches || (overview.recentSessions?.length || 0),
            best_streak: overview.profile.best_streak || 0,
            last_synced_at: overview.profile.last_synced_at
          });
          setLatestSession(overview.latestSession);
          setRecentSessions(overview.recentSessions || []);
          setBestScore(overview.bestScore || 0);
          setIsCloudActive(true);
          loadedFromCloud = true;
        }
      } catch (cloudErr) {
        console.warn('[MOBILE DASHBOARD] Nuvem inacessível, tentando fallback local:', cloudErr);
      }
    }

    if (!loadedFromCloud && isEquipmentMode() && !isNativeMobile()) {
      try {
        const [playerData, sessionsData] = await Promise.all([
          api.getPlayer().catch(() => null),
          api.getSessions(5).catch(() => [])
        ]);

        if (playerData) {
          setPlayer(playerData);
          setBestScore(playerData.best_score || 0);
        } else if (user) {
          setPlayer(user);
        }

        const sess = Array.isArray(sessionsData) ? sessionsData : [];
        setRecentSessions(sess);
        if (sess.length > 0) {
          setLatestSession(sess[0]);
        }
        setIsCloudActive(false);
      } catch (err) {
        console.warn('Erro ao carregar dashboard local:', err);
      }
    } else if (!loadedFromCloud && user) {
      setPlayer({
        name: user.name || 'Atleta',
        level: user.level || 1,
        xp: user.xp || 0,
        xp_next: user.xp_next || 250,
        title: user.title || 'Tenista em Evolução'
      });
      setIsCloudActive(true);
    }

    setLoading(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  };

  const formatDuration = (sec) => {
    if (!sec && sec !== 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isGuest) {
    return <MobileVisitorGuard featureName="o Painel Geral" />;
  }

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <RefreshCw className="w-8 h-8 text-[#39FF88] animate-spin" />
        <span className="text-xs text-[#8C9891] font-mono">Consultando métricas do atleta na nuvem...</span>
      </div>
    );
  }

  if (error && !player) {
    return (
      <div className="p-6 space-y-4">
        <div className="p-5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">Não foi possível carregar os dados</h3>
          <p className="text-xs text-rose-200">{error}</p>
          <button
            onClick={loadData}
            className="py-2 px-4 rounded-xl bg-slate-800 text-xs font-bold text-white hover:bg-slate-700 transition"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const currentXp = player?.xp || 0;
  const nextXp = player?.xp_next || 250;
  const xpPct = Math.min(100, Math.max(0, Math.round((currentXp / nextXp) * 100)));
  const xpRemaining = Math.max(0, nextXp - currentXp);

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fadeIn">
      
      
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase text-[#8C9891] tracking-wider block">
            {getGreeting()},
          </span>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>{player?.name || user?.name || 'Atleta'}</span>
            <span className="text-xl">{player?.avatar || '🎾'}</span>
          </h1>
        </div>

        
        <div
          data-testid="dashboard-cloud-pill"
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold border transition ${
            isCloudActive
              ? 'bg-cyan-950/50 border-cyan-400/40 text-cyan-300'
              : 'bg-[#0D1E13] border-[#39FF88]/40 text-[#39FF88]'
          }`}
        >
          {isCloudActive ? (
            <>
              <Cloud className="w-3.5 h-3.5 text-cyan-400" />
              <span>NUVEM ATIVA</span>
            </>
          ) : (
            <>
              <Radio className="w-3.5 h-3.5 text-[#39FF88] animate-pulse" />
              <span>QUADRA LOCAL</span>
            </>
          )}
        </div>
      </div>

      
      <div className="p-5 rounded-3xl bg-gradient-to-br from-[#0D2215] to-[#08120C] border border-[#1C4229] shadow-[0_0_20px_rgba(57,255,136,0.12)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-[#14301D] border border-[#39FF88]/50 flex items-center justify-center text-base font-black text-[#39FF88] shadow-[0_0_12px_rgba(57,255,136,0.25)]">
              {player?.level || 1}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#39FF88] font-bold">
                  NÍVEL {player?.level || 1}
                </span>
              </div>
              <h3 className="text-base font-bold text-white leading-tight">
                {player?.title || 'Tenista em Evolução'}
              </h3>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-bold text-[#39FF88]">{xpPct}%</span>
            <span className="text-[10px] text-[#8C9891] block">concluído</span>
          </div>
        </div>

        
        <div className="space-y-1.5">
          <div className="w-full bg-[#070F0A] h-2.5 rounded-full overflow-hidden border border-[#142A1B] p-0.5">
            <div
              className="bg-gradient-to-r from-[#299E5A] to-[#39FF88] h-full rounded-full transition-all duration-700 shadow-[0_0_8px_#39FF88]"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#8C9891]">
            <span>{currentXp} XP</span>
            <span>Faltam {xpRemaining} XP para o LV. {(player?.level || 1) + 1}</span>
            <span>{nextXp} XP</span>
          </div>
        </div>
      </div>

      
      {latestSession ? (
        <div
          data-testid="dashboard-latest-session"
          onClick={() => navigate('/mobile/history')}
          className="p-4 rounded-3xl bg-[#09150E] hover:bg-[#0E1F15] border border-[#163020] hover:border-[#39FF88]/40 transition cursor-pointer space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-[#39FF88] font-bold tracking-wider flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-[#39FF88]" />
              <span>Última Partida Sincronizada</span>
            </span>
            <span className="text-[10px] font-mono text-[#8C9891]">
              {formatDate(latestSession.started_at || latestSession.created_at)}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="text-sm font-bold text-white block capitalize">
                {latestSession.mode === 'free' ? 'Treino Livre' : latestSession.mode === 'single' ? 'Alvo Único' : latestSession.mode === 'clear_all' ? 'Limpar Todos' : (latestSession.mode || 'Partida')}
              </span>
              <span className="text-[11px] font-mono text-[#8C9891]">
                Duração: {formatDuration(latestSession.duration_seconds)} • Parede: {latestSession.wall_preset || '3x2'}
              </span>
            </div>

            <div className="text-right">
              <span className="text-xl font-black font-mono text-[#39FF88] block">
                {latestSession.total_score || 0}
              </span>
              <span className="text-[10px] font-mono text-emerald-400">
                {Number(latestSession.accuracy || 0).toFixed(0)}% precisão
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-3xl bg-[#09150E] border border-[#163020] text-center space-y-2">
          <Clock className="w-6 h-6 text-[#8C9891] mx-auto opacity-50" />
          <p className="text-xs text-[#8C9891]">Nenhuma partida sincronizada na nuvem ainda.</p>
        </div>
      )}

      
      <div className="grid grid-cols-2 gap-3">
        
        <div className="p-4 rounded-2xl bg-[#0B1710] border border-[#163020] space-y-1">
          <div className="flex items-center justify-between text-[#8C9891]">
            <span className="text-[10px] font-mono uppercase">Partidas</span>
            <Trophy className="w-4 h-4 text-[#39FF88]" />
          </div>
          <div className="text-xl font-black text-white font-mono">
            {player?.total_matches || recentSessions.length || 0}
          </div>
          <span className="text-[10px] text-[#6E8175] block">sincronizadas</span>
        </div>

        
        <div className="p-4 rounded-2xl bg-[#0B1710] border border-[#163020] space-y-1">
          <div className="flex items-center justify-between text-[#8C9891]">
            <span className="text-[10px] font-mono uppercase">Precisão</span>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-white font-mono">
            {player?.precision !== undefined ? `${player.precision}%` : 'N/A'}
          </div>
          <span className="text-[10px] text-[#6E8175] block">média da carreira</span>
        </div>

        
        <div className="p-4 rounded-2xl bg-[#0B1710] border border-[#163020] space-y-1">
          <div className="flex items-center justify-between text-[#8C9891]">
            <span className="text-[10px] font-mono uppercase">Recorde</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-white font-mono">
            {bestScore || player?.best_score || 0}
          </div>
          <span className="text-[10px] text-[#6E8175] block">melhor pontuação</span>
        </div>

        
        <div className="p-4 rounded-2xl bg-[#0B1710] border border-[#163020] space-y-1">
          <div className="flex items-center justify-between text-[#8C9891]">
            <span className="text-[10px] font-mono uppercase">Impactos</span>
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-black text-white font-mono">
            {player?.total_shots || 0}
          </div>
          <span className="text-[10px] text-[#6E8175] block">{player?.total_hits || 0} acertos</span>
        </div>
      </div>

      
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={() => navigate('/mobile/history')}
          className="p-3.5 rounded-2xl bg-[#0E2015] hover:bg-[#142C1E] border border-[#1F452C] text-left transition space-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Ver Histórico</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#39FF88]" />
          </div>
          <span className="text-[10px] text-[#8C9891] block">Partidas e telemetria</span>
        </button>

        <button
          onClick={() => navigate('/mobile/evolution')}
          className="p-3.5 rounded-2xl bg-[#0E2015] hover:bg-[#142C1E] border border-[#1F452C] text-left transition space-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Evolução</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#39FF88]" />
          </div>
          <span className="text-[10px] text-[#8C9891] block">6 atributos e conquistas</span>
        </button>
      </div>

    </div>
  );
}
