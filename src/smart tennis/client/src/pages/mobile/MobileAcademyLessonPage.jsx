import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  GraduationCap,
  Play,
  CheckCircle2,
  Clock,
  User,
  Sparkles,
  Share2,
  AlertCircle,
  Video
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function MobileAcademyLessonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();

  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [relatedLessons, setRelatedLessons] = useState([]);

  useEffect(() => {
    loadLessonDetail();
  }, [id]);

  const loadLessonDetail = async () => {
    setLoading(true);
    try {
      let data = await api.getAcademyLessonDetail(id).catch(() => null);

      if (!data) {
        const catalog = await api.getAcademyCatalog().catch(() => null);
        const all = [
          ...(catalog?.lessons || []),
          ...(catalog?.initialModulesPreview || [])
        ];
        data = all.find((l) => l.id === id || `slot_${l.slot_number}` === id) || null;
      }

      if (data) {
        setLesson(data);
        setCompleted(Boolean(data.completed));

        const catalog = await api.getAcademyCatalog().catch(() => null);
        const related = (catalog?.initialModulesPreview || []).filter(
          (l) => l.id !== id && `slot_${l.slot_number}` !== id
        ).slice(0, 3);
        setRelatedLessons(related);
      }
    } catch (e) {
      console.warn('Erro ao carregar aula:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async () => {
    if (isGuest) {
      setCompleted(!completed);
      return;
    }

    setSavingProgress(true);
    try {
      const nextState = !completed;
      await api.setAcademyLessonProgress(id, nextState).catch(() => {});
      setCompleted(nextState);
    } catch (e) {
      console.warn('Erro ao salvar progresso:', e);
    } finally {
      setSavingProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-8 h-8 border-2 border-[#39FF88] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-[#8C9891]">Carregando aula...</span>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="p-6 text-center space-y-4">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-sm font-bold text-white">Aula não encontrada</h3>
        <button
          onClick={() => navigate('/mobile/academy')}
          className="py-2 px-4 rounded-xl bg-[#14301D] text-xs font-bold text-[#39FF88]"
        >
          Voltar ao Catálogo
        </button>
      </div>
    );
  }

  const embedUrl = lesson.embed_url || (lesson.youtube_video_id ? `https://www.youtube.com/embed/${lesson.youtube_video_id}` : null);

  return (
    <div className="p-4 sm:p-5 space-y-5 animate-fadeIn">
      
      
      <button
        onClick={() => navigate('/mobile/academy')}
        data-testid="btn-back-academy"
        className="flex items-center space-x-1.5 text-xs text-[#8C9891] hover:text-white transition font-mono"
      >
        <ArrowLeft className="w-4 h-4 text-[#39FF88]" />
        <span>Voltar ao Catálogo</span>
      </button>

      
      <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-black border border-[#163020] shadow-[0_0_25px_rgba(0,0,0,0.8)]">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={lesson.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-gradient-to-b from-[#0A1810] to-[#050C08]">
            <div className="w-14 h-14 rounded-full bg-[#122A1A] border border-[#39FF88]/40 flex items-center justify-center text-[#39FF88] shadow-[0_0_15px_rgba(57,255,136,0.25)]">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#39FF88] font-bold block">
                Conteúdo Oficial em Produção
              </span>
              <h4 className="text-sm font-bold text-white mt-0.5">
                {lesson.title}
              </h4>
              <p className="text-[11px] text-[#8C9891] max-w-xs mx-auto mt-1">
                A gravação técnica em quadra desta aula está sendo finalizada pela equipe Motion Tennis.
              </p>
            </div>
          </div>
        )}
      </div>

      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#14301D] text-[#39FF88] border border-[#39FF88]/30">
              {lesson.category || 'Técnica'}
            </span>
            <span className="text-[10px] font-mono text-[#8C9891]">
              {lesson.level || 'Iniciante'}
            </span>
          </div>

          <div className="flex items-center space-x-1 text-xs text-[#8C9891] font-mono">
            <Clock className="w-3.5 h-3.5 text-[#39FF88]" />
            <span>{lesson.duration || '6 min'}</span>
          </div>
        </div>

        <h1 className="text-lg font-black text-white leading-snug">
          {lesson.title}
        </h1>

        <p className="text-xs text-[#A2C7AE] leading-relaxed">
          {lesson.description || 'Domine a biomecânica correta e o direcionamento nos alvos da parede para maximizar seu índice de acertos e potência.'}
        </p>

        {lesson.instructor && (
          <div className="flex items-center space-x-2 p-3 rounded-xl bg-[#09150E] border border-[#142A1B] text-xs">
            <User className="w-4 h-4 text-[#39FF88]" />
            <span className="text-white font-bold">Instrutor: {lesson.instructor}</span>
          </div>
        )}
      </div>

      
      <div className="p-4 rounded-2xl bg-[#0A1810] border border-[#163020] space-y-2 text-center">
        <button
          onClick={handleToggleComplete}
          disabled={savingProgress}
          data-testid="btn-complete-lesson"
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition ${
            completed
              ? 'bg-[#14301D] border border-[#39FF88] text-[#39FF88]'
              : 'bg-[#39FF88] hover:bg-[#2fe677] text-slate-950 shadow-[0_0_12px_rgba(57,255,136,0.2)]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{completed ? 'Aula Concluída ✓' : 'Marcar Aula como Concluída'}</span>
        </button>

        {isGuest && (
          <span className="text-[10px] text-[#8C9891] block">
            No Modo Visitante seu progresso é temporário. Crie uma conta para salvar XP!
          </span>
        )}
      </div>

      
      {relatedLessons.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Aulas Recomendadas
          </h3>
          <div className="space-y-2">
            {relatedLessons.map((rel, idx) => (
              <div
                key={rel.id || idx}
                onClick={() => navigate(`/mobile/academy/aula/${rel.id || `slot_${rel.slot_number}`}`)}
                className="p-3 rounded-xl bg-[#08120B] hover:bg-[#0E1F15] border border-[#142A1B] flex items-center justify-between cursor-pointer transition text-xs"
              >
                <div>
                  <span className="font-bold text-white block">{rel.title}</span>
                  <span className="text-[10px] text-[#8C9891] font-mono">{rel.category} • {rel.duration}</span>
                </div>
                <Play className="w-3.5 h-3.5 text-[#39FF88]" />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
