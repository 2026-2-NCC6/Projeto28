import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, Zap, Target, Play, Square, Maximize, Minimize, Volume2, VolumeX,
  Timer, CheckCircle2, AlertCircle, Store, RotateCcw, Sparkles, LogIn
} from 'lucide-react';
import CourtTarget from '../components/CourtTarget';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { playBallHit, playBullseye, playMiss, isSoundEnabled, setSoundEnabled } from '../services/sound';

const DISMISS_KEY = 'smart_tennis_dismissed_experience';

const FEEDBACK = {
  NEUTRAL_AREA: 'Espaço entre alvos — sem pontos.',
  WRONG_SECTOR: 'Alvo apagado! Acerte o alvo aceso.',
  REACTIVATED: 'Atenção: o alvo foi REACENDIDO!',
  INTERVAL_BLOCKED: 'Intervalo: impactos não são contabilizados.',
  PREPARING_BLOCKED: 'Preparação em andamento: aguarde o JÁ! para iniciar.',
  OUT_OF_BOUNDS: 'Impacto fora da parede.',
  EXPERIENCE_ENDED: 'A experiência já terminou.',
  WIN: 'DESAFIO CONCLUÍDO! Todos os alvos foram apagados.'
};

function fmt(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function fmtSec(sec) {
  const s = Math.max(0, Math.round(Number(sec || 0)));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const STATUS_LABEL = {
  COMPLETED: 'Concluída',
  WON: 'Desafio Concluído',
  INTERRUPTED: 'Interrompida',
  IN_PROGRESS: 'Em andamento'
};

function Summary({ data, onNew, onClose, canStartNew, isGuest, onExitGuest }) {
  const rounds = [0, 1, 2].map((i) => data.results.find((r) => r.roundIndex === i) || null);
  const names = ['Treino Livre', 'Liga Um por Vez', 'Apagar Todos'];
  const clearAllRound = rounds[2];
  const totalReactivations = rounds.reduce((acc, r) => acc + (r?.reactivations || 0), 0);

  return (
    <div data-testid="shopping-summary-panel" className="max-w-2xl mx-auto p-6 sm:p-7 rounded-2xl bg-[#0A160E] border border-[#1B3624] shadow-2xl space-y-5">
      <div className="flex items-center justify-between border-b border-[#16291C] pb-4">
        <div>
          <div className="text-[10px] font-mono text-[#39FF88] uppercase tracking-widest">
            Modo Shopping • {isGuest ? 'Resultado Temporário (Visitante)' : 'Resultado Oficial'}
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#F5F7F5] uppercase tracking-tight mt-0.5">
            {data.endReason === 'WON'
              ? 'DESAFIO CONCLUÍDO'
              : data.state === 'INTERRUPTED'
                ? 'EXPERIÊNCIA INTERROMPIDA'
                : 'EXPERIÊNCIA CONCLUÍDA'}
          </h2>
          {isGuest && (
            <p className="text-xs font-mono text-cyan-300 mt-1">
              Sessão Visitante: resultado temporário sem gravação no histórico pessoal ou XP.
            </p>
          )}
        </div>
        <div className="px-3 py-1 rounded-lg bg-[#102216] border border-[#39FF88]/30 text-[#39FF88] text-xs font-mono font-bold">
          {fmtSec(data.totals?.durationSeconds || 0)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
        <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C]">
          <div className="text-[10px] text-[#8C9891] uppercase">Tempo</div>
          <div className="text-lg font-black text-[#F5F7F5] mt-0.5">
            {fmtSec(clearAllRound?.durationSeconds || data.totals?.durationSeconds || 0)}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C]">
          <div className="text-[10px] text-[#8C9891] uppercase">Pontuação</div>
          <div className="text-lg font-black text-[#39FF88] mt-0.5">{data.totals.score}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C]">
          <div className="text-[10px] text-[#8C9891] uppercase">Golpes</div>
          <div className="text-lg font-black text-[#F5F7F5] mt-0.5">{data.totals.shots}</div>
        </div>
        <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C]">
          <div className="text-[10px] text-[#8C9891] uppercase">Reativações</div>
          <div className="text-lg font-black text-amber-400 mt-0.5">{totalReactivations}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-mono text-[#8C9891] uppercase tracking-wider">Desempenho por rodada</div>
        {rounds.map((r, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2 p-3 rounded-xl bg-[#08130C] border border-[#16291C] font-mono text-xs">
            <div className="col-span-5 font-bold text-[#F5F7F5]">{i + 1}. {names[i]}</div>
            {r ? (
              <>
                <div className="col-span-2 text-[#39FF88] font-black text-right">{r.score} pts</div>
                <div className="col-span-3 text-[#8C9891] text-right">{r.hits}/{r.shots} ({fmtSec(r.durationSeconds)})</div>
                <div className="col-span-2 text-right text-[#8C9891]">{STATUS_LABEL[r.status] || r.status}</div>
              </>
            ) : (
              <div className="col-span-7 text-right text-[#8C9891]">Não realizada</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-end pt-2 border-t border-[#16291C]">
        {isGuest && (
          <button
            onClick={onExitGuest}
            className="px-5 py-2.5 rounded-xl bg-[#08130C] border border-cyan-400/40 text-cyan-300 hover:bg-[#102216] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <LogIn size={14} /> Entrar com Minha Conta
          </button>
        )}
        {canStartNew && (
          <button onClick={onNew} className="px-5 py-2.5 rounded-xl bg-[#102216] border border-[#39FF88]/40 text-[#39FF88] hover:bg-[#163020] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2">
            <RotateCcw size={14} /> Liberar Nova Experiência
          </button>
        )}
        <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-[#39FF88] hover:bg-[#2fe677] text-[#07110B] font-black text-xs uppercase tracking-wider">
          FINALIZAR
        </button>
      </div>
    </div>
  );
}

export default function ShoppingExperience() {
  const { user, isGuest, exitGuest } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [installation, setInstallation] = useState(null);
  const [exp, setExp] = useState(null);
  const [last, setLast] = useState(null);
  const [busyElsewhere, setBusyElsewhere] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY));
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [lastImpact, setLastImpact] = useState(null);
  const [lastHitSector, setLastHitSector] = useState(null);
  const [feedback, setFeedback] = useState('Aguardando o início da rodada');

  const offsetRef = useRef(0);
  const versionRef = useRef({ id: null, v: -1 });
  const lastRefreshRef = useRef(0);

  const applyState = useCallback((state) => {
    if (!state) return;
    const ref = versionRef.current;
    if (ref.id === state.id && state.version < ref.v) return;
    versionRef.current = { id: state.id, v: state.version };
    offsetRef.current = state.serverNow - Date.now();
    const isRunning = state.state === 'PREPARING' || state.state === 'ACTIVE';
    setExp(isRunning ? state : null);
    if (!isRunning) setLast(state);
  }, []);

  const refresh = useCallback(async () => {
    lastRefreshRef.current = Date.now();
    try {
      const data = await api.experience.getCurrent();
      setInstallation(data.installation);
      setBusyElsewhere(Boolean(data.busy));
      offsetRef.current = data.serverNow - Date.now();
      if (data.experience) {
        applyState(data.experience);
      } else {
        setExp(null);
        versionRef.current = { id: null, v: -1 };
        setLast(data.last || null);
      }
      setError(null);
    } catch (err) {
      setError(err.message || 'Falha ao consultar o servidor.');
    } finally {
      setLoading(false);
    }
  }, [applyState]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!exp) return undefined;
    const poll = setInterval(refresh, 500);
    return () => clearInterval(poll);
  }, [exp?.id, refresh]);

  const serverNow = now + offsetRef.current;
  const isPreparing = exp?.state === 'PREPARING' || exp?.stage?.type === 'preparing';

  const prepRemainingMs = isPreparing && exp ? Math.max(0, exp.stage.endsAt - serverNow) : 0;
  const prepRemainingSeconds = Math.ceil(prepRemainingMs / 1000);

  const msSinceRound1Start = exp && exp.stage.index === 0 && exp.stage.type === 'round'
    ? serverNow - exp.stage.startedAt
    : -1;
  const showGoBanner = Boolean(exp && exp.stage.index === 0 && exp.stage.type === 'round' && msSinceRound1Start >= 0 && msSinceRound1Start < 700);
  const showCountdownOverlay = (isPreparing && prepRemainingMs > 0) || showGoBanner;
  const countdownText = showGoBanner
    ? 'JÁ!'
    : String(Math.max(1, Math.min(5, prepRemainingSeconds)));

  const remainingMs = exp
    ? isPreparing
      ? (exp.roundSeconds || 120) * 1000
      : Math.max(0, exp.stage.endsAt - serverNow)
    : 0;

  useEffect(() => {
    if (exp && ((isPreparing && prepRemainingMs <= 0) || (!isPreparing && remainingMs <= 0)) && Date.now() - lastRefreshRef.current > 200) {
      refresh();
    }
  }, [exp, isPreparing, prepRemainingMs, remainingMs, refresh]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await api.experience.start();
      localStorage.removeItem(DISMISS_KEY);
      setDismissed(null);
      setLast(null);
      versionRef.current = { id: null, v: -1 };
      applyState(res.experience);
      setFeedback('Prepare-se! A 1ª rodada começará após a contagem de 5 segundos.');
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const handleAbort = async () => {
    if (!exp) return;
    if (!window.confirm('Interromper a experiência Shopping? O cronômetro não poderá ser reiniciado.')) return;
    try {
      const res = await api.experience.abort(exp.id);
      applyState(res.experience);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExitGuest = async () => {
    await exitGuest();
    navigate('/login');
  };

  const handleWallHit = (hitData) => {
    if (!exp || isPreparing || showCountdownOverlay || exp.stage.type !== 'round' || remainingMs <= 0) return;
    const { x, y } = hitData;
    setLastImpact({ x, y, hit: hitData.hit !== false });
    const clientEventId = `shop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    api.experience.sendImpact(exp.id, { x, y, client_event_id: clientEventId })
      .then((res) => {
        applyState(res.state);
        if (res.accepted) {
          setLastHitSector(res.hit ? res.sectorId : null);
          if (res.won) { playBullseye(); setFeedback(FEEDBACK.WIN); }
          else if (res.hit) { playBallHit(88); setFeedback(`Alvo ${res.sectorId} atingido! +${res.points}`); }
          else { playMiss(); setFeedback(FEEDBACK[res.reason] || 'Sem pontos.'); }
        } else if (res.reason) {
          setFeedback(FEEDBACK[res.reason] || 'Impacto não contabilizado.');
          if (res.reason === 'INTERVAL_BLOCKED' || res.reason === 'PREPARING_BLOCKED') refresh();
        }
      })
      .catch((err) => setError(err.message));
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const toggleSound = () => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); };

  if (loading) {
    return <div className="p-12 text-center text-xs font-mono text-[#39FF88] animate-pulse">Carregando Modo Shopping...</div>;
  }

  const isRoundOrPreparing = exp && (exp.stage.type === 'round' || isPreparing);
  const roundNumber = exp ? (isPreparing ? 1 : Math.floor(exp.stage.index / 2) + 1) : 0;
  const progressPct = exp && !isPreparing
    ? Math.min(100, (1 - remainingMs / (exp.stage.plannedSeconds * 1000)) * 100)
    : 0;

  return (
    <div ref={containerRef} className={`space-y-4 max-w-6xl mx-auto ${isFullscreen ? 'p-4 bg-[#050D07] min-h-screen' : ''}`}>
      {isGuest && !isFullscreen && (
        <div
          data-testid="guest-shopping-banner"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-cyan-950/30 border border-cyan-400/40 text-xs font-mono"
        >
          <div className="flex items-center space-x-2 text-cyan-300 font-bold">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>JOGANDO COMO VISITANTE • Experiência comercial com resultado temporário</span>
          </div>
          <button
            onClick={handleExitGuest}
            className="text-cyan-300 hover:text-[#39FF88] underline underline-offset-2 font-bold self-start sm:self-center"
          >
            Sair do Modo Visitante e Entrar com Minha Conta
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-xs font-mono">
          <AlertCircle size={15} /> <span>{error}</span>
        </div>
      )}

      
      {exp && (
        <>
          <div className="p-4 rounded-2xl bg-[#09150E] border border-[#16C96B]/30 shadow-lg space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono text-[#39FF88] uppercase tracking-widest flex items-center gap-1.5">
                  <Store size={12} /> Modo Shopping • Experiência comercial {isGuest ? '(Visitante)' : ''}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-[#F5F7F5] uppercase">
                  {isPreparing
                    ? `Preparando Rodada 1 de 3 — ${exp.stage.gameName}`
                    : isRoundOrPreparing
                      ? `Rodada ${roundNumber} de 3 — ${exp.stage.gameName}`
                      : `Intervalo — próximo: ${exp.stage.nextGameName}`}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <div
                  data-testid="shopping-timer-display"
                  className={`px-5 py-2 rounded-xl border-2 font-mono font-black text-2xl sm:text-3xl tracking-wider ${isRoundOrPreparing ? 'border-[#39FF88] text-[#39FF88]' : 'border-amber-400 text-amber-400'}`}
                >
                  TEMPO RESTANTE: {fmt(remainingMs)}
                </div>
                <button onClick={toggleSound} title="Som" className="p-3 rounded-xl bg-[#08130C] border border-[#16291C] text-[#8C9891]">
                  {soundOn ? <Volume2 size={18} className="text-[#39FF88]" /> : <VolumeX size={18} />}
                </button>
                <button onClick={toggleFullscreen} title="Tela cheia" className="p-3 rounded-xl bg-[#16291C] border border-[#16C96B]/40 text-[#39FF88]">
                  {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
                {!isGuest && (
                  <button onClick={handleAbort} title="Interromper experiência" className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-400">
                    <Square size={18} />
                  </button>
                )}
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-[#07110B] border border-[#1B3624] overflow-hidden">
              <div className={`h-full transition-all duration-200 ${isRoundOrPreparing ? 'bg-[#39FF88]' : 'bg-amber-400'}`} style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {isRoundOrPreparing ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C] flex items-center space-x-3">
                  <Trophy className="w-5 h-5 text-[#39FF88]" />
                  <div><div className="text-[10px] text-[#8C9891] uppercase font-mono">Pontos (rodada)</div>
                    <div data-testid="shopping-round-score" className="text-lg font-black font-mono text-[#39FF88]">{exp.round?.score ?? 0}</div></div>
                </div>
                <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C] flex items-center space-x-3">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <div><div className="text-[10px] text-[#8C9891] uppercase font-mono">Golpes</div>
                    <div className="text-lg font-black font-mono text-[#F5F7F5]">{exp.round?.shots ?? 0}</div></div>
                </div>
                <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C] flex items-center space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-[#39FF88]" />
                  <div><div className="text-[10px] text-[#8C9891] uppercase font-mono">Acertos</div>
                    <div className="text-lg font-black font-mono text-[#F5F7F5]">{exp.round?.hits ?? 0}</div></div>
                </div>
                <div className="p-3 rounded-xl bg-[#08130C] border border-[#16291C] flex items-center space-x-3">
                  <Target className="w-5 h-5 text-cyan-400" />
                  <div><div className="text-[10px] text-[#8C9891] uppercase font-mono">Total acumulado</div>
                    <div className="text-lg font-black font-mono text-cyan-400">{exp.totals.score}</div></div>
                </div>
              </div>

              <div className="flex items-center px-4 py-2.5 rounded-xl bg-[#08140D] border border-[#16C96B]/30 font-mono text-xs">
                <span className={`w-2.5 h-2.5 rounded-full ${isPreparing ? 'bg-amber-400' : 'bg-[#39FF88]'} animate-ping mr-2`} />
                <span className="text-[#F5F7F5] font-bold">
                  {isPreparing ? `Contagem regressiva: ${prepRemainingSeconds}s para iniciar a Rodada 1!` : feedback}
                </span>
              </div>

              <div className="w-full flex justify-center py-2 relative">
                <div className="w-full relative flex justify-center">
                  <CourtTarget
                    gameMode={exp.stage.game || 'free'}
                    activeSectorId={exp.round?.activeSector}
                    activeTargetId={exp.round?.activeSector}
                    sectorStates={exp.round?.sectorStates || {}}
                    targetStates={exp.round?.sectorStates || {}}
                    lastHitSectorId={lastHitSector}
                    lastImpactCoords={lastImpact}
                    onSectorHit={handleWallHit}
                    onTargetHit={handleWallHit}
                    interactive={!isPreparing && !showCountdownOverlay && remainingMs > 0}
                    wallPreset={exp.wallPreset}
                    isFullscreen={isFullscreen}
                  />

                  
                  {showCountdownOverlay && (
                    <div
                      data-testid="countdown-overlay"
                      className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-[#050D07]/85 backdrop-blur-sm border-2 border-[#39FF88]/50 select-none pointer-events-auto"
                    >
                      <div className="text-xs sm:text-sm font-mono uppercase tracking-[0.3em] text-[#8C9891] mb-2">
                        {showGoBanner ? 'EXPERIÊNCIA INICIADA' : 'PREPARANDO EXPERIÊNCIA SHOPPING'}
                      </div>
                      <div
                        data-testid="countdown-number"
                        className="text-[6.5rem] sm:text-[10rem] leading-none font-black font-mono text-[#39FF88] drop-shadow-[0_0_45px_rgba(57,255,136,0.75)] transition-transform duration-150"
                      >
                        {countdownText}
                      </div>
                      <div className="mt-4 text-xs font-mono text-[#F5F7F5]/80">
                        {showGoBanner ? 'Rodada 1 — Treino Livre!' : 'Impactos bloqueados durante os 5 segundos iniciais'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="max-w-3xl mx-auto p-6 sm:p-8 rounded-3xl bg-[#0C1A11] border-2 border-amber-400/40 space-y-6 text-center">
              <div className="inline-flex p-3 rounded-full bg-amber-400/15 text-amber-400"><Timer size={28} /></div>
              <div>
                <div className="text-xs font-mono text-[#8C9891] uppercase">Próximo jogo</div>
                <div className="text-3xl font-black text-[#F5F7F5] uppercase">{exp.stage.nextGameName}</div>
                <div className="text-6xl font-black font-mono text-amber-400 mt-2">{Math.ceil(remainingMs / 1000)}</div>
                <div className="text-xs font-mono text-[#8C9891]">segundos — impactos bloqueados durante o intervalo</div>
              </div>
              <div className="space-y-2 text-left">
                <div className="text-[11px] font-mono text-[#8C9891] uppercase tracking-wider">Resultados parciais</div>
                {exp.results.map((r) => (
                  <div key={r.roundIndex} className="flex items-center justify-between p-3 rounded-xl bg-[#08130C] border border-[#16291C] font-mono text-sm">
                    <span className="font-bold text-[#F5F7F5]">{r.roundIndex + 1}. {r.gameName}</span>
                    <span className="text-[#8C9891]">{r.hits}/{r.shots} acertos</span>
                    <span className="text-[#39FF88] font-black">{r.score} pts</span>
                  </div>
                ))}
                <div className="flex justify-between p-3 rounded-xl bg-[#102216] border border-[#39FF88]/30 font-mono text-sm font-black">
                  <span className="text-[#F5F7F5]">TOTAL</span>
                  <span className="text-[#39FF88]">{exp.totals.score} pts</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      
      {!exp && busyElsewhere && (
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-[#0C1A11] border-2 border-[#1B3624] text-center space-y-3">
          <Store className="w-10 h-10 mx-auto text-amber-400" />
          <h2 className="text-xl font-black text-[#F5F7F5] uppercase">Equipamento em uso</h2>
          <p className="text-xs text-[#8C9891]">Há uma experiência Shopping em andamento. Aguarde o término para iniciar a sua.</p>
        </div>
      )}

      {!exp && !busyElsewhere && last && dismissed !== last.id && (
        <Summary
          data={last}
          isGuest={isGuest}
          onExitGuest={handleExitGuest}
          canStartNew={user?.role === 'admin'}
          onNew={handleStart}
          onClose={() => { localStorage.setItem(DISMISS_KEY, last.id); setDismissed(last.id); }}
        />
      )}

      {!exp && !busyElsewhere && !(last && dismissed !== last.id) && (
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-[#0C1A11] border-2 border-[#39FF88]/30 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#102216] border border-[#39FF88]/40 flex items-center justify-center text-[#39FF88]"><Store className="w-8 h-8" /></div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-[#F5F7F5] uppercase">Experiência Motion Tennis</h2>
            <p className="text-xs text-[#8C9891] leading-relaxed">
              Contagem regressiva de 5 s seguida de três jogos de {installation ? Math.round(installation.roundSeconds / 60 * 10) / 10 : 2} min cada: Treino Livre, Liga Um por Vez e Apagar Todos,
              com intervalos de {installation?.shoppingIntervalSeconds ?? 30} s entre eles. O tempo é controlado pelo servidor.
            </p>
            {isGuest ? (
              <p className="text-[11px] font-mono text-cyan-300 font-bold">JOGANDO COMO VISITANTE (Resultado Temporário)</p>
            ) : (
              user && <p className="text-[11px] font-mono text-[#39FF88]">Jogador: {user.name || user.username}</p>
            )}
          </div>
          <button
            data-testid="btn-shopping-start"
            onClick={handleStart}
            disabled={starting}
            className="w-full py-4 rounded-xl btn-neon font-black text-sm tracking-wider uppercase shadow-neon flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Play size={18} /> {starting ? 'Iniciando...' : 'Iniciar experiência'}
          </button>
        </div>
      )}
    </div>
  );
}
