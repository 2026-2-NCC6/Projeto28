import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Video,
  Clock,
  User,
  ExternalLink,
  Search,
  Save,
  X
} from 'lucide-react';
import { api } from '../../services/api';

const DEFAULT_CATEGORIES = [
  'Precisão & Direção',
  'Consistência & Ritmo',
  'Velocidade & Potência',
  'Controle & Sensibilidade',
  'Reflexo & Agilidade',
  'Estratégia & Tática',
  'Fundamentos do Tênis',
  'Saque & Devolução',
  'Forehand & Backhand',
  'Voleio & Jogo de Rede'
];

const EMPTY_FORM = {
  id: '',
  title: '',
  description: '',
  category: 'Precisão & Direção',
  level: 'Iniciante',
  duration: '10 min',
  instructor: '',
  youtube_url: '',
  thumbnail: '',
  display_order: 1,
  slot_number: '',
  published: false
};

export default function AdminAcademyPage() {
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ytPreview, setYtPreview] = useState(null);

  const [deletingLesson, setDeletingLesson] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadLessons = useCallback(async () => {
    try {
      setError(null);
      const res = await api.admin.getAcademyLessons();
      setAdminData(res);
    } catch (err) {
      setError(err.message || 'Erro ao carregar aulas da Academy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLessons();
  }, [loadLessons]);

  const showToast = (msg, type = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleOpenCreate = () => {
    const nextOrder = (adminData?.lessons?.length || 0) + 1;
    setEditingLesson(null);
    setFormData({
      ...EMPTY_FORM,
      display_order: nextOrder
    });
    setFormError(null);
    setYtPreview(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (lesson) => {
    setEditingLesson(lesson);
    setFormData({
      id: lesson.id,
      title: lesson.title || '',
      description: lesson.description || '',
      category: lesson.category || 'Precisão & Direção',
      level: lesson.level || 'Iniciante',
      duration: lesson.duration || '10 min',
      instructor: lesson.instructor || '',
      youtube_url: lesson.youtube_url || '',
      thumbnail: lesson.thumbnail || '',
      display_order: lesson.display_order || 1,
      slot_number: lesson.slot_number || '',
      published: Boolean(lesson.published)
    });
    setFormError(null);
    setYtPreview(
      lesson.embed_url
        ? {
            embedUrl: lesson.embed_url,
            defaultThumbnail: lesson.thumbnail
          }
        : null
    );
    setIsModalOpen(true);
  };

  const handleValidateYoutubeUrl = async (urlToValidate) => {
    const raw = urlToValidate !== undefined ? urlToValidate : formData.youtube_url;
    if (!raw || !raw.trim()) {
      setYtPreview(null);
      return;
    }
    try {
      const parsed = await api.admin.validateYoutubeUrl(raw.trim());
      setYtPreview(parsed);
      setFormError(null);
      if (!formData.thumbnail && parsed.defaultThumbnail) {
        setFormData((prev) => ({ ...prev, thumbnail: parsed.defaultThumbnail }));
      }
    } catch (err) {
      setYtPreview(null);
      setFormError(err.message || 'URL do YouTube inválida.');
    }
  };

  const handleSaveLesson = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category.trim(),
        level: formData.level,
        duration: formData.duration.trim(),
        instructor: formData.instructor.trim(),
        youtube_url: formData.youtube_url.trim(),
        thumbnail: formData.thumbnail.trim(),
        display_order: Number(formData.display_order) || 1,
        slot_number: formData.slot_number === '' ? null : Number(formData.slot_number),
        published: Boolean(formData.published)
      };

      if (editingLesson) {
        await api.admin.updateAcademyLesson(editingLesson.id, payload);
        showToast(`Aula "${payload.title}" atualizada com sucesso!`);
      } else {
        await api.admin.createAcademyLesson(payload);
        showToast(`Nova aula "${payload.title}" criada com sucesso!`);
      }

      setIsModalOpen(false);
      await loadLessons();
    } catch (err) {
      setFormError(err.message || 'Falha ao salvar aula.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (lesson) => {
    try {
      const nextPub = !lesson.published;
      await api.admin.setAcademyLessonPublished(lesson.id, nextPub);
      showToast(
        nextPub
          ? `Aula "${lesson.title}" publicada no catálogo gratuito!`
          : `Aula "${lesson.title}" despublicada (oculta do catálogo público).`
      );
      await loadLessons();
    } catch (err) {
      showToast(err.message || 'Não foi possível alterar o status de publicação.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingLesson) return;
    setDeleting(true);
    try {
      await api.admin.deleteAcademyLesson(deletingLesson.id);
      showToast(`Aula "${deletingLesson.title}" excluída com sucesso.`);
      setDeletingLesson(null);
      await loadLessons();
    } catch (err) {
      showToast(err.message || 'Erro ao excluir aula.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleShowComingSoon = async () => {
    if (!adminData) return;
    try {
      const nextVal = !adminData.showComingSoon;
      await api.admin.updateAcademySettings({ showComingSoon: nextVal });
      await loadLessons();
      showToast(
        nextVal
          ? 'Cronograma das 12 aulas planejadas ("Em breve") visível no catálogo.'
          : 'Cronograma de aulas "Em breve" ocultado para visitantes.'
      );
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar configuração.', 'error');
    }
  };

  const lessons = adminData?.lessons || [];
  const filteredLessons = lessons.filter((l) => {
    if (filterStatus === 'PUBLISHED' && !l.published) return false;
    if (filterStatus === 'UNPUBLISHED' && l.published) return false;
    if (filterStatus === 'SLOTS12' && (!l.slot_number || l.slot_number > 12)) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      return (
        l.title?.toLowerCase().includes(q) ||
        l.category?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        l.instructor?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="p-8 text-center font-mono text-sm text-[#39FF88]">
        CARREGANDO GERENCIADOR DA MOTION TENNIS ACADEMY...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" data-testid="admin-academy-page">
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0C1A11] p-6 rounded-2xl border border-[#1B3624]">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <GraduationCap className="w-5 h-5 text-[#39FF88]" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#39FF88] font-bold">
              Administração de Conteúdo • Acesso Público Gratuito
            </span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-[#F5F7F5]">
            Gerenciar Motion Tennis Academy
          </h1>
          <p className="text-xs text-[#8C9891]">
            Cadastre, edite, organize os 12 slots iniciais e publique videoaulas oficiais do YouTube.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/app/academy"
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] hover:border-[#39FF88]/50 text-xs font-mono text-[#F5F7F5] transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-[#39FF88]" />
            <span>Ver Academy do Atleta</span>
          </Link>

          <button
            type="button"
            data-testid="btn-admin-new-lesson"
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#39FF88] text-[#07110B] font-black text-xs uppercase tracking-wider hover:bg-[#1FA855] transition-colors shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Videoaula</span>
          </button>
        </div>
      </div>

      
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-mono flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-rose-950/50 border-rose-500/50 text-rose-300'
              : 'bg-[#102216] border-[#39FF88]/50 text-[#39FF88]'
          }`}
        >
          <span>{feedback.msg}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#0C1A11] border border-[#1B3624]">
          <span className="text-[10px] font-mono uppercase text-[#8C9891] block">Total de Registros</span>
          <span className="text-2xl font-black text-[#F5F7F5] font-mono" data-testid="admin-total-lessons">
            {adminData?.totalCount || 0}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0C1A11] border border-[#39FF88]/30">
          <span className="text-[10px] font-mono uppercase text-[#39FF88] block">Aulas Publicadas (Públicas)</span>
          <span className="text-2xl font-black text-[#39FF88] font-mono" data-testid="admin-published-lessons">
            {adminData?.publishedCount || 0}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0C1A11] border border-[#1B3624]">
          <span className="text-[10px] font-mono uppercase text-[#8C9891] block">Grade Inicial Estruturada</span>
          <span className="text-2xl font-black text-amber-300 font-mono">
            {adminData?.initialSlotsCount || 12} Slots
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0C1A11] border border-[#1B3624] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#8C9891] block">Slots &quot;Em breve&quot;</span>
            <span className="text-xs font-bold text-[#F5F7F5]">
              {adminData?.showComingSoon ? 'Visíveis na Grade' : 'Ocultos'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleToggleShowComingSoon}
            className="px-3 py-1.5 rounded-lg bg-[#07110B] border border-[#1B3624] hover:border-[#39FF88]/50 text-[11px] font-mono text-[#39FF88]"
          >
            Alternar
          </button>
        </div>
      </div>

      
      <div className="p-4 rounded-2xl bg-[#0C1A11] border border-[#1B3624] flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'ALL', label: `Todas (${lessons.length})` },
            { key: 'SLOTS12', label: '12 Aulas Iniciais' },
            { key: 'PUBLISHED', label: `Publicadas (${adminData?.publishedCount || 0})` },
            { key: 'UNPUBLISHED', label: `Não Publicadas (${adminData?.unpublishedCount || 0})` }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterStatus(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-colors ${
                filterStatus === tab.key
                  ? 'bg-[#39FF88] text-[#07110B] font-bold'
                  : 'bg-[#07110B] text-[#8C9891] border border-[#1B3624] hover:text-[#F5F7F5]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#8C9891] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar aulas..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#07110B] border border-[#1B3624] text-xs text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
          />
        </div>
      </div>

      
      <div className="rounded-2xl bg-[#0C1A11] border border-[#1B3624] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1B3624] bg-[#07110B]/60 text-[10px] font-mono uppercase text-[#8C9891]">
                <th className="py-3.5 px-4">Ordem / Slot</th>
                <th className="py-3.5 px-4">Aula & Descrição</th>
                <th className="py-3.5 px-4">Categoria & Nível</th>
                <th className="py-3.5 px-4">Professor & Duração</th>
                <th className="py-3.5 px-4">Vídeo YouTube</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B3624]/60 text-xs">
              {filteredLessons.map((lesson) => (
                <tr
                  key={lesson.id}
                  data-testid={`admin-lesson-row-${lesson.id}`}
                  className="hover:bg-[#102216]/30 transition-colors"
                >
                  <td className="py-3.5 px-4 font-mono">
                    <div className="font-bold text-[#F5F7F5]">#{lesson.display_order}</div>
                    {lesson.slot_number && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-[#39FF88]/15 text-[#39FF88] text-[10px]">
                        Slot {String(lesson.slot_number).padStart(2, '0')}
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 max-w-xs">
                    <div className="font-bold text-[#F5F7F5] line-clamp-1">{lesson.title}</div>
                    <div className="text-[11px] text-[#8C9891] line-clamp-1 mt-0.5">
                      {lesson.description}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-[#39FF88] font-mono text-[11px] font-bold">
                      {lesson.category}
                    </div>
                    <div className="text-[10px] font-mono text-[#8C9891] mt-0.5">
                      Nível: {lesson.level}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-[11px]">
                    <div className="text-[#F5F7F5] flex items-center gap-1">
                      <User className="w-3 h-3 text-[#39FF88]" />
                      <span>{lesson.instructor || 'A definir'}</span>
                    </div>
                    <div className="text-[#8C9891] flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{lesson.duration}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-[11px]">
                    {lesson.youtube_video_id ? (
                      <span className="inline-flex items-center space-x-1 text-[#39FF88]">
                        <Video className="w-3.5 h-3.5" />
                        <span>ID: {lesson.youtube_video_id}</span>
                      </span>
                    ) : (
                      <span className="text-[#8C9891]">Sem link vinculado</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      data-testid={`admin-lesson-status-${lesson.id}`}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase font-bold ${
                        lesson.published
                          ? 'bg-[#39FF88]/20 text-[#39FF88] border border-[#39FF88]/40'
                          : 'bg-[#07110B] text-[#8C9891] border border-[#1B3624]'
                      }`}
                    >
                      {lesson.published ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Publicada</span>
                        </>
                      ) : (
                        <span>Em breve / Oculta</span>
                      )}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center space-x-1.5">
                      <button
                        type="button"
                        data-testid={`btn-admin-publish-${lesson.id}`}
                        onClick={() => handleTogglePublish(lesson)}
                        title={lesson.published ? 'Despublicar aula' : 'Publicar aula'}
                        className={`p-2 rounded-lg border transition-colors ${
                          lesson.published
                            ? 'bg-amber-400/10 border-amber-400/30 text-amber-300 hover:bg-amber-400/20'
                            : 'bg-[#39FF88]/10 border-[#39FF88]/30 text-[#39FF88] hover:bg-[#39FF88]/20'
                        }`}
                      >
                        {lesson.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        data-testid={`btn-admin-edit-${lesson.id}`}
                        onClick={() => handleOpenEdit(lesson)}
                        title="Editar aula"
                        className="p-2 rounded-lg bg-[#07110B] border border-[#1B3624] text-[#F5F7F5] hover:border-[#39FF88] hover:text-[#39FF88] transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        data-testid={`btn-admin-delete-${lesson.id}`}
                        onClick={() => setDeletingLesson(lesson)}
                        title="Excluir aula"
                        className="p-2 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-400 hover:bg-rose-950/60 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div
            data-testid="admin-lesson-modal"
            className="w-full max-w-2xl rounded-3xl bg-[#0C1A11] border-2 border-[#1B3624] shadow-2xl overflow-hidden my-8"
          >
            <div className="p-6 border-b border-[#1B3624] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase text-[#39FF88] block">
                  {editingLesson ? `Editando ID: ${editingLesson.id}` : 'Cadastro de Conteúdo'}
                </span>
                <h2 className="text-lg font-black text-[#F5F7F5] uppercase">
                  {editingLesson ? 'Editar Videoaula' : 'Nova Videoaula da Academy'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-[#07110B] border border-[#1B3624] text-[#8C9891] hover:text-[#F5F7F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLesson} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div
                  data-testid="admin-lesson-form-error"
                  className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-mono flex items-center space-x-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    Título da Aula *
                  </label>
                  <input
                    type="text"
                    data-testid="input-lesson-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Fundamentos da Empunhadura e Direção no Forehand"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    Categoria / Módulo *
                  </label>
                  <input
                    type="text"
                    list="academy-categories-datalist"
                    data-testid="input-lesson-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                  />
                  <datalist id="academy-categories-datalist">
                    {DEFAULT_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    Nível Técnico *
                  </label>
                  <select
                    data-testid="input-lesson-level"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                  >
                    <option value="Iniciante">Iniciante</option>
                    <option value="Intermediário">Intermediário</option>
                    <option value="Avançado">Avançado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    Duração Estimada
                  </label>
                  <input
                    type="text"
                    data-testid="input-lesson-duration"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="Ex: 12 min"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    Professor / Instrutor
                  </label>
                  <input
                    type="text"
                    data-testid="input-lesson-instructor"
                    value={formData.instructor}
                    onChange={(e) => setFormData({ ...formData, instructor: e.target.value })}
                    placeholder="Nome do professor (opcional)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    URL do Vídeo no YouTube
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      data-testid="input-lesson-youtube"
                      value={formData.youtube_url}
                      onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                      onBlur={(e) => handleValidateYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX ou https://youtu.be/XXXXXXXXXXX"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleValidateYoutubeUrl(formData.youtube_url)}
                      className="px-3.5 py-2 rounded-xl bg-[#102216] border border-[#39FF88]/40 text-xs font-mono text-[#39FF88]"
                    >
                      Validar URL
                    </button>
                  </div>
                  {ytPreview && (
                    <div className="mt-2 p-2.5 rounded-xl bg-[#07110B] border border-[#39FF88]/30 flex items-center justify-between text-xs font-mono text-[#39FF88]">
                      <span>✓ Link YouTube válido (Embed: {ytPreview.embedUrl})</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    URL da Capa / Thumbnail (Opcional)
                  </label>
                  <input
                    type="text"
                    data-testid="input-lesson-thumbnail"
                    value={formData.thumbnail}
                    onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                    placeholder="Preenchida automaticamente pelo YouTube se vazia"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                      Ordem Exibição
                    </label>
                    <input
                      type="number"
                      data-testid="input-lesson-order"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                      Slot (1 a 12)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={formData.slot_number}
                      onChange={(e) => setFormData({ ...formData, slot_number: e.target.value })}
                      placeholder="-"
                      className="w-full px-3 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono uppercase text-[#8C9891] mb-1">
                    Descrição da Aula *
                  </label>
                  <textarea
                    rows={3}
                    data-testid="input-lesson-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                    placeholder="Descreva os fundamentos abordados, exercícios recomendados e objetivos técnicos..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-sm text-[#F5F7F5] focus:border-[#39FF88] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2 pt-2">
                  <label className="flex items-center space-x-3 p-3.5 rounded-xl bg-[#07110B] border border-[#1B3624] cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="checkbox-lesson-published"
                      checked={formData.published}
                      onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                      className="w-4 h-4 accent-[#39FF88]"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#F5F7F5] block">
                        Publicar imediatamente no Catálogo Gratuito
                      </span>
                      <span className="text-[11px] text-[#8C9891]">
                        Requer uma URL válida do YouTube. Quando desmarcado, a aula permanece oculta do catálogo público.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-[#1B3624] flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#07110B] border border-[#1B3624] text-xs font-mono text-[#8C9891] hover:text-[#F5F7F5]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  data-testid="btn-save-lesson"
                  disabled={saving}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-[#39FF88] text-[#07110B] font-black text-xs uppercase tracking-wider hover:bg-[#1FA855] transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Salvando...' : 'Salvar Aula'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      {deletingLesson && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0C1A11] border-2 border-rose-500/40 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-base font-black uppercase">Confirmar Exclusão de Aula</h3>
            </div>
            <p className="text-xs text-[#8C9891] leading-relaxed">
              Tem certeza que deseja excluir permanentemente a aula{' '}
              <strong className="text-[#F5F7F5]">&quot;{deletingLesson.title}&quot;</strong>?
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingLesson(null)}
                className="px-4 py-2 rounded-xl bg-[#07110B] border border-[#1B3624] text-xs font-mono text-[#8C9891]"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="btn-confirm-delete-lesson"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs uppercase hover:bg-rose-600"
              >
                {deleting ? 'Excluindo...' : 'Excluir Aula'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
