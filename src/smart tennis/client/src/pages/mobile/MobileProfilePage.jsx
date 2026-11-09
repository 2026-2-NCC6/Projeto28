import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Trophy,
  Target,
  Zap,
  LogOut,
  Mail,
  SunMoon,
  Sparkles,
  Award
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cloudDataService } from '../../services/cloudDataService';
import { getStoredCloudSession, clearCloudSession } from '../../services/cloudAuthService';
import { isEquipmentMode, isCloudOnlyMode } from '../../services/appEnvironment';
import { isNativeMobile } from '../../services/serverConfig';
import { api } from '../../services/api';
import MobileVisitorGuard from '../../components/mobile/MobileVisitorGuard';
import ThemeToggle from '../../components/ui/ThemeToggle';

export default function MobileProfilePage() {
  const { user, isGuest, logout } = useAuth();
  const navigate = useNavigate();

  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGuest) {
      setLoading(false);
      return;
    }
    loadProfile();
  }, [isGuest, user?.id]);

  const loadProfile = async () => {
    setLoading(true);

    const cloudSession = getStoredCloudSession();
    let loadedFromCloud = false;

    if (cloudSession?.accessToken) {
      try {
        const profile = await cloudDataService.getCloudProfile({
          accessToken: cloudSession.accessToken
        });

        if (profile) {
          setPlayer({
            name: profile.display_name || user?.name || 'Atleta',
            email: cloudSession.user?.email || user?.email || '',
            avatar: profile.avatar || user?.avatar || '🎾',
            level: profile.level || 1,
            xp: profile.xp || 0,
            xp_next: profile.xp_next || 250,
            title: profile.title || 'Iniciante',
            precision: profile.overall_accuracy !== undefined ? Number(profile.overall_accuracy) : 0,
            total_matches: profile.total_matches || 0,
            best_score: profile.best_score || 0
          });
          loadedFromCloud = true;
        }
      } catch (e) {
        console.warn('[MOBILE PROFILE] Nuvem inacessível, dados padrão do usuário:', e);
      }
    }

    if (!loadedFromCloud && isEquipmentMode() && !isNativeMobile()) {
      try {
        const playerData = await api.getPlayer().catch(() => user);
        if (playerData) {
          setPlayer({
            name: playerData.name || user?.name || 'Atleta',
            email: user?.email || '',
            avatar: playerData.avatar || user?.avatar || '🎾',
            level: playerData.level || 1,
            xp: playerData.xp || 0,
            xp_next: playerData.xp_next || 250,
            title: playerData.title || 'Iniciante',
            precision: playerData.overall_accuracy !== undefined ? Number(playerData.overall_accuracy) : 0,
            total_matches: playerData.trainings_completed || playerData.total_matches || 0,
            best_score: playerData.best_score || 0
          });
        }
      } catch (_) {}
    } else if (!loadedFromCloud && user) {
      setPlayer({
        name: user.name || 'Atleta',
        email: user.email || '',
        avatar: user.avatar || '🎾',
        level: user.level || 1,
        xp: user.xp || 0,
        xp_next: user.xp_next || 250,
        title: user.title || 'Iniciante',
        precision: 0,
        total_matches: 0,
        best_score: 0
      });
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    clearCloudSession();
    if (logout) await logout();
    navigate('/login');
  };

  if (isGuest) {
    return <MobileVisitorGuard featureName="o Perfil do Atleta" />;
  }

  const currentXp = player?.xp || 0;
  const nextXp = player?.xp_next || 250;
  const xpPct = Math.min(100, Math.max(0, Math.round((currentXp / nextXp) * 100)));
  const userEmail = player?.email || user?.email || '';

  return (
    <div className="p-4 sm:p-5 space-y-4 animate-fadeIn">
      
      
      <div className="p-5 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm flex items-center space-x-4">
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-2xl bg-[#142B3D] dark:bg-[#0D1B2A] border-2 border-[#B8F044] flex items-center justify-center text-3xl shadow-sm">
            {player?.avatar || user?.avatar || '🎾'}
          </div>
          <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#101820] border border-[#B8F044] text-[9px] font-mono font-bold text-[#B8F044]">
            LV.{player?.level || 1}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-black text-[#142B3D] dark:text-[#F1F5F9] truncate">
              {player?.name || user?.name || 'Atleta'}
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[#E8EDF1] dark:bg-[#18242E] text-[#2563EB] dark:text-[#60A5FA] border border-[#B8C6D0] dark:border-[#344653]">
              {player?.title || 'Atleta'}
            </span>
          </div>

          {userEmail && (
            <span className="text-xs text-[#475569] dark:text-[#A8BAC8] font-medium block truncate mt-0.5">
              {userEmail}
            </span>
          )}

          <div className="mt-2.5 w-full bg-[#E8EDF1] dark:bg-[#18242E] h-2 rounded-full overflow-hidden border border-[#B8C6D0] dark:border-[#344653]">
            <div
              className="bg-[#2563EB] dark:bg-[#B8F044] h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#64748B] dark:text-[#A8BAC8] mt-1">
            <span>{currentXp} / {nextXp} XP</span>
            <span className="font-bold">{xpPct}%</span>
          </div>
        </div>
      </div>

      
      <div className="p-4 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm space-y-3">
        <div className="flex items-center space-x-2 pb-1 border-b border-[#B8C6D0] dark:border-[#344653]">
          <Award className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#142B3D] dark:text-[#F1F5F9]">
            Desempenho Esportivo
          </h3>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-center">
            <span className="text-[10px] font-bold text-[#475569] dark:text-[#A8BAC8] uppercase block">Nível</span>
            <span className="text-base font-black text-[#2563EB] dark:text-[#60A5FA] font-sport">
              LV. {player?.level || 1}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-center">
            <span className="text-[10px] font-bold text-[#475569] dark:text-[#A8BAC8] uppercase block">Precisão</span>
            <span className="text-base font-black text-emerald-600 dark:text-[#B8F044] font-sport">
              {player?.precision ? `${player.precision}%` : '--'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] text-center">
            <span className="text-[10px] font-bold text-[#475569] dark:text-[#A8BAC8] uppercase block">Treinos</span>
            <span className="text-base font-black text-[#142B3D] dark:text-[#F1F5F9] font-sport">
              {player?.total_matches || 0}
            </span>
          </div>
        </div>
      </div>

      
      <div className="p-4 rounded-3xl bg-[#F4F6F8] dark:bg-[#22313D] border border-[#B8C6D0] dark:border-[#344653] shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-[#E8EDF1] dark:bg-[#18242E] border border-[#B8C6D0] dark:border-[#344653] flex items-center justify-center text-[#2563EB] dark:text-[#B8F044]">
            <SunMoon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#142B3D] dark:text-[#F1F5F9] uppercase tracking-wider">
              Aparência Visual
            </h4>
            <p className="text-[11px] text-[#475569] dark:text-[#A8BAC8]">
              Alternar entre tema Claro e Escuro
            </p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      
      <button
        onClick={handleLogout}
        data-testid="btn-profile-logout"
        className="w-full py-3.5 px-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition shadow-sm active:scale-98"
      >
        <LogOut className="w-4 h-4" />
        <span>Sair da Minha Conta</span>
      </button>

    </div>
  );
}
