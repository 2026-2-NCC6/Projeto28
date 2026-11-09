import React, { useState, useEffect } from 'react';
import { Clock, Calendar, CheckCircle2, Trophy, Zap, Crosshair } from 'lucide-react';
import { api } from '../services/api';

export default function HistoryPage() {
  const [sessions, setSessions] = useState([]);
  const [shots, setShots] = useState([]);
  const [viewMode, setViewMode] = useState('sessions');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const [sessList, shotList] = await Promise.all([
        api.getSessions(30).catch((err) => {
          console.warn('[HISTORY] Erro ao carregar sessões:', err);
          return [];
        }),
        api.getRecentShots(40).catch((err) => {
          console.warn('[HISTORY] Erro ao carregar disparos:', err);
          return [];
        })
      ]);
      setSessions(Array.isArray(sessList) ? sessList : []);
      setShots(Array.isArray(shotList) ? shotList : []);
    } catch (e) {
      console.error('Erro ao carregar histórico:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto">
      
      
      <div className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm transition-colors">
        <div>
          <h1 className="text-2xl font-black text-[#142B3D] dark:text-[#F1F5F9] flex items-center space-x-2">
            <Clock className="w-6 h-6 text-[#2563EB] dark:text-[#B8F044]" />
            <span>Histórico de Treinos & Impactos</span>
          </h1>
          <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1">
            Registro cronológico de todas as sessões e golpes computados pelo Motion Tennis.
          </p>
        </div>

        
        <div className="flex items-center space-x-2 bg-[#E8EDF1] dark:bg-[#18242E] p-1 rounded-xl border border-[#B8C6D0] dark:border-[#344653] text-xs font-mono">
          <button
            onClick={() => setViewMode('sessions')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              viewMode === 'sessions'
                ? 'bg-[#142B3D] dark:bg-[#0D1B2A] text-[#B8F044] font-bold shadow-xs'
                : 'text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]'
            }`}
          >
            Sessões Realizadas ({sessions.length})
          </button>
          <button
            onClick={() => setViewMode('shots')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              viewMode === 'shots'
                ? 'bg-[#142B3D] dark:bg-[#0D1B2A] text-[#B8F044] font-bold shadow-xs'
                : 'text-[#475569] dark:text-[#A8BAC8] hover:text-[#142B3D] dark:hover:text-[#F1F5F9]'
            }`}
          >
            Jogadas Individuais ({shots.length})
          </button>
        </div>
      </div>

      
      {viewMode === 'sessions' ? (
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="p-12 text-center text-xs font-mono text-[#475569] dark:text-[#A8BAC8] bg-[#F4F6F8] dark:bg-[#22313D] rounded-3xl border border-[#B8C6D0] dark:border-[#344653]">
              Nenhuma sessão gravada até o momento.
            </div>
          ) : (
            sessions.map((sess) => (
              <div
                key={sess.id}
                className="p-5 rounded-2xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#2563EB] dark:text-[#B8F044] shrink-0">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-[#142B3D] dark:text-[#F1F5F9]">{sess.mode}</h3>
                      <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8]">
                        {new Date(sess.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <span className="text-xs text-[#475569] dark:text-[#A8BAC8]">
                      {sess.hits_count} acertos em {sess.shots_count} jogadas ({sess.accuracy}% precisão)
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-6 text-xs font-mono">
                  <div className="text-right">
                    <span className="text-[10px] text-[#475569] dark:text-[#A8BAC8]">VEL. MÉDIA</span>
                    <div className="font-bold text-[#142B3D] dark:text-[#F1F5F9]">{sess.avg_force} km/h</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[#475569] dark:text-[#A8BAC8]">PONTUAÇÃO</span>
                    <div className="font-bold text-[#2563EB] dark:text-[#B8F044] text-sm">{sess.total_score} pts</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {shots.map((shot) => (
            <div
              key={shot.id}
              className="p-3.5 rounded-xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044] transition-all flex items-center justify-between text-xs shadow-xs"
            >
              <div className="flex items-center space-x-3">
                <span className={`w-2 h-2 rounded-full ${
                  shot.is_bullseye ? 'bg-[#B8F044]' : shot.is_hit ? 'bg-[#2563EB] dark:bg-[#60A5FA]' : 'bg-rose-500'
                }`}></span>
                <span className="font-semibold text-[#142B3D] dark:text-[#F1F5F9]">{shot.zone}</span>
                <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8]">
                  [X: {shot.x} | Y: {shot.y}]
                </span>
              </div>

              <div className="flex items-center space-x-4 font-mono">
                <span className="text-[#475569] dark:text-[#A8BAC8]">{shot.force} km/h</span>
                <span className="text-[#2563EB] dark:text-[#B8F044] font-bold">+{shot.score} pts</span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
