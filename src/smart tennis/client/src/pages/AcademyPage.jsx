import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  GraduationCap, 
  Target, 
  Activity, 
  Zap, 
  Shield, 
  Sparkles, 
  Compass, 
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { api } from '../services/api';

export default function AcademyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAcademy();
  }, []);

  const loadAcademy = async () => {
    try {
      const res = await api.getAcademyOverview();
      setData(res);
    } catch (e) {
      console.error('Erro ao carregar Academy:', e);
    } finally {
      setLoading(false);
    }
  };

  const skillIcons = {
    precision: Target,
    consistency: Activity,
    speed: Zap,
    control: Shield,
    reflex: Sparkles,
    strategy: Compass
  };

  const skillDescriptions = {
    precision: 'Técnicas de mira, controle angular da raquete e centralização no alvo.',
    consistency: 'Exercícios para redução de erros não forçados e regularidade motora.',
    speed: 'Mecânica de aceleração corporal e velocidade de saída da bola.',
    control: 'Sensibilidade de toque, variação de profundidade e controle direcional.',
    reflex: 'Treinos cognitivos de leitura antecipada e agilidade de reação.',
    strategy: 'Construção tática de pontos, padrões de jogo e exploração de alvos.'
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fadeIn">
      
      
      <div className="p-8 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] text-center space-y-3 relative overflow-hidden shadow-sm transition-colors">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#2563EB] dark:text-[#B8F044] mb-2 shadow-xs">
          <GraduationCap className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#142B3D] dark:text-[#F1F5F9] tracking-tight">
          MOTION TENNIS ACADEMY
        </h1>
        <p className="text-sm text-[#475569] dark:text-[#A8BAC8] max-w-xl mx-auto leading-relaxed">
          Conteúdos personalizados para desenvolver cada aspecto do seu jogo. Aprenda a teoria biomecânica antes de praticar na quadra.
        </p>
      </div>

      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.skills && Object.values(data.skills).map((skill) => {
          const Icon = skillIcons[skill.key] || Target;

          return (
            <div
              key={skill.key}
              className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] transition-all flex flex-col justify-between space-y-4 shadow-sm group"
            >
              <div className="space-y-3">
                
                
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#2563EB] dark:text-[#B8F044] group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono font-bold text-[#2563EB] dark:text-[#B8F044] bg-[#E8EDF1] dark:bg-[#18242E] px-2.5 py-0.5 rounded border border-[#B8C6D0] dark:border-[#344653]">
                    LV. {skill.level} / {skill.max_level}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] uppercase group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] transition-colors">
                    {skill.name}
                  </h3>
                  <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1.5 leading-relaxed">
                    {skillDescriptions[skill.key] || skill.objective}
                  </p>
                </div>

                <div className="flex items-center space-x-2 text-[11px] font-mono text-[#475569] dark:text-[#A8BAC8] pt-2 border-t border-[#B8C6D0] dark:border-[#344653]">
                  <BookOpen className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#B8F044]" />
                  <span>{skill.cards?.length || 3} Módulos Técnicos</span>
                </div>

              </div>

              
              <div className="pt-2">
                <button
                  onClick={() => navigate(`/app/academy/${skill.key}`)}
                  className="w-full py-3 px-4 rounded-xl btn-sport-lime font-bold text-xs tracking-wider uppercase flex items-center justify-center space-x-2 shadow-xs transition-transform active:scale-95"
                >
                  <span>VER CONTEÚDO</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
