import React, { useState, useEffect } from 'react';
import {
  Clock,
  Filter,
  Trophy,
  Target,
  Zap,
  Activity,
  Layers,
  X,
  RefreshCw,
  Cpu,
  ChevronRight,
  Cloud,
  Calendar,
  Crosshair
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { cloudDataService } from '../../services/cloudDataService';
import { getStoredCloudSession } from '../../services/cloudAuthService';
import { isEquipmentMode } from '../../services/appEnvironment';
import { isNativeMobile } from '../../services/serverConfig';
import MobileVisitorGuard from '../../components/mobile/MobileVisitorGuard';

export default function MobileHistoryPage() {
  const { isGuest } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState('all');
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionShots, setSessionShots] = useState([]);
  const [loadingShots, setLoadingShots] = useState(false);
  const [isCloudActive, setIsCloudActive] = useState(false);

  useEffect(() => {
    if (isGuest) {
      setLoading(false);
      return;
    }
    loadSessions(0, true);
  }, [isGuest, filterMode]);

  const loadSessions = async (offset = 0, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    const cloudSession = getStoredCloudSession();
    let loadedFromCloud = false;

    if (cloudSession?.accessToken) {
      try {
        const modeQuery = filterMode === 'all' ? null : filterMode;
        const res = await cloudDataService.getCloudSessions({
          accessToken: cloudSession.accessToken,
          limit: 15,
          offset,
          mode: modeQuery
        });

        if (offset === 0) {
          setSessions(res.sessions || []);
        } else {
          setSessions((prev) => [...prev, ...(res.sessions || [])]);
        }
        setTotalCount(res.totalCount || 0);
        setIsCloudActive(true);
        loadedFromCloud = true;
      } catch (cloudErr) {
        console.warn('[MOBILE HISTORY] Nuvem inacessível, tentando fallback local:', cloudErr);
      }
    }

    if (!loadedFromCloud && isEquipmentMode() && !isNativeMobile()) {
      try {
        const data = await api.getSessions(50);
        const list = Array.isArray(data) ? data : [];
        const filtered = list.filter((s) => {
          if (filterMode === 'all') return true;
          return (s.mode || '').toLowerCase() === filterMode.toLowerCase();
        });
        setSessions(filtered);
        setTotalCount(filtered.length);
        setIsCloudActive(false);
      } catch (err) {
        setError(err.message || 'Erro ao carregar histórico.');
      }
    } else if (!loadedFromCloud) {
      setSessions([]);
      setTotalCount(0);
      setIsCloudActive(true);
    }

    setLoading(false);
    setLoadingMore(false);
  };

  const handleSelectSession = async (sess) => {
    setSelectedSession(sess);
    setSessionShots([]);

    const cloudSession = getStoredCloudSession();
    if (cloudSession?.accessToken && sess?.id) {
      setLoadingShots(true);
      try {
        const shots = await cloudDataService.getCloudSessionShots({
          accessToken: cloudSession.accessToken,
          sessionId: sess.id
        });
        setSessionShots(Array.isArray(shots) ? shots : []);
      } catch (e) {
        console.warn('Erro ao carregar disparos da sessão:', e);
      } finally {
        setLoadingShots(false);
      }
    }
  };

  const formatModeName = (mode) => {
    if (!mode) return 'Treino Livre';
    switch (mode.toLowerCase()) {
      case 'free': return 'Treino Livre';
      case 'single': return 'Alvo Único';
      case 'clear_all': return 'Limpar Todos';
      default: return mode;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Data não informada';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return dateStr;
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isGuest) {
    return <MobileVisitorGuard featureName="o Histórico de Partidas" />;
  }

  const filterOptions = [
    { id: 'all', label: 'Todos' },
    { id: 'free', label: 'Treino Livre' },
    { id: 'single', label: 'Alvo Único' },
    { id: 'clear_all', label: 'Limpar Todos' }
  ];

  return (
    <div className="p-4 sm:p-5 space-y-4 animate-fadeIn">
      
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center space-x-2">
            <Clock className="w-5 h-5 text-[#39FF88]" />
            <span>Histórico de Partidas</span>
          </h1>
          <p className="text-xs text-[#8C9891]">
            {isCloudActive ? 'Partidas sincronizadas na nuvem Supabase' : 'Partidas do notebook local'}
          </p>
        </div>

        <button
          onClick={() => loadSessions(0, true)}
          disabled={loading || loadingMore}
          className="p-2 rounded-xl bg-[#0D1E13] border border-[#163020] text-[#8C9891] hover:text-[#39FF88] transition"
          title="Recarregar histórico"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#39FF88]' : ''}`} />
        </button>
      </div>

      
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {filterOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setFilterMode(opt.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              filterMode === opt.id
                ? 'bg-[#39FF88] text-slate-950 shadow-[0_0_10px_rgba(57,255,136,0.2)]'
                : 'bg-[#0D1E13] border border-[#163020] text-[#8C9891] hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-2">
          <RefreshCw className="w-6 h-6 text-[#39FF88] animate-spin" />
          <span className="text-xs text-[#8C9891]">Consultando histórico no Supabase...</span>
        </div>
      )}

      
      {error && !loading && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-center space-y-2">
          <p className="text-xs text-rose-200">{error}</p>
          <button
            onClick={() => loadSessions(0, true)}
            className="py-1.5 px-3 rounded-lg bg-slate-800 text-xs font-bold text-white"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      
      {!loading && !error && sessions.length === 0 && (
        <div className="p-8 rounded-3xl bg-[#0A140E] border border-[#142A1B] text-center space-y-3 my-6">
          <Trophy className="w-10 h-10 text-[#8C9891] mx-auto opacity-30" />
          <h3 className="text-sm font-bold text-white">Nenhum treino sincronizado</h3>
          <p className="text-xs text-[#8C9891] max-w-xs mx-auto">
            {filterMode === 'all'
              ? 'Você ainda não possui partidas sincronizadas. Complete um jogo na quadra para ver o histórico aqui!'
              : `Nenhuma partida sincronizada no modo selecionado.`}
          </p>
        </div>
      )}

      
      <div className="space-y-3">
        {sessions.map((sess) => {
          return (
            <div
              key={sess.id}
              onClick={() => handleSelectSession(sess)}
              data-testid={`match-card-${sess.id}`}
              className="p-4 rounded-2xl bg-[#0A140E] hover:bg-[#0F1F16] border border-[#163020] hover:border-[#39FF88]/40 transition cursor-pointer space-y-3 shadow-sm group"
            >
              
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white group-hover:text-[#39FF88] transition">
                      {formatModeName(sess.mode)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#122A1A] text-[#39FF88] border border-[#39FF88]/30">
                      {sess.wall_preset || '3x2'}
                    </span>
                    {sess.xp_granted > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-400/10 text-amber-300 border border-amber-400/30">
                        +{sess.xp_granted} XP
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-[#8C9891] block mt-0.5">
                    {formatDate(sess.started_at || sess.created_at)}
                  </span>
                </div>

                
                <div className="text-right">
                  <span className="text-lg font-black font-mono text-[#39FF88]">
                    {sess.total_score || 0}
                  </span>
                  <span className="text-[10px] text-[#8C9891] block uppercase font-mono">pts</span>
                </div>
              </div>

              
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-[#A2C7AE]">
                <div className="flex items-center space-x-3">
                  <span className="flex items-center space-x-1">
                    <Target className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{Number(sess.accuracy || 0).toFixed(0)}% precisão</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Zap className="w-3.5 h-3.5 text-[#39FF88]" />
                    <span>{sess.hits_count || 0}/{sess.shots_count || 0} hits</span>
                  </span>
                </div>

                <div className="flex items-center space-x-1 text-[#8C9891]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDuration(sess.duration_seconds)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      
      {sessions.length < totalCount && (
        <div className="pt-2 text-center">
          <button
            onClick={() => loadSessions(sessions.length, false)}
            disabled={loadingMore}
            className="w-full py-2.5 rounded-xl bg-[#0D1E13] hover:bg-[#142C1E] border border-[#163020] text-xs font-mono font-bold text-[#39FF88] flex items-center justify-center space-x-2 transition"
          >
            {loadingMore ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Carregando...</span>
              </>
            ) : (
              <span>Carregar Mais Partidas ({sessions.length} de {totalCount})</span>
            )}
          </button>
        </div>
      )}

      
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#0C1A11] border-t sm:border border-[#1E3B26] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#163020]">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-[#39FF88]" />
                <h3 className="text-base font-bold text-white">
                  Detalhes do Treino
                </h3>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-[#8C9891] hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#07110B] border border-[#163020] space-y-0.5">
                <span className="text-[#8C9891] text-[10px] uppercase">Modo de Jogo</span>
                <span className="text-white font-bold block">{formatModeName(selectedSession.mode)}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#07110B] border border-[#163020] space-y-0.5">
                <span className="text-[#8C9891] text-[10px] uppercase">Pontuação Total</span>
                <span className="text-[#39FF88] font-bold text-sm block">{selectedSession.total_score || 0} pts</span>
              </div>
              <div className="p-3 rounded-xl bg-[#07110B] border border-[#163020] space-y-0.5">
                <span className="text-[#8C9891] text-[10px] uppercase">Precisão dos Tiros</span>
                <span className="text-emerald-400 font-bold block">{Number(selectedSession.accuracy || 0).toFixed(1)}%</span>
              </div>
              <div className="p-3 rounded-xl bg-[#07110B] border border-[#163020] space-y-0.5">
                <span className="text-[#8C9891] text-[10px] uppercase">Acertos / Total</span>
                <span className="text-white font-bold block">{selectedSession.hits_count || 0} / {selectedSession.shots_count || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#07110B] border border-[#163020] space-y-0.5">
                <span className="text-[#8C9891] text-[10px] uppercase">Duração</span>
                <span className="text-white font-bold block">{formatDuration(selectedSession.duration_seconds)}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#07110B] border border-[#163020] space-y-0.5">
                <span className="text-[#8C9891] text-[10px] uppercase">XP Ganho</span>
                <span className="text-amber-300 font-bold block">+{selectedSession.xp_granted || 0} XP</span>
              </div>
            </div>

            
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-[#39FF88] uppercase tracking-wider block flex items-center space-x-1.5">
                <Crosshair className="w-3.5 h-3.5" />
                <span>Telemetria de Impactos ({sessionShots.length || selectedSession.shots_count || 0})</span>
              </span>

              {loadingShots ? (
                <div className="p-4 rounded-xl bg-[#07110B] border border-[#163020] text-center space-y-2">
                  <RefreshCw className="w-4 h-4 text-[#39FF88] animate-spin mx-auto" />
                  <span className="text-[11px] font-mono text-[#8C9891]">Carregando impactos do Supabase...</span>
                </div>
              ) : sessionShots.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                  {sessionShots.map((sh, idx) => (
                    <div
                      key={sh.id || idx}
                      className="p-2 rounded-lg bg-[#07110B] border border-[#142A1B] flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-5 text-[#8C9891]">#{idx + 1}</span>
                        <span className={sh.is_hit ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                          {sh.is_hit ? (sh.is_bullseye ? '🎯 Na Mosca' : '✔ Acerto') : '✖ Erro'}
                        </span>
                        {sh.sector_id && (
                          <span className="text-[10px] text-[#8C9891]">Setor {sh.sector_id}</span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3">
                        {sh.force_kmh && (
                          <span className="text-[#8C9891]">{Math.round(sh.force_kmh)} km/h</span>
                        )}
                        <span className="text-[#39FF88] font-bold">+{sh.score || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#07110B] border border-[#163020] text-center text-[11px] text-[#8C9891] font-mono">
                  Sessão compacta sincronizada com sucesso.
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedSession(null)}
              className="w-full py-2.5 rounded-xl bg-[#142A1B] hover:bg-[#1A3824] text-white text-xs font-bold font-mono transition"
            >
              Fechar Detalhes
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
