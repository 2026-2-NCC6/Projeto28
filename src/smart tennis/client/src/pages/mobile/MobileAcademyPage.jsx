import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  PlayCircle,
  Search,
  Filter,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Video
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function MobileAcademyPage() {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();

  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAcademyCatalog();
      setCatalog(data);
    } catch (err) {
      console.warn('Erro ao carregar catálogo da Academy:', err);
      setError('Falha ao carregar catálogo da Academy.');
    } finally {
      setLoading(false);
    }
  };

  const categoriesList = [
    'Todas',
    'Precisão & Direção',
    'Consistência & Ritmo',
    'Velocidade & Potência',
    'Controle & Sensibilidade',
    'Reflexo & Agilidade',
    'Estratégia & Tática'
  ];

  const allLessons = [];
  if (catalog?.lessons?.length > 0) {
    allLessons.push(...catalog.lessons);
  }
  if (catalog?.initialModulesPreview?.length > 0) {
    allLessons.push(...catalog.initialModulesPreview);
  }

  const filteredLessons = allLessons.filter((lesson) => {
    const matchesCategory =
      selectedCategory === 'Todas' ||
      (lesson.category && lesson.category.toLowerCase().includes(selectedCategory.toLowerCase()));
    
    const matchesSearch =
      !searchQuery ||
      (lesson.title && lesson.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lesson.description && lesson.description.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-5 space-y-4 animate-fadeIn">
      
      
      <div className="p-4 rounded-3xl bg-gradient-to-r from-[#0C2216] to-[#07130D] border border-[#1A3F27] flex items-center justify-between shadow-[0_0_20px_rgba(57,255,136,0.1)]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-[#14301D] border border-[#39FF88]/40 flex items-center justify-center text-[#39FF88]">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-black uppercase text-white tracking-wider">
                Motion Tennis Academy
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#39FF88] text-slate-950">
                GRÁTIS
              </span>
            </div>
            <p className="text-[11px] text-[#8C9891]">
              Aulas técnicas sem necessidade de assinatura
            </p>
          </div>
        </div>
      </div>

      
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C9891] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar aula ou fundamento..."
            data-testid="input-academy-search"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#08120B] border border-[#163020] focus:border-[#39FF88] text-xs text-white placeholder-[#6E8175] outline-none transition"
          />
        </div>

        
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-[#39FF88] text-slate-950 shadow-[0_0_10px_rgba(57,255,136,0.2)]'
                  : 'bg-[#0D1E13] border border-[#163020] text-[#8C9891] hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-2">
          <RefreshCw className="w-6 h-6 text-[#39FF88] animate-spin" />
          <span className="text-xs text-[#8C9891]">Carregando catálogo...</span>
        </div>
      )}

      
      {error && !loading && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-center text-xs text-rose-200">
          {error}
        </div>
      )}

      
      {!loading && (
        <div className="space-y-3">
          {filteredLessons.map((lesson, idx) => {
            const lessonId = lesson.id || `slot_${lesson.slot_number || idx + 1}`;
            const isPublished = lesson.published === true || lesson.published === 1;

            return (
              <div
                key={lessonId}
                onClick={() => navigate(`/mobile/academy/aula/${lessonId}`)}
                data-testid={`lesson-card-${lessonId}`}
                className="p-4 rounded-2xl bg-[#09150E] hover:bg-[#0E1F15] border border-[#163020] hover:border-[#39FF88]/40 transition cursor-pointer flex items-center justify-between space-x-3 group"
              >
                
                <div className="relative w-16 h-16 rounded-xl bg-[#060D08] border border-[#1A3824] flex items-center justify-center shrink-0 overflow-hidden">
                  {lesson.thumbnail ? (
                    <img
                      src={lesson.thumbnail}
                      alt={lesson.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[#39FF88]/70 group-hover:text-[#39FF88] transition">
                      <PlayCircle className="w-6 h-6" />
                    </div>
                  )}
                  
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-white">
                    {lesson.duration || '6 min'}
                  </span>
                </div>

                
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-mono uppercase text-[#39FF88] font-bold">
                      {lesson.category || 'Fundamentos'}
                    </span>
                    <span className="text-[10px] text-[#6E8175]">•</span>
                    <span className="text-[10px] font-mono text-[#8C9891]">
                      {lesson.level || 'Iniciante'}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-white group-hover:text-[#39FF88] transition truncate leading-snug">
                    {lesson.title}
                  </h3>

                  <div className="flex items-center space-x-2 text-[10px] text-[#6E8175]">
                    {lesson.instructor && (
                      <span>Prof. {lesson.instructor}</span>
                    )}
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                      isPublished 
                        ? 'bg-[#122A1A] text-[#39FF88] border border-[#39FF88]/30'
                        : 'bg-amber-950/40 text-amber-300 border border-amber-500/30'
                    }`}>
                      {isPublished ? 'DISPONÍVEL' : 'EM BREVE'}
                    </span>
                  </div>
                </div>

                
                <div className="w-7 h-7 rounded-lg bg-[#0F2417] text-[#39FF88] flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <PlayCircle className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
