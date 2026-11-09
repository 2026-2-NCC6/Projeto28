import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  Trophy,
  Zap,
  Calendar,
  Layers,
  Activity,
  RefreshCw,
  Award,
  Sparkles,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { cloudDataService } from '../../services/cloudDataService';
import { getStoredCloudSession } from '../../services/cloudAuthService';
import { isEquipmentMode } from '../../services/appEnvironment';
import { isNativeMobile } from '../../services/serverConfig';
import MobileVisitorGuard from '../../components/mobile/MobileVisitorGuard';

export default function MobileEvolutionPage() {
  const { isGuest } = useAuth();

  const [period, setPeriod] = useState('all');
  const [profile, setProfile] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [evolutionHistory, setEvolutionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCloudActive, setIsCloudActive] = useState(false);

  useEffect(() => {
    if (isGuest) {
      setLoading(false);
      return;
    }
    loadData();
  }, [isGuest]);

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

        if (overview) {
          setProfile(overview.profile);
          setAttributes(overview.attributes || []);
          setAchievements(overview.achievements || []);
          setEvolutionHistory(overview.evolutionHistory || []);
          setIsCloudActive(true);
          loadedFromCloud = true;
        }
      } catch (cloudErr) {
        console.warn('[MOBILE EVOLUTION] Nuvem inacessível, tentando fallback local:', cloudErr);
      }
    }

    if (!loadedFromCloud && isEquipmentMode() && !isNativeMobile()) {
      try {
        const [playerData, sessData, achData] = await Promise.all([
          api.getPlayer().catch(() => null),
          api.getSessions(50).catch(() => []),
          api.getAchievements().catch(() => ({ achievements: [] }))
        ]);

        if (playerData) setProfile(playerData);
        const sessList = Array.isArray(sessData) ? sessData : [];
        setEvolutionHistory(
          [...sessList].reverse().map((s) => ({
            id: s.id,
            date: s.started_at || s.created_at,
            mode: s.mode,
            score: s.total_score || 0,
            accuracy: Number(s.accuracy || 0),
            shots: s.shots_count || 0,
            hits: s.hits_count || 0,
            xp: s.xp_granted || 0
          }))
        );
        setAchievements(achData.achievements || []);
        setIsCloudActive(false);
      } catch (err) {
        setError(err.message || 'Falha ao carregar evolução do atleta.');
      }
    } else if (!loadedFromCloud) {
      setEvolutionHistory([]);
      setAchievements([]);
      setIsCloudActive(true);
    }

    setLoading(false);
  };

  if (isGuest) {
    return <MobileVisitorGuard featureName="a Evolução e Estatísticas" />;
  }

  const now = Date.now();
  const filteredHistory = evolutionHistory.filter((item) => {
    if (period === 'all' || !item.date) return true;
    const itemTime = new Date(item.date).getTime();
    if (period === '7d') return now - itemTime <= 7 * 86400000;
    if (period === '30d') return now - itemTime <= 30 * 86400000;
    return true;
  });

  const currentXp = profile?.xp || 0;
  const nextXp = profile?.xp_next || 250;
  const xpPct = Math.min(100, Math.max(0, Math.round((currentXp / nextXp) * 100)));

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fadeIn">
      
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-[#39FF88]" />
            <span>Evolução do Atleta</span>
          </h1>
          <p className="text-xs text-[#8C9891]">
            {isCloudActive ? 'Progresso oficial sincronizado na nuvem' : 'Progresso registrado localmente'}
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-xl bg-[#0D1E13] border border-[#163020] text-[#8C9891] hover:text-[#39FF88] transition"
          title="Recarregar evolução"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#39FF88]' : ''}`} />
        </button>
      </div>

      
      <div className="p-5 rounded-3xl bg-gradient-to-br from-[#0D2215] to-[#08120C] border border-[#1C4229] shadow-[0_0_20px_rgba(57,255,136,0.12)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-14 h-14 rounded-2xl bg-[#14301D] border-2 border-[#39FF88]/60 flex items-center justify-center text-xl font-black text-[#39FF88] shadow-[0_0_15px_rgba(57,255,136,0.25)]">
              {profile?.level || 1}
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#39FF88] font-bold">
                NÍVEL {profile?.level || 1}
              </span>
              <h2 className="text-lg font-black text-white leading-tight">
                {profile?.title || 'Iniciante'}
              </h2>
              <span className="text-[11px] text-[#8C9891] font-mono">
                {profile?.total_matches || evolutionHistory.length} partidas disputadas
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-bold text-[#39FF88]">{currentXp} XP</span>
            <span className="text-[10px] text-[#8C9891] block">de {nextXp} XP</span>
          </div>
        </div>

        
        <div className="space-y-1">
          <div className="w-full bg-[#070F0A] h-2.5 rounded-full overflow-hidden border border-[#142A1B] p-0.5">
            <div
              className="bg-gradient-to-r from-[#299E5A] to-[#39FF88] h-full rounded-full transition-all duration-700 shadow-[0_0_8px_#39FF88]"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-[#8C9891]">
            <span>Progresso do Nível</span>
            <span>{xpPct}% concluído</span>
          </div>
        </div>
      </div>

      
      <div className="p-4 rounded-3xl bg-[#09150E] border border-[#163020] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Histórico de Desempenho
            </h3>
          </div>

          
          <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-[#07110B] border border-[#163020]">
            {[
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: 'all', label: 'Tudo' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                  period === p.id
                    ? 'bg-[#14301D] text-[#39FF88]'
                    : 'text-[#8C9891] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length > 0 ? (
          <div className="space-y-2 pt-1">
            
            <div className="flex items-end justify-between h-28 gap-1.5 px-2 pt-3 pb-1 bg-[#060D08] rounded-2xl border border-[#142A1B]">
              {filteredHistory.slice(-8).map((h, i) => {
                const maxScore = Math.max(...filteredHistory.map((x) => x.score || 100), 200);
                const heightPct = Math.max(15, Math.min(100, Math.round((h.score / maxScore) * 100)));
                return (
                  <div key={h.id || i} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <span className="text-[9px] font-mono text-[#39FF88] opacity-0 group-hover:opacity-100 transition">
                      {h.score}
                    </span>
                    <div
                      className="w-full max-w-[28px] bg-gradient-to-t from-[#14301D] to-[#39FF88] rounded-t-md transition-all group-hover:brightness-125"
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[9px] font-mono text-[#8C9891] mt-1">
                      {Number(h.accuracy || 0).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-[#8C9891] px-1">
              <span>← Mais antigas</span>
              <span>Precisão e Pontuação</span>
              <span>Mais recentes →</span>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-[#8C9891] font-mono">
            Nenhum dado registrado no período selecionado.
          </div>
        )}
      </div>

      
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Target className="w-4 h-4 text-[#39FF88]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Atributos Técnicos (6 Dimensões)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {attributes.map((attr) => {
            const attrLevel = attr.level || 1;
            const attrXp = attr.xp || 0;
            const attrNext = attr.xp_next || 1000;
            const pct = Math.min(100, Math.round((attrXp / attrNext) * 100));

            return (
              <div
                key={attr.key || attr.id}
                className="p-3.5 rounded-2xl bg-[#09150E] border border-[#163020] space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white capitalize">{attr.name || attr.key}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#14301D] text-[#39FF88] border border-[#39FF88]/30">
                    LV. {attrLevel}/10
                  </span>
                </div>

                <div className="w-full bg-[#060D08] h-2 rounded-full overflow-hidden border border-[#142A1B]">
                  <div
                    className="bg-[#39FF88] h-full rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex justify-between text-[10px] font-mono text-[#8C9891]">
                  <span>{attrXp} / {attrNext} XP</span>
                  <span>{pct}%</span>
                </div>

                {attr.coach_tip && (
                  <p className="text-[10px] text-[#A2C7AE] bg-[#07110B] p-2 rounded-xl border border-[#142A1B] leading-tight">
                    💡 <strong>Dica:</strong> {attr.coach_tip}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      
      {achievements.length > 0 && (
        <div className="p-4 rounded-3xl bg-[#09150E] border border-[#163020] space-y-3">
          <div className="flex items-center space-x-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Conquistas Desbloqueadas ({achievements.length})
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            {achievements.map((ach) => (
              <div
                key={ach.id || ach.achievement_key}
                className="p-2.5 rounded-xl bg-[#060D08] border border-[#163020] flex items-center space-x-2"
              >
                <span className="text-base">🏆</span>
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-white truncate block capitalize">
                    {ach.achievement_key?.replace(/_/g, ' ') || 'Conquista'}
                  </span>
                  <span className="text-[9px] text-[#39FF88]">Desbloqueada</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
