import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  GraduationCap, 
  Video, 
  Clock, 
  BarChart, 
  CheckCircle2, 
  BookOpen, 
  Sparkles 
} from 'lucide-react';
import { api } from '../services/api';

export default function SkillAcademyPage() {
  const { skill } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSkillData();
  }, [skill]);

  const loadSkillData = async () => {
    try {
      const res = await api.getAcademySkillContent(skill);
      setData(res);
    } catch (e) {
      console.error('Erro ao carregar conteúdo da habilidade:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs font-mono text-[#2563EB] dark:text-[#B8F044] animate-pulse">
        Carregando módulos da Academy...
      </div>
    );
  }

  if (!data?.skillName) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-sm text-[#475569] dark:text-[#A8BAC8]">Habilidade não encontrada na Academy.</p>
        <Link to="/app/academy" className="text-xs text-[#2563EB] dark:text-[#B8F044] underline font-mono">
          Voltar para Academy
        </Link>
      </div>
    );
  }

  const attr = data.attribute;
  const pct = attr && attr.xp_next > 0 ? Math.min(100, Math.round((attr.xp / attr.xp_next) * 100)) : 0;

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-fadeIn">
      
      
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/app/academy')}
          className="inline-flex items-center space-x-2 text-xs font-mono text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>VOLTAR PARA ACADEMY</span>
        </button>

        <Link
          to="/app/statistics"
          className="text-xs font-mono text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]"
        >
          Ver Todas as Estatísticas
        </Link>
      </div>

      
      <div className="p-6 sm:p-8 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] space-y-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono text-[#2563EB] dark:text-[#B8F044] uppercase tracking-widest font-bold">
              MOTION TENNIS ACADEMY • MÓDULO ESPECIALIZADO
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-[#142B3D] dark:text-[#F1F5F9] uppercase mt-1">
              {data.skillName}
            </h1>
          </div>

          {attr && (
            <div className="text-right font-mono">
              <span className="text-xs text-[#475569] dark:text-[#A8BAC8] block">Nível Atual</span>
              <span className="text-2xl font-black text-[#2563EB] dark:text-[#B8F044]">
                LV. {attr.level} / {attr.max_level}
              </span>
            </div>
          )}
        </div>

        {attr && (
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs font-mono text-[#475569] dark:text-[#A8BAC8]">
              <span>Desempenho Atual</span>
              <span className="text-[#2563EB] dark:text-[#B8F044] font-bold">{attr.xp} / {attr.xp_next} XP</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#2563EB] to-[#B8F044] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              ></div>
            </div>
          </div>
        )}

        <p className="text-xs text-[#475569] dark:text-[#A8BAC8] leading-relaxed pt-2 border-t border-[#B8C6D0] dark:border-[#344653]">
          {attr?.coach_tip || 'Aprimore os fundamentos técnicos com os conteúdos didáticos abaixo.'}
        </p>
      </div>

      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#142B3D] dark:text-[#F1F5F9] flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-[#2563EB] dark:text-[#B8F044]" />
            <span>CONTEÚDOS PARA MELHORAR</span>
          </h2>
          <span className="text-xs font-mono text-[#475569] dark:text-[#A8BAC8]">
            {data.cards?.length || 0} Vídeo-Aulas Planejadas
          </span>
        </div>

        <div className="space-y-4">
          {(data.cards || []).map((card) => (
            <div
              key={card.id}
              className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-[#142B3D] dark:text-[#B8F044] bg-[#E8EDF1] dark:bg-[#18242E] px-2 py-0.5 rounded font-bold border border-[#B8C6D0] dark:border-[#344653]">
                    {card.difficulty}
                  </span>
                  <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8] flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{card.duration}</span>
                  </span>
                </div>

                <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9]">
                  {card.title}
                </h3>

                <p className="text-xs text-[#475569] dark:text-[#A8BAC8] leading-relaxed">
                  {card.description}
                </p>
              </div>

              
              <div className="shrink-0 self-end sm:self-center">
                <div className="px-4 py-2.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-amber-500 font-mono text-xs font-bold tracking-wider uppercase flex items-center space-x-2">
                  <Video className="w-4 h-4 text-amber-500" />
                  <span>{card.status || 'VÍDEO EM BREVE'}</span>
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>

      
      <div className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] text-center space-y-3 shadow-sm">
        <h4 className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9]">
          Ciclo de Desenvolvimento do Atleta
        </h4>
        <div className="flex items-center justify-center space-x-3 text-xs font-mono text-[#2563EB] dark:text-[#B8F044]">
          <span>DADO</span>
          <span>→</span>
          <span>ENTENDER</span>
          <span>→</span>
          <span className="font-bold underline">APRENDER</span>
          <span>→</span>
          <span>PRATICAR</span>
          <span>→</span>
          <span>MEDIR</span>
        </div>
        <p className="text-[11px] text-[#475569] dark:text-[#A8BAC8]">
          Esta área é focada em estudo técnico. Quando desejar aplicar em quadra, acesse a tela <strong>Jogar</strong> pelo menu principal.
        </p>
      </div>

    </div>
  );
}
