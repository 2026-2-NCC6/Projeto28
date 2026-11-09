import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  WALL_PRESETS,
  NICOLAS_WALL_OPTIONS,
  PHYSICAL_CONSTANTS,
  calculateSensorPositions,
  calculateWallGeometry,
  classifyImpact,
  FIXED_SECTORS,
  FIXED_TARGETS,
  FIXED_SENSORS
} from '../services/wallGeometry';

export {
  WALL_PRESETS,
  NICOLAS_WALL_OPTIONS,
  PHYSICAL_CONSTANTS,
  calculateSensorPositions,
  calculateWallGeometry,
  classifyImpact,
  FIXED_SECTORS,
  FIXED_TARGETS,
  FIXED_SENSORS
};

export const detectSector = (x, y, preset = '3x2') => classifyImpact(x, y, preset);

function getSectorTheme(gameMode, isPulse, isTarget, isLit) {
  if (isPulse) {
    return {
      bg: 'bg-white text-[#07110B] shadow-[0_0_50px_rgba(255,255,255,1),0_0_25px_#39FF88] z-20 scale-[1.02]',
      border: 'border-4 border-white',
      label: 'text-[#07110B]',
      badge: 'text-[#07110B]',
      dim: 'text-[#07110B]',
      status: 'text-[#07110B] font-black',
      text: '★ IMPACTO ★'
    };
  }
  if (gameMode === 'single') {
    return isTarget
      ? {
          bg: 'bg-[#39FF88] text-[#07110B] shadow-[0_0_40px_rgba(57,255,136,0.8),inset_0_0_20px_rgba(255,255,255,0.7)] z-10 animate-pulse scale-[1.02]',
          border: 'border-4 border-white',
          label: 'text-[#07110B]',
          badge: 'text-[#07110B]',
          dim: 'text-[#07110B]',
          status: 'text-[#07110B] font-black',
          text: '★ ACERTE AQUI ★'
        }
      : {
          bg: 'bg-[#06130B] text-[#1F3E2B] shadow-[0_4px_16px_rgba(0,0,0,0.5)]',
          border: 'border-2 border-[#16C96B]/20',
          label: 'text-[#1F3E2B]',
          badge: 'text-[#2D5A3D]',
          dim: 'text-[#1F3E2B]',
          status: 'text-[#2D5A3D]',
          text: 'AGUARDANDO'
        };
  }
  if (gameMode === 'clear_all') {
    return isLit
      ? {
          bg: 'bg-[#16C96B] text-[#07110B] shadow-[0_0_30px_rgba(22,201,107,0.5),inset_0_0_15px_rgba(57,255,136,0.3)] z-10',
          border: 'border-2 border-[#39FF88]',
          label: 'text-[#07110B] font-black',
          badge: 'text-[#07110B]',
          dim: 'text-[#07110B]',
          status: 'text-[#07110B] font-black',
          text: 'ACESO'
        }
      : {
          bg: 'bg-[#050E08] text-[#1A2E22] shadow-[inset_0_0_15px_rgba(0,0,0,0.8)]',
          border: 'border border-[#16C96B]/15',
          label: 'text-[#1A2E22]',
          badge: 'text-[#263D2E]',
          dim: 'text-[#1A2E22]',
          status: 'text-[#263D2E]',
          text: 'APAGADO'
        };
  }
  return {
    bg: 'bg-[#0A1F13] text-[#F5F7F5] shadow-[0_4px_24px_rgba(0,0,0,0.6),inset_0_0_20px_rgba(22,201,107,0.08)] hover:border-[#39FF88] hover:bg-[#0F2D1C] hover:shadow-[0_0_25px_rgba(57,255,136,0.25)]',
    border: 'border-2 border-[#16C96B]',
    label: 'text-[#F5F7F5]',
    badge: 'text-[#39FF88]',
    dim: 'text-[#8C9891]',
    status: 'text-[#39FF88]',
    text: 'LIVRE'
  };
}

export default function CourtTarget({
  gameMode = 'free',
  activeTargetId = null,
  activeSectorId = null,
  targetStates = {},
  sectorStates = {},
  lastHitTargetId = null,
  lastHitSectorId = null,
  lastImpactCoords = null,
  onTargetHit,
  onSectorHit,
  interactive = true,
  wallPreset = '3x2',
  sensorOffsetsCm = null,
  showSensors = true,
  isFullscreen = false
}) {
  const containerRef = useRef(null);
  const [impactEffects, setImpactEffects] = useState([]);
  const [hitPulses, setHitPulses] = useState({});

  const geometry = useMemo(
    () => calculateWallGeometry(wallPreset, sensorOffsetsCm || {}),
    [wallPreset, sensorOffsetsCm]
  );

  const effectiveActiveSectorId = activeSectorId || activeTargetId;
  const effectiveSectorStates = Object.keys(sectorStates).length > 0 ? sectorStates : targetStates;
  const effectiveLastHitId = lastHitSectorId || lastHitTargetId;

  useEffect(() => {
    if (!effectiveLastHitId) return;
    setHitPulses((prev) => ({ ...prev, [effectiveLastHitId]: Date.now() }));
    const timer = setTimeout(() => {
      setHitPulses((prev) => {
        const next = { ...prev };
        delete next[effectiveLastHitId];
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [effectiveLastHitId]);

  useEffect(() => {
    if (!lastImpactCoords || lastImpactCoords.x === undefined || lastImpactCoords.y === undefined) return;
    const effectId = Date.now() + Math.random();
    const newEffect = { id: effectId, x: lastImpactCoords.x, y: lastImpactCoords.y, hit: lastImpactCoords.hit !== false };
    setImpactEffects((prev) => [...prev.slice(-4), newEffect]);
    const timer = setTimeout(() => {
      setImpactEffects((prev) => prev.filter((e) => e.id !== effectId));
    }, 700);
    return () => clearTimeout(timer);
  }, [lastImpactCoords]);

  const handleWallClick = (e) => {
    if (!interactive || !containerRef.current) return;
    const notifyFn = onSectorHit || onTargetHit;
    if (!notifyFn) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const clickX = Number((((e.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const clickY = Number((((e.clientY - rect.top) / rect.height) * 100).toFixed(2));
    const result = classifyImpact(clickX, clickY, wallPreset);
    const isHit = result.classification === 'TARGET_HIT';

    notifyFn({
      hit: isHit,
      sectorId: isHit ? result.sectorId : null,
      targetId: isHit ? result.sectorId : null,
      sensorId: isHit ? result.sectorId : null,
      x: clickX,
      y: clickY,
      sector: isHit ? result.sector : undefined,
      classification: result.classification,
      reason: isHit ? undefined : result.reason
    });
  };

  const aspectClass =
    geometry.ratioClass ||
    (geometry.aspectRatio === '1/1' ? 'aspect-square' : geometry.aspectRatio === '3/2' ? 'aspect-[3/2]' : 'aspect-[4/3]');
  const { S1, S2, S3 } = geometry.sensors;
  const sensorBadges = [
    { id: 'S1', s: S1, corner: 'bottom_left', pos: 'bottom-1.5 left-1.5' },
    { id: 'S2', s: S2, corner: 'top_left', pos: 'top-1.5 left-1.5' },
    { id: 'S3', s: S3, corner: 'bottom_right', pos: 'bottom-1.5 right-1.5' }
  ];

  return (
    <div className={`relative w-full mx-auto select-none flex items-center justify-center ${isFullscreen ? 'h-full max-h-[92vh] max-w-full' : 'max-w-5xl'}`}>
      <div
        ref={containerRef}
        onClick={handleWallClick}
        data-testid="smart-tennis-projection-wall"
        data-wall-preset={geometry.preset}
        data-wall-dimensions={`${geometry.widthM}x${geometry.heightM}`}
        style={{ aspectRatio: geometry.aspectRatio, maxWidth: geometry.aspectRatio === '1/1' ? '760px' : undefined }}
        className={`relative w-full ${aspectClass} max-h-[82vh] bg-[#030905] border-4 border-[#16C96B]/50 shadow-[0_0_60px_rgba(22,201,107,0.18),inset_0_0_40px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden transition-all duration-300 ${
          interactive ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        {showSensors && (
          <>
            {sensorBadges.map(({ id, s, corner, pos }) => (
              <div
                key={id}
                data-testid={`wall-sensor-${id}`}
                data-sensor-corner={corner}
                data-sensor-coords={`(${s.xM}, ${s.yM})`}
                className={`absolute ${pos} z-20 pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#07180F]/95 border border-cyan-400/70 shadow-[0_0_12px_rgba(34,211,238,0.35)]`}
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-mono font-black text-[10px] text-cyan-300 tracking-wider">
                  {id} ({s.xM}, {s.yM}m)
                </span>
              </div>
            ))}
            <div
              data-testid="wall-corner-top-right-empty"
              data-has-sensor="false"
              className="absolute top-1.5 right-2 z-10 pointer-events-none font-mono text-[9px] text-[#8C9891]/60"
            >
              {geometry.widthM}m × {geometry.heightM}m
            </div>
          </>
        )}

        {geometry.sectors.map((sector) => {
          const isPulse = Boolean(hitPulses[sector.id]);
          const isTarget = gameMode === 'single' && effectiveActiveSectorId === sector.id;
          const isLit = gameMode === 'clear_all' && effectiveSectorStates[sector.id] !== false;
          const theme = getSectorTheme(gameMode, isPulse, isTarget, isLit);

          return (
            <div
              key={sector.id}
              data-sector-id={sector.id}
              data-testid={`sector-${sector.id}`}
              style={{
                position: 'absolute',
                left: `${sector.xMin}%`,
                top: `${sector.yMin}%`,
                width: `${sector.widthPct}%`,
                height: `${sector.heightPct}%`,
                borderRadius: '14px'
              }}
              className={`flex flex-col items-center justify-center p-3 select-none transition-all duration-150 ${theme.border} ${theme.bg}`}
            >
              <div className={`absolute top-2.5 left-3.5 font-mono font-bold text-[10px] sm:text-xs tracking-wider uppercase ${theme.badge}`}>
                ALVO {sector.id}
              </div>
              <div className={`absolute top-2.5 right-3.5 font-mono text-[9px] sm:text-[10px] ${theme.dim}`}>
                {Math.round(sector.widthM * 100)}×{Math.round(sector.heightM * 100)}cm
              </div>
              <div className={`font-mono font-black text-5xl sm:text-6xl md:text-7xl leading-none transition-transform duration-100 ${isLit || isTarget ? 'scale-105' : 'scale-100'} ${theme.label}`}>
                {sector.id}
              </div>
              <div className={`absolute bottom-2.5 font-mono font-bold text-[10px] sm:text-[11px] tracking-widest uppercase ${theme.status}`}>
                {theme.text}
              </div>
            </div>
          );
        })}

        {impactEffects.map((eff) => (
          <div
            key={eff.id}
            style={{ left: `${eff.x}%`, top: `${eff.y}%`, transform: 'translate(-50%, -50%)' }}
            className="absolute pointer-events-none z-30 flex items-center justify-center"
          >
            <div className={` rounded-full border-2 animate-ping ${eff.hit ? 'w-14 h-14 border-[#39FF88]' : 'w-12 h-12 border-amber-400/80'}`} />
            <div className={`rounded-full ${eff.hit ? 'w-3 h-3 bg-white shadow-[0_0_15px_#39FF88]' : 'w-2.5 h-2.5 bg-amber-400 shadow-[0_0_10px_#f59e0b]'}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
