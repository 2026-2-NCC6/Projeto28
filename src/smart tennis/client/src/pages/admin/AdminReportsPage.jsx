import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Target, 
  TrendingUp, 
  Calendar, 
  Download, 
  Search, 
  Filter, 
  User, 
  Activity, 
  Award,
  Zap
} from 'lucide-react';
import { api } from '../../services/api';

export default function AdminReportsPage() {
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('all');

  useEffect(() => {
    loadReportsData();
  }, []);

  const loadReportsData = async () => {
    setLoading(true);
    try {
      const [repRes, sessRes] = await Promise.allSettled([
        api.admin.getReports(),
        api.admin.getSessions()
      ]);

      if (repRes.status === 'fulfilled') {
        setStats(repRes.value);
      }

      if (sessRes.status === 'fulfilled') {
        setSessions(sessRes.value || []);
      }
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    } finally {
      setLoading(false);
    }
  };

  const modeLabel = (mode) => {
    const map = {
      free: 'Treino Livre',
      single: 'Alvo Único',
      clear_all: 'Apague Todos'
    };
    return map[mode] || mode || 'Livre';
  };

  const formatDate = (iso) => {
    if (!iso) return '---';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const filteredSessions = sessions.filter((s) => {
    if (period !== 'all') {
      const sessDate = new Date(s.created_at);
      const now = new Date();
      const diffDays = (now - sessDate) / (1000 * 60 * 60 * 24);
      if (period === '7d' && diffDays > 7) return false;
      if (period === '30d' && diffDays > 30) return false;
    }

    if (userFilter.trim()) {
      const term = userFilter.toLowerCase();
      const nameMatch = s.user_name?.toLowerCase().includes(term) || s.player_name?.toLowerCase().includes(term);
      const userMatch = s.username?.toLowerCase().includes(term);
      if (!nameMatch && !userMatch) return false;
    }

    if (modeFilter !== 'all' && s.mode !== modeFilter) {
      return false;
    }

    return true;
  });

  const totalFilteredHits = filteredSessions.reduce((acc, s) => acc + (s.hits || 0), 0);
  const totalFilteredScore = filteredSessions.reduce((acc, s) => acc + (s.score || 0), 0);
  const avgFilteredAccuracy = filteredSessions.length > 0
    ? Math.round(filteredSessions.reduce((acc, s) => acc + (s.accuracy || 80), 0) / filteredSessions.length)
    : (stats?.averageAccuracy || 0);

  const handleExportCSV = () => {
    if (filteredSessions.length === 0) {
      alert('Nenhuma sessão disponível para exportação com os filtros atuais.');
      return;
    }

    const headers = ['ID', 'Data/Hora', 'Atleta', 'Usuario', 'Equipamento', 'Modo', 'Pontuacao', 'Acertos', 'Precisao(%)'];
    const rows = filteredSessions.map((s) => [
      s.id,
      `"${formatDate(s.created_at)}"`,
      `"${s.user_name || s.player_name || 'Atleta'}"`,
      `"${s.username || ''}"`,
      `"${s.equipment_name || 'Quadra'}"`,
      `"${modeLabel(s.mode)}"`,
      s.score || 0,
      s.hits || 0,
      s.accuracy || 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_motion_tennis_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn font-mono">
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#08120B] border border-[#295437]">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7F5] flex items-center space-x-2">
            <FileText className="w-6 h-6 text-amber-400" />
            <span>Relatórios & Histórico</span>
          </h1>
          <p className="text-xs text-[#8C9891] mt-0.5">
            Consulta de resultados esportivos, filtros por atleta/período e exportação de dados.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="px-4 py-2.5 rounded-xl bg-amber-400 text-[#07110B] font-bold text-xs uppercase flex items-center space-x-2 hover:bg-amber-300 transition shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Exportar Relatório (CSV)</span>
        </button>
      </div>

      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#08120B] border border-[#295437] space-y-1">
          <div className="flex items-center gap-2 text-[#8C9891]">
            <Calendar size={14} className="text-amber-400" />
            <span className="text-[10px] uppercase font-bold">Sessões Realizadas</span>
          </div>
          <div className="text-2xl font-black text-[#F5F7F5]">
            {filteredSessions.length}
          </div>
          <div className="text-[10px] text-[#8C9891]">Total do período filtrado</div>
        </div>

        <div className="p-4 rounded-2xl bg-[#08120B] border border-[#295437] space-y-1">
          <div className="flex items-center gap-2 text-[#8C9891]">
            <Target size={14} className="text-[#39FF88]" />
            <span className="text-[10px] uppercase font-bold">Total de Acertos</span>
          </div>
          <div className="text-2xl font-black text-[#39FF88]">
            {totalFilteredHits.toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] text-[#8C9891]">Impactos computados</div>
        </div>

        <div className="p-4 rounded-2xl bg-[#08120B] border border-[#295437] space-y-1">
          <div className="flex items-center gap-2 text-[#8C9891]">
            <TrendingUp size={14} className="text-blue-400" />
            <span className="text-[10px] uppercase font-bold">Precisão Média</span>
          </div>
          <div className="text-2xl font-black text-blue-400">
            {avgFilteredAccuracy}%
          </div>
          <div className="text-[10px] text-[#8C9891]">Eficiência nos alvos</div>
        </div>

        <div className="p-4 rounded-2xl bg-[#08120B] border border-[#295437] space-y-1">
          <div className="flex items-center gap-2 text-[#8C9891]">
            <Award size={14} className="text-amber-400" />
            <span className="text-[10px] uppercase font-bold">Pontuação Total</span>
          </div>
          <div className="text-2xl font-black text-amber-400">
            {totalFilteredScore.toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] text-[#8C9891]">Pontos acumulados</div>
        </div>
      </div>

      
      <div className="p-4 rounded-2xl bg-[#08120B] border border-[#295437] grid grid-cols-1 sm:grid-cols-3 gap-3">
        
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C9891] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Filtrar por nome do atleta..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-xs text-[#F5F7F5] placeholder-[#8C9891] focus:outline-none focus:border-amber-400"
          />
        </div>

        
        <div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-xs text-[#F5F7F5] focus:outline-none focus:border-amber-400"
          >
            <option value="all">Todo o Período</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
        </div>

        
        <div>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#060D08] border border-[#1B3624] text-xs text-[#F5F7F5] focus:outline-none focus:border-amber-400"
          >
            <option value="all">Todos os Modos</option>
            <option value="free">Treino Livre</option>
            <option value="single">Alvo Único</option>
            <option value="clear_all">Apague Todos</option>
          </select>
        </div>
      </div>

      
      <div className="p-6 rounded-3xl bg-[#08120B] border border-[#295437] space-y-4 overflow-x-auto">
        <div className="flex items-center justify-between pb-2 border-b border-[#1B3624]">
          <h2 className="text-sm font-bold text-[#8C9891] uppercase tracking-wider">
            Histórico Detalhado de Sessões
          </h2>
          <span className="text-xs text-[#8C9891]">
            {filteredSessions.length} resultados encontrados
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-[#8C9891] text-xs">Carregando sessões...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-8 text-center text-[#8C9891] text-xs">
            Nenhuma sessão encontrada com os filtros selecionados.
          </div>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[#1B3624] text-[#8C9891]">
                <th className="pb-3">#</th>
                <th className="pb-3">DATA & HORA</th>
                <th className="pb-3">ATLETA</th>
                <th className="pb-3">EQUIPAMENTO</th>
                <th className="pb-3">MODO</th>
                <th className="pb-3 text-right">ACERTOS</th>
                <th className="pb-3 text-right">PRECISÃO</th>
                <th className="pb-3 text-right">PONTOS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B3624]">
              {filteredSessions.map((s, idx) => (
                <tr key={s.id || idx} className="hover:bg-[#060D08]/60 transition-colors">
                  <td className="py-3 text-[#8C9891]">{s.id || idx + 1}</td>
                  <td className="py-3 text-[#F5F7F5]">{formatDate(s.created_at)}</td>
                  <td className="py-3">
                    <div className="font-bold text-[#F5F7F5]">
                      {s.user_name || s.player_name || 'Nicolas'}
                    </div>
                    {s.username && (
                      <div className="text-[10px] text-[#8C9891]">@{s.username}</div>
                    )}
                  </td>
                  <td className="py-3 text-[#8C9891]">
                    {s.equipment_name || 'Quadra Principal'}
                  </td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1B3624] text-cyan-300">
                      {modeLabel(s.mode)}
                    </span>
                  </td>
                  <td className="py-3 text-right font-bold text-[#39FF88]">
                    {s.hits || 0}
                  </td>
                  <td className="py-3 text-right font-bold text-blue-400">
                    {s.accuracy || 80}%
                  </td>
                  <td className="py-3 text-right font-black text-amber-400">
                    {(s.score || 0).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
