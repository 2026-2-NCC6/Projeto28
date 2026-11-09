import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart2, 
  Target, 
  Activity, 
  Zap, 
  Shield, 
  Sparkles, 
  Compass, 
  ArrowRight, 
  GraduationCap,
  TrendingUp
} from 'lucide-react';
import { api } from '../services/api';

export default function StatisticsPage() {
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAttributes();
  }, []);

  const loadAttributes = async () => {
    try {
      const data = await api.getAttributes();
      setAttributes(data || []);
    } catch (e) {
      console.error('Erro ao carregar estatísticas:', e);
    } finally {
      setLoading(false);
    }
  };

  const attributeIcons = {
    precision: Target,
    consistency: Activity,
    speed: Zap,
    control: Shield,
    reflex: Sparkles,
    strategy: Compass
  };

  const attributeInterpretations = {
    precision: 'Capacidade de direcionar a bola aos sensores periféricos e acertar o centro.',
    consistency: 'Manutenção de ritmo motor sem oscilação técnica ao longo de longos rallies.',
    speed: 'Aceleração do golpe e potência medida em km/h no momento do contato.',
    control: 'Sensibilidade de raquete para alternar profundidade e amortecimentos precisos.',
    reflex: 'Velocidade de reação e leitura visual em situações de alta pressão temporal.',
    strategy: 'Tomada de decisão tática e construção de pontos explorando áreas vazias.'
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fadeIn">
      
      
      <div className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm transition-colors">
        <div>
          <h1 className="text-2xl font-black text-[#142B3D] dark:text-[#F1F5F9] flex items-center space-x-2">
            <BarChart2 className="w-6 h-6 text-[#2563EB] dark:text-[#B8F044]" />
            <span>Estatísticas & Habilidades do Atleta</span>
          </h1>
          <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1">
            Métricas de desempenho calculadas com base nos impactos registrados no equipamento Motion Tennis.
          </p>
        </div>

        
        <button
          onClick={() => navigate('/app/academy')}
          className="px-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] text-[#142B3D] dark:text-[#B8F044] hover:bg-[#F4F6F8] dark:hover:bg-[#22313D] text-xs font-mono font-bold flex items-center space-x-2 transition-all shadow-xs"
        >
          <GraduationCap className="w-4 h-4 text-[#2563EB] dark:text-[#B8F044]" />
          <span>Ver Motion Tennis Academy</span>
        </button>
      </div>

      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {attributes.map((attr) => {
          const Icon = attributeIcons[attr.key] || Target;
          const pct = Math.min(100, Math.round((attr.xp / attr.xp_next) * 100));

          return (
            <div
              key={attr.key}
              className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] flex flex-col justify-between space-y-4 hover:border-[#B8F044] transition-all shadow-sm"
            >
              <div className="space-y-3">
                
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#2563EB] dark:text-[#B8F044] shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] uppercase">
                        {attr.name}
                      </h3>
                      <span className="text-xs font-mono font-bold text-[#2563EB] dark:text-[#B8F044]">
                        LV. {attr.level} / {attr.max_level}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-mono text-[#475569] dark:text-[#A8BAC8]">
                    {attr.xp} / {attr.xp_next} XP
                  </span>
                </div>

                
                <div className="w-full h-2 rounded-full bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2563EB] to-[#B8F044] rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>

                
                <p className="text-xs text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                  {attributeInterpretations[attr.key] || attr.objective}
                </p>

                
                <div className="p-3 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[11px] font-mono text-[#475569] dark:text-[#A8BAC8] space-y-1">
                  <div>
                    <span className="text-[#2563EB] dark:text-[#B8F044] font-bold">Foco: </span>
                    {attr.objective || 'Manter regularidade nas séries de treino.'}
                  </div>
                </div>

              </div>

              
              <div className="pt-2">
                <button
                  onClick={() => navigate(`/app/academy/${attr.key}`)}
                  className="w-full py-3 px-4 rounded-xl btn-sport-outline hover:border-[#B8F044] text-xs font-mono font-bold tracking-wider uppercase flex items-center justify-center space-x-2 transition-all shadow-xs"
                >
                  <GraduationCap className="w-4 h-4 text-[#2563EB] dark:text-[#B8F044]" />
                  <span>COMO MELHORAR</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
