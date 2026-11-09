import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Clock,
  CheckCircle2,
  Circle,
  User,
  Sparkles,
  BookOpen,
  ShieldAlert,
  GraduationCap,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

function isSafeYouTubeEmbedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\/[a-zA-Z0-9_-]{11}(\?.*)?$/.test(url.trim());
}

export default function AcademyLessonPage() {
  const { id } = useParams();
  const { user, isGuest } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isInsideAppLayout = location.pathname.startsWith('/app');
  const baseAcademyPath = isInsideAppLayout ? '/app/academy' : '/academy';

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(false);

  const loadLesson = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAcademyLessonDetail(id);
      setDetail(res);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar esta aula.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  const handleToggleCompleted = async () => {
    if (!user || isGuest || !detail?.lesson) return;
    setToggling(true);
    try {
      const nextCompleted = !detail.lesson.completed;
      await api.setAcademyLessonProgress(detail.lesson.id, nextCompleted);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              lesson: { ...prev.lesson, completed: nextCompleted }
            }
          : prev
      );
    } catch (err) {
      alert(err.message || 'Erro ao salvar progresso da aula.');
    } finally {
      setToggling(false);
    }
  };

  const lesson = detail?.lesson || null;
  const relatedLessons = detail?.relatedLessons || [];
  const safeEmbedUrl = lesson?.embed_url && isSafeYouTubeEmbedUrl(lesson.embed_url)
    ? `${lesson.embed_url}${lesson.embed_url.includes('?') ? '&' : '?'}rel=0&modestbranding=1`
    : null;

  const pageBody = (
    <div className="space-y-6 pb-12" data-testid="academy-lesson-playback-page">
      
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to={baseAcademyPath}
          data-testid="btn-back-to-catalog"
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] text-xs font-mono text-[#142B3D] dark:text-[#F1F5F9] hover:border-[#B8F044] hover:text-[#2563EB] dark:hover:text-[#B8F044] transition-colors shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Catálogo da Academy</span>
        </Link>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#B8F044]/20 border border-[#B8F044]/50 text-[#142B3D] dark:text-[#B8F044] text-[11px] font-mono uppercase font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acesso Gratuito • Motion Tennis Academy</span>
          </span>
        </div>
      </div>

      {loading ? (
        <div className="p-12 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] text-center font-mono text-sm text-[#2563EB] dark:text-[#B8F044] shadow-sm">
          CARREGANDO VIDEOAULA...
        </div>
      ) : error || !lesson ? (
        <div
          data-testid="academy-lesson-error"
          className="p-8 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-rose-500/40 text-center space-y-4 shadow-sm"
        >
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-[#142B3D] dark:text-[#F1F5F9]">Aula Indisponível</h2>
          <p className="text-xs text-[#475569] dark:text-[#A8BAC8] max-w-md mx-auto">
            {error || 'Esta aula não foi encontrada ou ainda não foi publicada.'}
          </p>
          <Link
            to={baseAcademyPath}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl btn-sport-lime font-bold text-xs uppercase"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retornar ao Catálogo</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 space-y-6">
            
            <div className="rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] overflow-hidden shadow-sm">
              {safeEmbedUrl ? (
                <div className="relative aspect-video w-full bg-black">
                  <iframe
                    data-testid="academy-youtube-iframe"
                    src={safeEmbedUrl}
                    title={lesson.title}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="aspect-video w-full bg-[#E8EDF1] dark:bg-[#18242E] flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <BookOpen className="w-10 h-10 text-[#475569] dark:text-[#A8BAC8]" />
                  <p className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9]">
                    Vídeo ainda não disponível para reprodução
                  </p>
                  <p className="text-xs text-[#475569] dark:text-[#A8BAC8]">
                    Esta aula ainda aguarda vinculação de link válido do YouTube pelo administrador.
                  </p>
                </div>
              )}

              
              <div className="p-6 sm:p-8 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      data-testid="lesson-detail-category"
                      className="px-3 py-1 rounded-lg bg-[#B8F044]/20 border border-[#B8F044]/40 text-xs font-mono uppercase font-bold text-[#142B3D] dark:text-[#B8F044]"
                    >
                      {lesson.category}
                    </span>
                    <span
                      data-testid="lesson-detail-level"
                      className="px-3 py-1 rounded-lg bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-xs font-mono uppercase text-[#142B3D] dark:text-[#F1F5F9]"
                    >
                      Nível: {lesson.level}
                    </span>
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-xs font-mono text-[#475569] dark:text-[#A8BAC8]">
                      <Clock className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#B8F044]" />
                      <span data-testid="lesson-detail-duration">{lesson.duration}</span>
                    </span>
                  </div>

                  
                  {user && !isGuest ? (
                    <button
                      type="button"
                      data-testid="btn-lesson-detail-complete"
                      disabled={toggling}
                      onClick={handleToggleCompleted}
                      className={`inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition-all ${
                        lesson.completed
                          ? 'bg-[#B8F044] text-[#101820] shadow-sm'
                          : 'btn-sport-outline'
                      }`}
                    >
                      {lesson.completed ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Aula Concluída ✓</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-4 h-4" />
                          <span>Marcar como Concluída</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <span
                      data-testid="visitor-free-playback-badge"
                      className="px-3 py-1.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[11px] font-mono text-[#475569] dark:text-[#A8BAC8]"
                    >
                      Modo Visitante • Reprodução Gratuita
                    </span>
                  )}
                </div>

                <div>
                  <h1
                    data-testid="lesson-detail-title"
                    className="text-xl sm:text-2xl font-black text-[#142B3D] dark:text-[#F1F5F9] leading-snug"
                  >
                    {lesson.title}
                  </h1>
                </div>

                
                <div className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#2563EB] dark:text-[#B8F044]">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[#475569] dark:text-[#A8BAC8] block">
                        Instrutor / Professor Responsável
                      </span>
                      <span className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9]" data-testid="lesson-detail-instructor">
                        {lesson.instructor ? lesson.instructor : 'A definir pelo professor'}
                      </span>
                    </div>
                  </div>

                  {lesson.youtube_url && (
                    <a
                      href={lesson.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-xs font-mono text-[#2563EB] dark:text-[#B8F044] hover:underline"
                    >
                      <span>Abrir também no YouTube</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                
                <div className="space-y-2 pt-2 border-t border-[#B8C6D0] dark:border-[#344653]">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-[#2563EB] dark:text-[#B8F044] font-bold">
                    Descrição da Aula & Objetivos Técnicos
                  </h3>
                  <p
                    data-testid="lesson-detail-description"
                    className="text-sm text-[#475569] dark:text-[#A8BAC8] leading-relaxed whitespace-pre-line"
                  >
                    {lesson.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          
          <div className="space-y-4">
            <div className="p-5 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#B8C6D0] dark:border-[#344653] pb-3">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#2563EB] dark:text-[#B8F044] block">
                    Continue Estudando
                  </span>
                  <h2 className="text-base font-bold text-[#142B3D] dark:text-[#F1F5F9]">
                    Aulas Relacionadas
                  </h2>
                </div>
                <Play className="w-4 h-4 text-[#2563EB] dark:text-[#B8F044]" />
              </div>

              {relatedLessons.length > 0 ? (
                <div className="space-y-3" data-testid="related-lessons-list">
                  {relatedLessons.map((rel) => (
                    <div
                      key={rel.id}
                      onClick={() => navigate(`${baseAcademyPath}/aula/${rel.id}`)}
                      className="p-3 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] cursor-pointer transition-all group flex items-start space-x-3"
                    >
                      <div className="w-20 aspect-video rounded-lg bg-[#F4F6F8] dark:bg-[#22313D] overflow-hidden shrink-0 relative border border-[#B8C6D0] dark:border-[#344653]">
                        {rel.thumbnail ? (
                          <img
                            src={rel.thumbnail}
                            alt={rel.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-4 h-4 text-[#2563EB] dark:text-[#B8F044]" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-mono text-[#2563EB] dark:text-[#B8F044] uppercase block truncate">
                          {rel.category}
                        </span>
                        <h4 className="text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] group-hover:text-[#2563EB] dark:group-hover:text-[#B8F044] transition-colors line-clamp-2">
                          {rel.title}
                        </h4>
                        <div className="flex items-center space-x-2 mt-1 text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8]">
                          <span>{rel.duration}</span>
                          <span>•</span>
                          <span>{rel.level}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-center space-y-2">
                  <p className="text-xs text-[#475569] dark:text-[#A8BAC8]">
                    Outras aulas relacionadas aparecerão aqui conforme forem publicadas no catálogo.
                  </p>
                </div>
              )}

              <Link
                to={baseAcademyPath}
                className="w-full py-3 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] text-xs font-mono text-[#142B3D] dark:text-[#F1F5F9] flex items-center justify-center space-x-1.5 transition-colors"
              >
                <span>Ver Todas as Aulas do Catálogo</span>
                <ChevronRight className="w-4 h-4 text-[#2563EB] dark:text-[#B8F044]" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!isInsideAppLayout) {
    return (
      <div className="min-h-screen bg-[#DCE3E8] dark:bg-[#101820] text-[#142B3D] dark:text-[#F1F5F9] flex flex-col font-sans transition-colors duration-200">
        <header className="sticky top-0 z-40 h-16 bg-[#142B3D]/95 dark:bg-[#0D1B2A]/95 backdrop-blur-md border-b border-[#1C3A52] dark:border-[#344653] px-4 lg:px-8 flex items-center justify-between text-white shadow-sm">
          <div className="flex items-center space-x-4">
            <Link
              to="/app/academy"
              className="inline-flex items-center space-x-2 text-xs font-mono text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Catálogo Academy</span>
            </Link>
            <div className="h-5 w-px bg-[#1C3A52]" />
            <div className="flex items-center space-x-2">
              <GraduationCap className="w-5 h-5 text-[#B8F044]" />
              <span className="font-black tracking-wider text-sm uppercase">
                MOTION TENNIS <span className="text-[#B8F044]">ACADEMY</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {user ? (
              <Link
                to={user.role === 'admin' ? '/admin/overview' : '/app/dashboard'}
                className="btn-sport-lime px-3.5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider"
              >
                Meu Painel
              </Link>
            ) : (
              <Link
                to="/login"
                className="btn-sport-lime px-3.5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider"
              >
                Entrar / Jogar
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {pageBody}
        </main>
      </div>
    );
  }

  return pageBody;
}
