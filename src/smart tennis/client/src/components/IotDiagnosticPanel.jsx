import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Crosshair,
  Activity,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';

export default function IotDiagnosticPanel({ onClose = null, onWallConfigChanged = null }) {
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [calibrated, setCalibrated] = useState(false);
  const [speedMps, setSpeedMps] = useState('');
  const [groupingWindowUs, setGroupingWindowUs] = useState(25000);
  const [maxResidualM, setMaxResidualM] = useState(0.20);
  const [offsets, setOffsets] = useState({
    S1: { offsetXCm: 0, offsetYCm: 0 },
    S2: { offsetXCm: 0, offsetYCm: 0 },
    S3: { offsetXCm: 0, offsetYCm: 0 }
  });

  const [testXM, setTestXM] = useState('1.50');
  const [testYM, setTestYM] = useState('1.00');

  const syncFormFromDiag = (d) => {
    if (!d) return;
    if (d.calibration) {
      setCalibrated(Boolean(d.calibration.calibrated));
      setSpeedMps(d.calibration.propagationSpeedMps !== null && d.calibration.propagationSpeedMps !== undefined ? String(d.calibration.propagationSpeedMps) : '');
      setGroupingWindowUs(d.calibration.groupingWindowUs || 25000);
      setMaxResidualM(d.calibration.maxResidualM || 0.20);
    }
    if (d.sensorOffsetsCm) {
      setOffsets({
        S1: { offsetXCm: d.sensorOffsetsCm.S1?.offsetXCm || 0, offsetYCm: d.sensorOffsetsCm.S1?.offsetYCm || 0 },
        S2: { offsetXCm: d.sensorOffsetsCm.S2?.offsetXCm || 0, offsetYCm: d.sensorOffsetsCm.S2?.offsetYCm || 0 },
        S3: { offsetXCm: d.sensorOffsetsCm.S3?.offsetXCm || 0, offsetYCm: d.sensorOffsetsCm.S3?.offsetYCm || 0 }
      });
    }
  };

  const loadDiagnostics = async (syncForm = false) => {
    try {
      const data = await api.getIotDiagnostics();
      setDiag(data);
      if (syncForm) syncFormFromDiag(data);
    } catch (err) {
      setFeedback({ ok: false, text: err.message || 'Erro ao carregar diagnóstico IoT.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostics(true);
    const unsub = wsClient.on('IOT_DIAGNOSTIC_UPDATED', () => {
      loadDiagnostics(false);
    });
    return () => unsub();
  }, []);

  const handleSaveCalibration = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateIotCalibration({
        sensorOffsetsCm: offsets,
        calibration: {
          calibrated: Boolean(calibrated && Number(speedMps) > 0),
          propagationSpeedMps: speedMps !== '' && Number(speedMps) > 0 ? Number(speedMps) : null,
          groupingWindowUs: Number(groupingWindowUs),
          maxResidualM: Number(maxResidualM)
        }
      });
      if (res?.diagnostics) {
        setDiag(res.diagnostics);
        syncFormFromDiag(res.diagnostics);
      }
      if (onWallConfigChanged && res?.wallConfig) {
        onWallConfigChanged(res.wallConfig);
      }
      setFeedback({ ok: true, text: 'Parâmetros de sensores e calibração salvos com sucesso.' });
    } catch (err) {
      setFeedback({ ok: false, text: err.message || 'Falha ao salvar calibração.' });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickCalibrate = async (speed = 343) => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateIotCalibration({
        sensorOffsetsCm: offsets,
        calibration: {
          calibrated: true,
          propagationSpeedMps: speed,
          groupingWindowUs: Number(groupingWindowUs) || 25000,
          maxResidualM: Number(maxResidualM) || 0.20
        }
      });
      if (res?.diagnostics) {
        setDiag(res.diagnostics);
        syncFormFromDiag(res.diagnostics);
      }
      if (onWallConfigChanged && res?.wallConfig) {
        onWallConfigChanged(res.wallConfig);
      }
      setFeedback({
        ok: true,
        text: `Calibração ativada com sucesso (v = ${speed} m/s)! Impactos físicos do hardware agora serão localizados.`
      });
    } catch (err) {
      setFeedback({ ok: false, text: err.message || 'Falha ao ativar calibração.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSynthetic = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const res = await api.testSyntheticTdoa({
        xMeters: Number(testXM),
        yMeters: Number(testYM)
      });
      if (res?.diagnostics) {
        setDiag(res.diagnostics);
      }
      setFeedback({
        ok: true,
        text: `Pacote sintético processado para (${testXM}m, ${testYM}m). Confira os timestamps e diferenças abaixo.`
      });
    } catch (err) {
      setFeedback({ ok: false, text: err.message || 'Erro no ensaio sintético.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading && !diag) {
    return (
      <div className="p-6 rounded-2xl bg-[#08130C] border border-[#16C96B]/30 text-center text-xs font-mono text-[#39FF88]">
        Carregando Painel de Diagnóstico IoT...
      </div>
    );
  }

  const wall = diag?.wall || { preset: '3x2', label: '3 × 2 metros', widthM: 3, heightM: 2 };
  const S1 = diag?.sensors?.S1 || { xM: 0, yM: 0, idealXM: 0, idealYM: 0, offsetXCm: 0, offsetYCm: 0 };
  const S2 = diag?.sensors?.S2 || { xM: 0, yM: wall.heightM, idealXM: 0, idealYM: wall.heightM, offsetXCm: 0, offsetYCm: 0 };
  const S3 = diag?.sensors?.S3 || { xM: wall.widthM, yM: 0, idealXM: wall.widthM, idealYM: 0, offsetXCm: 0, offsetYCm: 0 };
  const hw = diag?.hardwareConnection || { mode: 'simulation', statusLabel: 'Modo Simulação' };
  const cal = diag?.calibration || { calibrated: false, propagationSpeedMps: null };
  const lastArduino = diag?.lastArduinoEvent || null;
  const lastSim = diag?.lastSimulatedImpact || null;

  return (
    <div
      data-testid="iot-diagnostic-panel"
      className="p-5 rounded-3xl bg-[#07120B] border-2 border-cyan-500/40 shadow-2xl space-y-5 text-xs font-mono"
    >
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1B3624]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-400/50 text-cyan-300">
            <Cpu size={18} />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-cyan-300">
              Painel Técnico de Diagnóstico IoT — Sensores KY-037 & TDOA
            </h2>
            <p className="text-[11px] text-[#8C9891]">
              Monitoramento de timestamps em microssegundos, agrupamento temporal e localização experimental
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadDiagnostics(false)}
            className="px-3 py-1.5 rounded-xl bg-[#0C1A11] border border-[#1B3624] hover:border-cyan-400/50 text-[#F5F7F5] flex items-center gap-1.5 transition-all"
          >
            <RefreshCw size={13} />
            <span>Atualizar</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-[#0C1A11] border border-[#1B3624] text-[#8C9891] hover:text-rose-400"
              title="Fechar Painel IoT"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl border flex items-center gap-2 ${
          feedback.ok ? 'bg-[#39FF88]/10 border-[#39FF88]/40 text-[#39FF88]' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
        }`}>
          {feedback.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{feedback.text}</span>
        </div>
      )}

      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#0B1910] border border-[#1B3624]">
          <div className="text-[10px] text-[#8C9891] uppercase">Dimensão da Parede Selecionada</div>
          <div data-testid="iot-wall-dimension" className="text-lg font-black text-[#39FF88] mt-1">
            {wall.label} ({wall.widthM}m × {wall.heightM}m)
          </div>
          <div className="text-[10px] text-[#8C9891] mt-1">
            Origem cartesiana (0, 0) no canto inferior esquerdo (S1)
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#0B1910] border border-[#1B3624]">
          <div className="text-[10px] text-[#8C9891] uppercase">Estado da Conexão de Hardware</div>
          <div data-testid="iot-hardware-connection" className="text-sm font-black text-cyan-300 mt-1 flex items-center gap-2">
            <Radio size={14} className="text-cyan-400 animate-pulse" />
            <span>{hw.statusLabel}</span>
          </div>
          <div className="text-[10px] text-[#8C9891] mt-1">
            Dispositivo: {hw.lastDeviceId || 'Aguardando pacote Arduino'} • Porta: {hw.port}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#0B1910] border border-[#1B3624]">
          <div className="text-[10px] text-[#8C9891] uppercase">Estado da Calibração Experimental</div>
          <div
            data-testid="iot-calibration-status"
            className={`text-sm font-black mt-1 ${cal.calibrated ? 'text-[#39FF88]' : 'text-amber-400'}`}
          >
            {cal.calibrated
              ? `CALIBRADO (v = ${cal.propagationSpeedMps} m/s)`
              : 'PENDENTE DE CALIBRAÇÃO EXPERIMENTAL'}
          </div>
          <div className="text-[10px] text-[#8C9891] mt-1">
            Janela de agrupamento: {cal.groupingWindowUs || 25000} µs • Resíduo máx: {cal.maxResidualM || 0.20} m
          </div>
        </div>
      </div>

      
      <div className="p-4 rounded-2xl bg-[#0B1910] border border-[#1B3624] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">
            Disposição Física Oficial dos 3 Sensores KY-037
          </span>
          <span className="text-[10px] text-amber-400 font-bold">
            Canto Superior Direito: NÃO POSSUI SENSOR
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div data-testid="iot-coord-S1" className="p-3 rounded-xl bg-[#07110B] border border-cyan-500/30">
            <div className="text-[10px] text-cyan-300 font-bold">S1 • Canto Inferior Esquerdo</div>
            <div className="text-base font-black text-[#F5F7F5] mt-1">
              ({S1.xM} m, {S1.yM} m)
            </div>
            <div className="text-[10px] text-[#8C9891] mt-0.5">
              Ideal: (0, 0) • Offset: ({S1.offsetXCm || 0}cm, {S1.offsetYCm || 0}cm)
            </div>
          </div>

          <div data-testid="iot-coord-S2" className="p-3 rounded-xl bg-[#07110B] border border-cyan-500/30">
            <div className="text-[10px] text-cyan-300 font-bold">S2 • Canto Superior Esquerdo</div>
            <div className="text-base font-black text-[#F5F7F5] mt-1">
              ({S2.xM} m, {S2.yM} m)
            </div>
            <div className="text-[10px] text-[#8C9891] mt-0.5">
              Ideal: (0, {wall.heightM}) • Offset: ({S2.offsetXCm || 0}cm, {S2.offsetYCm || 0}cm)
            </div>
          </div>

          <div data-testid="iot-coord-S3" className="p-3 rounded-xl bg-[#07110B] border border-cyan-500/30">
            <div className="text-[10px] text-cyan-300 font-bold">S3 • Canto Inferior Direito</div>
            <div className="text-base font-black text-[#F5F7F5] mt-1">
              ({S3.xM} m, {S3.yM} m)
            </div>
            <div className="text-[10px] text-[#8C9891] mt-0.5">
              Ideal: ({wall.widthM}, 0) • Offset: ({S3.offsetXCm || 0}cm, {S3.offsetYCm || 0}cm)
            </div>
          </div>

          <div data-testid="iot-coord-top-right-none" className="p-3 rounded-xl bg-[#07110B]/60 border border-[#1B3624] opacity-75">
            <div className="text-[10px] text-[#8C9891] font-bold">Canto Superior Direito</div>
            <div className="text-sm font-black text-[#8C9891] mt-1">
              SEM SENSOR
            </div>
            <div className="text-[10px] text-[#8C9891] mt-0.5">
              Posição ({wall.widthM} m, {wall.heightM} m) livre
            </div>
          </div>
        </div>
      </div>

      
      <div className="p-4 rounded-2xl bg-[#0B1910] border border-[#1B3624] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-[#39FF88]" />
            <span className="text-[11px] font-bold text-[#F5F7F5] uppercase tracking-wider">
              Último Evento Recebido do Hardware (Arduino / TDOA)
            </span>
          </div>
          {lastArduino && (
            <div className="flex flex-wrap items-center gap-2">
              {lastArduino.isArduinoHardware ? (
                <span className="px-2 py-0.5 rounded-md font-mono text-[9px] uppercase font-bold bg-emerald-950/80 border border-emerald-400/60 text-emerald-300">
                  Origem: Hardware Real (Arduino Uno)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md font-mono text-[9px] uppercase font-bold bg-cyan-950/80 border border-cyan-400/60 text-cyan-300">
                  Origem: Simulação Sintética
                </span>
              )}
              <span
                data-testid="iot-event-classification-badge"
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] border ${
                  lastArduino.category === 'HARDWARE_LOCATED' || lastArduino.category === 'SIMULATED_TDOA_LOCATED'
                    ? 'bg-[#39FF88]/15 border-[#39FF88]/50 text-[#39FF88]'
                    : lastArduino.category === 'HARDWARE_AWAITING_CALIBRATION'
                      ? 'bg-amber-400/15 border-amber-400/60 text-amber-300'
                      : lastArduino.category === 'HARDWARE_INCOMPLETE'
                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                }`}
              >
                {lastArduino.categoryLabel}
              </span>
            </div>
          )}
        </div>

        {!lastArduino ? (
          <div className="p-4 rounded-xl bg-[#07110B] border border-[#1B3624] text-[#8C9891]">
            Nenhum pacote de timestamps do Arduino recebido nesta sessão. Impactos simulados por mouse aparecem separadamente abaixo e nunca são exibidos como leituras do Arduino.
          </div>
        ) : (
          <div className="space-y-3">
            
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">TIMESTAMP S1 (t1)</div>
                <div data-testid="iot-t1-us" className="text-sm font-black text-cyan-300 mt-0.5">
                  {lastArduino.t1Us !== null && lastArduino.t1Us !== undefined ? `${lastArduino.t1Us} µs` : 'Sem resposta'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">TIMESTAMP S2 (t2)</div>
                <div data-testid="iot-t2-us" className="text-sm font-black text-cyan-300 mt-0.5">
                  {lastArduino.t2Us !== null && lastArduino.t2Us !== undefined ? `${lastArduino.t2Us} µs` : 'Sem resposta'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">TIMESTAMP S3 (t3)</div>
                <div data-testid="iot-t3-us" className="text-sm font-black text-cyan-300 mt-0.5">
                  {lastArduino.t3Us !== null && lastArduino.t3Us !== undefined ? `${lastArduino.t3Us} µs` : 'Sem resposta'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">Δt21 = t2 - t1</div>
                <div data-testid="iot-dt21-us" className="text-sm font-black text-[#39FF88] mt-0.5">
                  {lastArduino.dt21Us !== null && lastArduino.dt21Us !== undefined ? `${lastArduino.dt21Us} µs` : 'Indisponível'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">Δt31 = t3 - t1</div>
                <div data-testid="iot-dt31-us" className="text-sm font-black text-[#39FF88] mt-0.5">
                  {lastArduino.dt31Us !== null && lastArduino.dt31Us !== undefined ? `${lastArduino.dt31Us} µs` : 'Indisponível'}
                </div>
              </div>
            </div>

            
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">ESTADO DO AGRUPAMENTO</div>
                <div data-testid="iot-grouping-state" className="text-xs font-bold text-[#F5F7F5] mt-0.5">
                  {lastArduino.groupingLabel}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">COORDENADA ESTIMADA X</div>
                <div data-testid="iot-est-x" className="text-sm font-black text-[#39FF88] mt-0.5">
                  {lastArduino.xMeters !== null && lastArduino.xMeters !== undefined
                    ? `${lastArduino.xMeters} m (X_norm: ${lastArduino.xNormalized})`
                    : lastArduino.category === 'HARDWARE_AWAITING_CALIBRATION'
                      ? 'Aguardando calibração'
                      : lastArduino.category === 'HARDWARE_INCOMPLETE'
                        ? 'Leitura incompleta'
                        : 'Indisponível'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">COORDENADA ESTIMADA Y</div>
                <div data-testid="iot-est-y" className="text-sm font-black text-[#39FF88] mt-0.5">
                  {lastArduino.yMeters !== null && lastArduino.yMeters !== undefined
                    ? `${lastArduino.yMeters} m (Y_norm: ${lastArduino.yNormalized})`
                    : lastArduino.category === 'HARDWARE_AWAITING_CALIBRATION'
                      ? 'Aguardando calibração'
                      : lastArduino.category === 'HARDWARE_INCOMPLETE'
                        ? 'Leitura incompleta'
                        : 'Indisponível'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-[#8C9891]">SETOR CORRESPONDENTE</div>
                <div data-testid="iot-est-sector" className="text-sm font-black text-amber-400 mt-0.5">
                  {lastArduino.xMeters !== null
                    ? (lastArduino.sectorId ? `SETOR ${lastArduino.sectorId}` : 'ÁREA NEUTRA')
                    : lastArduino.category === 'HARDWARE_AWAITING_CALIBRATION'
                      ? 'Calibração pendente'
                      : 'Não localizado'}
                </div>
                <div className="text-[10px] text-[#8C9891]">
                  Classificação: {lastArduino.estimationStatusLabel || 'indisponível'}
                  {lastArduino.residualRmsM !== null && lastArduino.residualRmsM !== undefined ? ` (Resíduo: ${lastArduino.residualRmsM}m)` : ''}
                </div>
              </div>
            </div>

            
            {lastArduino.estimationMessage && (
              <div className={`p-2.5 rounded-xl border text-[11px] ${
                lastArduino.category === 'HARDWARE_LOCATED'
                  ? 'bg-[#39FF88]/10 border-[#39FF88]/30 text-[#39FF88]'
                  : lastArduino.category === 'HARDWARE_AWAITING_CALIBRATION'
                    ? 'bg-amber-950/30 border-amber-400/40 text-amber-200'
                    : 'bg-[#07110B] border-[#1B3624] text-[#8C9891]'
              }`}>
                <span className="font-bold uppercase text-[9px] block text-[#8C9891] mb-0.5">
                  Diagnóstico do Algoritmo de Localização:
                </span>
                <span>{lastArduino.estimationMessage}</span>
              </div>
            )}
          </div>
        )}

        
        <div className="p-2.5 rounded-xl bg-[#07110B]/80 border border-[#1B3624] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
          <span className="text-[#8C9891]">
            <strong>Situação 1 (Simulação de Jogo):</strong>{' '}
            {lastSim
              ? `${lastSim.categoryLabel} via mouse em X=${lastSim.xScreenPct}%, Y=${lastSim.yScreenPct}% (${lastSim.sectorId ? `Setor ${lastSim.sectorId}` : 'Área Neutra'})`
              : 'Nenhum clique simulado recente.'}
          </span>
          <span className="text-[10px] text-cyan-300">
            Impactos simulados não alimentam o TDOA do Arduino
          </span>
        </div>
      </div>

      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={handleSaveCalibration} className="p-4 rounded-2xl bg-[#0B1910] border border-[#1B3624] space-y-3">
          <div className="flex items-center gap-2 text-cyan-300 font-bold uppercase text-[11px]">
            <Sliders size={14} />
            <span>Parâmetros de Calibração Experimental e Offsets (cm)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] text-[#8C9891] mb-1">CALIBRAÇÃO ATIVA</label>
              <select
                value={calibrated ? '1' : '0'}
                onChange={(e) => setCalibrated(e.target.value === '1')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#07110B] border border-[#1B3624] text-[#F5F7F5]"
              >
                <option value="0">Não calibrado (Bloqueia X/Y)</option>
                <option value="1">Calibrado Experimentalmente</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-[#8C9891] mb-1">VEL. EFETIVA (m/s)</label>
              <input
                type="number"
                step="0.1"
                placeholder="Ex: 340"
                value={speedMps}
                onChange={(e) => setSpeedMps(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#07110B] border border-[#1B3624] text-[#F5F7F5]"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8C9891] mb-1">JANELA AGRUP. (µs)</label>
              <input
                type="number"
                value={groupingWindowUs}
                onChange={(e) => setGroupingWindowUs(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#07110B] border border-[#1B3624] text-[#F5F7F5]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {['S1', 'S2', 'S3'].map((sKey) => (
              <div key={sKey} className="p-2 rounded-lg bg-[#07110B] border border-[#1B3624]">
                <div className="text-[10px] text-cyan-300 font-bold mb-1">Offset {sKey} (cm)</div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.5"
                    title={`Deslocamento X em cm de ${sKey}`}
                    value={offsets[sKey]?.offsetXCm ?? 0}
                    onChange={(e) =>
                      setOffsets((prev) => ({
                        ...prev,
                        [sKey]: { ...prev[sKey], offsetXCm: Number(e.target.value) }
                      }))
                    }
                    className="w-1/2 px-1.5 py-1 rounded bg-[#0B1910] border border-[#1B3624] text-[#F5F7F5] text-[10px]"
                  />
                  <input
                    type="number"
                    step="0.5"
                    title={`Deslocamento Y em cm de ${sKey}`}
                    value={offsets[sKey]?.offsetYCm ?? 0}
                    onChange={(e) =>
                      setOffsets((prev) => ({
                        ...prev,
                        [sKey]: { ...prev[sKey], offsetYCm: Number(e.target.value) }
                      }))
                    }
                    className="w-1/2 px-1.5 py-1 rounded bg-[#0B1910] border border-[#1B3624] text-[#F5F7F5] text-[10px]"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#07110B] font-black uppercase tracking-wider transition-all text-xs"
            >
              {saving ? 'Salvando...' : 'Salvar Parâmetros'}
            </button>
            {!cal.calibrated && (
              <button
                type="button"
                onClick={() => handleQuickCalibrate(343)}
                disabled={saving}
                className="px-3 py-2 rounded-xl bg-[#16C96B]/20 border border-[#16C96B]/50 hover:bg-[#16C96B]/30 text-[#39FF88] font-bold text-xs transition-all whitespace-nowrap"
                title="Ativar calibração padrão imediata a 343 m/s para testes físicos"
              >
                Ativar Calibração Imediata (343 m/s)
              </button>
            )}
          </div>
        </form>

        <div className="p-4 rounded-2xl bg-[#0B1910] border border-[#1B3624] flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#39FF88] font-bold uppercase text-[11px]">
              <Crosshair size={14} />
              <span>Injeção de Pacote de Bancada (Teste de Convergência TDOA)</span>
            </div>
            <p className="text-[11px] text-[#8C9891] leading-relaxed">
              Gera três leituras com timestamps em microssegundos para um ponto físico conhecido (X_m, Y_m) na parede {wall.widthM}m × {wall.heightM}m e submete ao agrupador do Arduino.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[10px] text-[#8C9891] mb-1">X FÍSICO ESPERADO (0 a {wall.widthM}m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={wall.widthM}
                  value={testXM}
                  onChange={(e) => setTestXM(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#07110B] border border-[#1B3624] text-[#F5F7F5]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#8C9891] mb-1">Y FÍSICO ESPERADO (0 a {wall.heightM}m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={wall.heightM}
                  value={testYM}
                  onChange={(e) => setTestYM(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#07110B] border border-[#1B3624] text-[#F5F7F5]"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestSynthetic}
            disabled={testing}
            className="w-full py-2 rounded-xl bg-[#16291C] hover:bg-[#1F3A28] border border-[#39FF88]/50 text-[#39FF88] font-black uppercase tracking-wider transition-all"
          >
            {testing ? 'Processando...' : 'Injetar Leituras de Teste S1, S2 e S3'}
          </button>
        </div>
      </div>
    </div>
  );
}
