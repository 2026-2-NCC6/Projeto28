import React, { useState, useEffect } from 'react';
import { 
  User, 
  Save, 
  RotateCcw, 
  Trash2, 
  Trophy, 
  Calendar, 
  Target, 
  Flame, 
  Award,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';
import { isEquipmentMode } from '../services/appEnvironment';
import { isNativeMobile } from '../services/serverConfig';
import CloudLinkCard from '../components/CloudLinkCard';

export default function ProfilePage({ player: propPlayer, onPlayerUpdate }) {
  const [playerData, setPlayerData] = useState(propPlayer || null);
  const [name, setName] = useState(propPlayer?.name || 'Nicolas');
  const [avatar, setAvatar] = useState(propPlayer?.avatar || '🎾');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!propPlayer?.level);
  const [message, setMessage] = useState(null);

  const availableAvatars = ['🎾', '⚡', '🏆', '🎯', '🚀', '🔥', '👑', '🥇'];

  useEffect(() => {
    loadFullProfile();
  }, []);

  const loadFullProfile = async () => {
    try {
      setLoading(true);
      const data = await api.getPlayer();
      if (data) {
        setPlayerData(data);
        if (data.name && data.name !== 'Atleta') setName(data.name);
        else if (propPlayer?.name && propPlayer.name !== 'Atleta') setName(propPlayer.name);
        if (data.avatar) setAvatar(data.avatar);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do atleta:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updatePlayer({ name, avatar });
      setPlayerData((prev) => ({ ...prev, ...updated }));
      if (onPlayerUpdate) onPlayerUpdate(updated);
      setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar perfil' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-4xl mx-auto">
      
      
      <div className="p-6 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] flex items-center space-x-3 shadow-sm transition-colors">
        <User className="w-6 h-6 text-[#2563EB] dark:text-[#B8F044]" />
        <div>
          <h1 className="text-2xl font-black text-[#142B3D] dark:text-[#F1F5F9]">Perfil do Jogador</h1>
          <p className="text-xs text-[#475569] dark:text-[#A8BAC8]">Gerencie seu cadastro, avatar e configurações de dados esportivos.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-xs font-mono border ${
          message.type === 'success'
            ? 'bg-emerald-100 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200'
            : 'bg-rose-100 dark:bg-rose-950/50 border-rose-300 dark:border-rose-600 text-rose-900 dark:text-rose-200'
        }`}>
          {message.text}
        </div>
      )}

      
      <div className="p-6 sm:p-8 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] space-y-6 shadow-sm">
        <form onSubmit={handleSave} className="space-y-6">
          
          
          <div>
            <label className="block text-xs font-mono text-[#475569] dark:text-[#A8BAC8] mb-2 uppercase">
              Escolha seu Avatar Esportivo
            </label>
            <div className="flex flex-wrap gap-3">
              {availableAvatars.map((av) => (
                <button
                  type="button"
                  key={av}
                  onClick={() => setAvatar(av)}
                  className={`w-12 h-12 rounded-2xl text-xl flex items-center justify-center transition-all ${
                    avatar === av
                      ? 'bg-[#E8EDF1] dark:bg-[#18242E] border-2 border-[#B8F044] shadow-sm scale-105'
                      : 'bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] hover:border-[#B8F044]'
                  }`}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          
          <div>
            <label className="block text-xs font-mono text-[#475569] dark:text-[#A8BAC8] mb-2 uppercase">
              Nome do Jogador
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-[#142B3D] dark:text-[#F1F5F9] font-bold focus:border-[#B8F044] focus:outline-none transition-colors"
              placeholder="Digite seu nome"
              required
            />
          </div>

          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]">
              <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8]">NÍVEL ATUAL</span>
              <div className="text-lg font-black text-[#2563EB] dark:text-[#B8F044]">
                {loading ? '...' : `LV. ${playerData?.level ?? 1}`}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]">
              <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8]">EXPERIÊNCIA</span>
              <div className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9]">
                {loading ? '...' : `${playerData?.xp ?? 0} XP`}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]">
              <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8]">TREINOS</span>
              <div className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9]">
                {loading ? '...' : (playerData?.trainings_completed ?? playerData?.total_matches ?? 0)}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653]">
              <span className="text-[10px] font-mono text-[#475569] dark:text-[#A8BAC8]">MELHOR PONTUAÇÃO</span>
              <div className="text-lg font-black text-amber-500 dark:text-amber-400">
                {loading ? '...' : `${playerData?.best_score ?? 0} pts`}
              </div>
            </div>
          </div>

          
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 rounded-xl btn-sport-lime font-bold text-xs tracking-wider uppercase flex items-center justify-center space-x-2 shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}</span>
          </button>
        </form>
      </div>

      
      {isEquipmentMode() && !isNativeMobile() && <CloudLinkCard />}

    </div>
  );
}
