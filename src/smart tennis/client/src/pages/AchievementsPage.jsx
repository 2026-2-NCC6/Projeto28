import React, { useState, useEffect } from 'react';
import { Trophy, CheckCircle2, Lock, Zap } from 'lucide-react';
import { api } from '../services/api';

export default function AchievementsPage() {
  const [data, setData] = useState({ achievements: [], unlockedCount: 0, total: 0, completionRate: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      const res = await api.getAchievements();
      setData(res || { achievements: [], unlockedCount: 0, total: 0, completionRate: 0 });
    } catch (e) {
      console.error('Erro ao carregar conquistas:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto">
      
      
      <div className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm transition-colors">
        <div>
          <h1 className="text-2xl font-black text-[#142B3D] dark:text-[#F1F5F9] flex items-center space-x-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            <span>Conquistas & Troféus do Atleta</span>
          </h1>
          <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1">
            Marcos esportivos desbloqueados com base na precisão, consistência e frequência dos seus treinos.
          </p>
        </div>

        
        <div className="flex items-center space-x-3 bg-[#E8EDF1] dark:bg-[#18242E] px-4 py-2 rounded-2xl border border-[#B8C6D0] dark:border-[#344653] font-mono">
          <div className="text-right">
            <div className="text-[10px] text-[#475569] dark:text-[#A8BAC8]">PROGRESSO GERAL</div>
            <div className="text-sm font-bold text-[#2563EB] dark:text-[#B8F044]">
              {data.unlockedCount} / {data.total} Conquistas ({data.completionRate}%)
            </div>
          </div>
        </div>
      </div>

      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(data.achievements || []).map((ach) => {
          const isUnlocked = ach.unlocked === 1;
          const progressPct = Math.min(100, Math.round(((ach.progress || 0) / (ach.target || 1)) * 100));

          return (
            <div
              key={ach.id}
              className={`p-6 rounded-3xl border transition-all flex flex-col justify-between shadow-sm ${
                isUnlocked
                  ? 'bg-[#F4F6F8] dark:bg-[#22313D] border-[#B8F044]'
                  : 'bg-[#F4F6F8]/70 dark:bg-[#22313D]/70 border-[#B8C6D0] dark:border-[#344653] opacity-80'
              }`}
            >
              <div className="space-y-3">
                
                
                <div className="flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${
                    isUnlocked
                      ? 'bg-[#E8EDF1] dark:bg-[#18242E] border-[#B8F044] shadow-xs'
                      : 'bg-[#E8EDF1] dark:bg-[#18242E] border-[#B8C6D0] dark:border-[#344653] grayscale'
                  }`}>
                    {ach.icon || '🏆'}
                  </div>

                  <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    isUnlocked
                      ? 'bg-[#B8F044]/20 text-[#142B3D] dark:text-[#B8F044] border-[#B8F044]/50'
                      : 'bg-slate-200 dark:bg-slate-800 text-[#475569] dark:text-[#A8BAC8] border-slate-300 dark:border-slate-700'
                  }`}>
                    {isUnlocked ? 'DESBLOQUEADA' : 'BLOQUEADA'}
                  </span>
                </div>

                
                <div>
                  <h3 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9]">
                    {ach.title}
                  </h3>
                  <p className="text-xs text-[#475569] dark:text-[#A8BAC8] mt-1 leading-relaxed">
                    {ach.description}
                  </p>
                </div>

              </div>

              
              <div className="mt-6 pt-4 border-t border-[#B8C6D0] dark:border-[#344653] space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#475569] dark:text-[#A8BAC8]">Progresso</span>
                  <span className="text-[#142B3D] dark:text-[#F1F5F9] font-bold">
                    {ach.progress || 0} / {ach.target} ({progressPct}%)
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2563EB] to-[#B8F044] rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                  <span className="text-[#475569] dark:text-[#A8BAC8]">Bônus:</span>
                  <span className="text-[#2563EB] dark:text-[#B8F044] font-bold">+{ach.xp_reward || 100} XP</span>
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
