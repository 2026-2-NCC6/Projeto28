import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Target, 
  Cpu, 
  CheckCircle2, 
  AlertTriangle, 
  Save, 
  Wifi, 
  WifiOff, 
  Layers, 
  Sliders
} from 'lucide-react';
import { api } from '../../services/api';

const WALL_PRESETS = [
  { 
    id: '3x2', 
    label: '3 × 2 metros', 
    shortLabel: '3x2 m',
    aspect: '3:2 (Padrão)', 
    widthM: 3, 
    heightM: 2,
    desc: 'Proporção áurea recomendada para projeções e quadras convencionais.'
  },
  { 
    id: '3x3', 
    label: '3 × 3 metros', 
    shortLabel: '3x3 m',
    aspect: '1:1 (Quadrada)', 
    widthM: 3, 
    heightM: 3,
    desc: 'Área vertical estendida para treinos intensivos de smash e saque.'
  },
  { 
    id: '4x3', 
    label: '4 × 3 metros', 
    shortLabel: '4x3 m',
    aspect: '4:3 (Ampla)', 
    widthM: 4, 
    heightM: 3,
    desc: 'Área ampla para treinos em espaço aberto ou ginásios esportivos.'
  }
];

export default function AdminSensorsPage() {
  const [selectedPreset, setSelectedPreset] = useState('3x2');
  const [hardwareMode, setHardwareMode] = useState('connected');
  const [lastSeen, setLastSeen] = useState(null);

  const [propagationSpeed, setPropagationSpeed] = useState('343');
  const [groupingWindow, setGroupingWindow] = useState('25000');
  const [calibrated, setCalibrated] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    loadCurrentConfiguration();
  }, []);

  const loadCurrentConfiguration = async () => {
    setLoading(true);
    try {
      const [wallRes, hwRes, iotRes] = await Promise.allSettled([
        api.admin.getWallConfig(),
        api.getHardwareStatus(),
        api.getIotDiagnostics()
      ]);

      if (wallRes.status === 'fulfilled' && wallRes.value?.preset) {
        setSelectedPreset(wallRes.value.preset);
      }

      if (hwRes.status === 'fulfilled' && hwRes.value?.details) {
        const mode = hwRes.value.details.mode || 'connected';
        setHardwareMode(mode);
        setLastSeen(hwRes.value.details.lastSeen || null);
      }

      if (iotRes.status === 'fulfilled' && iotRes.value?.calibration) {
        const cal = iotRes.value.calibration;
        setCalibrated(Boolean(cal.calibrated));
        if (cal.propagationSpeedMps) {
          setPropagationSpeed(String(cal.propagationSpeedMps));
        }
        if (cal.groupingWindowUs) {
          setGroupingWindow(String(cal.groupingWindowUs));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar configurações de sensores:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await api.admin.setWallConfig(selectedPreset);
      await api.setHardwareMode(hardwareMode);
      await api.updateIotCalibration({
        calibration: {
          calibrated: Boolean(calibrated && Number(propagationSpeed) > 0),
          propagationSpeedMps: Number(propagationSpeed) || 343,
          groupingWindowUs: Number(groupingWindow) || 25000,
          maxResidualM: 0.20
        }
      });

      setFeedback({
        ok: true,
        text: 'Configurações de sensores e parede salvas com sucesso!'
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({
        ok: false,
        text: err.message || 'Falha ao salvar configurações.'
      });
    } finally {
      setSaving(false);
    }
  };

  const activePresetConfig = WALL_PRESETS.find(p => p.id === selectedPreset) || WALL_PRESETS[0];

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#08120B] border border-[#295437]">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7F5] flex items-center space-x-2">
            <Radio className="w-6 h-6 text-amber-400" />
            <span>Sensores e Parede Digital</span>
          </h1>
          <p className="text-xs text-[#8C9891] mt-0.5">
            Seleção do tamanho físico da parede, status do hardware e calibração dos sensores KY-037.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase flex items-center space-x-2 hover:bg-amber-300 transition shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Salvando...' : 'Salvar Configurações'}</span>
        </button>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl border flex items-center gap-2 text-xs ${
          feedback.ok ? 'bg-[#39FF88]/10 border-[#39FF88]/40 text-[#39FF88]' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
        }`}>
          {feedback.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="p-6 rounded-3xl bg-[#08120B] border border-[#295437] space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-[#1B3624]">
          <Layers className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-black text-[#F5F7F5] uppercase">
            1. Dimensões Físicas da Parede
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {WALL_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPreset(preset.id)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  isSelected
                    ? 'bg-amber-400/15 border-amber-400 shadow-md'
                    : 'bg-[#0C1A11] border-[#1B3624] hover:border-amber-400/40 text-[#8C9891]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-lg font-black ${isSelected ? 'text-amber-400' : 'text-[#F5F7F5]'}`}>
                    {preset.label}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    isSelected ? 'bg-amber-400 text-[#07110B]' : 'bg-[#1B3624] text-[#8C9891]'
                  }`}>
                    {preset.aspect}
                  </span>
                </div>
                <p className="text-xs text-[#8C9891]">{preset.desc}</p>
                <div className="mt-3 text-[11px] font-bold text-cyan-300">
                  Largura: {preset.widthM}m • Altura: {preset.heightM}m
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-[#08120B] border border-[#295437] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1B3624]">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-black text-[#F5F7F5] uppercase">
              2. Conexão do Hardware
            </h2>
          </div>
          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1.5 ${
            hardwareMode === 'connected'
              ? 'bg-[#39FF88]/15 text-[#39FF88] border border-[#39FF88]/40'
              : 'bg-amber-400/15 text-amber-400 border border-amber-400/40'
          }`}>
            {hardwareMode === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{hardwareMode === 'connected' ? 'Arduino Ativo' : 'Simulação'}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-[#8C9891] font-bold uppercase block">
              Modo de Operação
            </label>
            <select
              value={hardwareMode}
              onChange={(e) => setHardwareMode(e.target.value)}
              className="w-full bg-[#0C1A11] border border-[#1B3624] rounded-xl px-4 py-2.5 text-[#F5F7F5] text-xs font-mono focus:outline-none focus:border-amber-400"
            >
              <option value="connected">Conectado (Arduino via Ponte Serial Python)</option>
              <option value="simulation">Modo Simulação (Mouse / Testes de Bancada)</option>
            </select>
            <p className="text-[11px] text-[#8C9891]">
              Fluxo oficial: Arduino Uno → Ponte Python (`ponte_serial_motion_tennis.py`) → API REST → Node.js.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0C1A11] border border-[#1B3624] text-xs space-y-1.5">
            <div className="text-[10px] text-[#8C9891] uppercase font-bold">Estado do Subsistema</div>
            <div className="text-sm font-bold text-[#F5F7F5]">
              {hardwareMode === 'connected'
                ? 'Aguardando / Processando pacotes na rota POST /api/hardware/arduino/reading'
                : 'Modo simulação habilitado no navegador.'}
            </div>
            <div className="text-[11px] text-[#8C9891]">
              {lastSeen ? `Último pacote recebido em: ${new Date(lastSeen).toLocaleTimeString('pt-BR')}` : 'Nenhum pacote recente.'}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-[#08120B] border border-[#295437] space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-[#1B3624]">
          <Target className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-black text-[#F5F7F5] uppercase">
            3. Mapeamento Físico dos Sensores (Montagem Real)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-[#0C1A11] border border-cyan-400/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-cyan-300">SENSOR S1</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-400/30">
                Pino D2
              </span>
            </div>
            <div className="text-sm font-bold text-[#F5F7F5]">Canto Inferior Esquerdo</div>
            <div className="text-xs text-amber-400 font-bold">Origem Cartesiana (0, 0)</div>
            <p className="text-[10px] text-[#8C9891]">Cabo de 3m. Ponto de referência inicial de tempo.</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0C1A11] border border-cyan-400/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-cyan-300">SENSOR S2</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-400/30">
                Pino D3
              </span>
            </div>
            <div className="text-sm font-bold text-[#F5F7F5]">Canto Superior Esquerdo</div>
            <div className="text-xs text-amber-400 font-bold">Coordenada (0, {activePresetConfig.heightM}m)</div>
            <p className="text-[10px] text-[#8C9891]">Cabo de 4m. Sensor de altura máxima da parede.</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0C1A11] border border-cyan-400/40 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-cyan-300">SENSOR S3</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-400/30">
                Pino D4
              </span>
            </div>
            <div className="text-sm font-bold text-[#F5F7F5]">Canto Inferior Direito</div>
            <div className="text-xs text-amber-400 font-bold">Coordenada ({activePresetConfig.widthM}m, 0)</div>
            <p className="text-[10px] text-[#8C9891]">Cabo de 5m. Sensor de largura máxima da parede.</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#050C07] border border-[#1B3624] space-y-3">
          <div className="flex items-center justify-between text-xs text-[#8C9891]">
            <span>Layout Físico dos 6 Alvos com os 3 Sensores</span>
            <span className="text-amber-400 font-bold">Canto Superior Direito: SEM SENSOR</span>
          </div>

          <div className="relative aspect-[3/2] max-w-md mx-auto rounded-xl border-2 border-[#1B3624] bg-[#08120B] p-2">
            <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-400 text-[10px] font-bold text-cyan-300 shadow">
              S2 (0, {activePresetConfig.heightM}m)
            </div>

            <div className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-[#08120B] border border-dashed border-[#1B3624] text-[9px] text-[#8C9891]">
              Sem sensor
            </div>

            <div className="absolute bottom-2 left-2 z-20 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-400 text-[10px] font-bold text-cyan-300 shadow">
              S1 (0, 0)
            </div>

            <div className="absolute bottom-2 right-2 z-20 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-400 text-[10px] font-bold text-cyan-300 shadow">
              S3 ({activePresetConfig.widthM}m, 0)
            </div>

            <div className="grid grid-cols-3 grid-rows-2 gap-2 h-full py-6 px-1">
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <div
                  key={num}
                  className="rounded-lg border border-[#1B3624] bg-[#0C1A11]/60 flex items-center justify-center text-xs font-bold text-[#8C9891]"
                >
                  Alvo {num}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-[#08120B] border border-[#295437] space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-[#1B3624]">
          <Sliders className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-black text-[#F5F7F5] uppercase">
            4. Calibração Essencial TDOA
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[#8C9891] uppercase font-bold block">
              Velocidade do Som (m/s)
            </label>
            <input
              type="number"
              value={propagationSpeed}
              onChange={(e) => setPropagationSpeed(e.target.value)}
              className="w-full bg-[#0C1A11] border border-[#1B3624] rounded-xl px-4 py-2.5 text-[#F5F7F5] text-xs font-mono focus:outline-none focus:border-amber-400"
              placeholder="343"
            />
            <p className="text-[10px] text-[#8C9891]">Padrão: 343 m/s no ar a 20°C.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#8C9891] uppercase font-bold block">
              Janela de Agrupamento (µs)
            </label>
            <input
              type="number"
              value={groupingWindow}
              onChange={(e) => setGroupingWindow(e.target.value)}
              className="w-full bg-[#0C1A11] border border-[#1B3624] rounded-xl px-4 py-2.5 text-[#F5F7F5] text-xs font-mono focus:outline-none focus:border-amber-400"
              placeholder="25000"
            />
            <p className="text-[10px] text-[#8C9891]">Padrão: 25.000 µs (25 ms) para cobrir até 8m de diagonal.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#8C9891] uppercase font-bold block">
              Status da Calibração
            </label>
            <label className="flex items-center gap-2 p-3 rounded-xl bg-[#0C1A11] border border-[#1B3624] cursor-pointer">
              <input
                type="checkbox"
                checked={calibrated}
                onChange={(e) => setCalibrated(e.target.checked)}
                className="w-4 h-4 accent-amber-400 rounded"
              />
              <span className="text-xs text-[#F5F7F5] font-bold">
                {calibrated ? 'Calibração Ativa' : 'Pendente de Medição'}
              </span>
            </label>
            <p className="text-[10px] text-[#8C9891]">Permite que o algoritmo TDOA calcule os alvos oficiais.</p>
          </div>
        </div>

        <div className="pt-4 border-t border-[#1B3624] flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase flex items-center space-x-2 hover:bg-amber-300 transition shadow-md"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Gravando Alterações...' : 'Salvar Todas as Configurações'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
