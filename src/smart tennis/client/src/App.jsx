import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import PlayerLayout from './layouts/PlayerLayout';
import AdminLayout from './layouts/AdminLayout';
import MobileLayout from './layouts/MobileLayout';

import ProtectedRoute from './components/ProtectedRoute';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import MobileConnectPage from './pages/mobile/MobileConnectPage';
import MobileDashboardPage from './pages/mobile/MobileDashboardPage';
import MobileHistoryPage from './pages/mobile/MobileHistoryPage';
import MobileEvolutionPage from './pages/mobile/MobileEvolutionPage';
import MobileAcademyPage from './pages/mobile/MobileAcademyPage';
import MobileAcademyLessonPage from './pages/mobile/MobileAcademyLessonPage';
import MobileProfilePage from './pages/mobile/MobileProfilePage';
import { isNativeMobile, isMobileDevice } from './services/serverConfig';

import DashboardPage from './pages/DashboardPage';
import PlayPage from './pages/PlayPage';
import StatisticsPage from './pages/StatisticsPage';
import EvolutionPage from './pages/EvolutionPage';
import AcademyPage from './pages/AcademyPage';
import AcademyLessonPage from './pages/AcademyLessonPage';
import SkillAcademyPage from './pages/SkillAcademyPage';
import HistoryPage from './pages/HistoryPage';
import AchievementsPage from './pages/AchievementsPage';
import ProfilePage from './pages/ProfilePage';

import AdminSensorsPage from './pages/admin/AdminSensorsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminEquipmentsPage from './pages/admin/AdminEquipmentsPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminAcademyPage from './pages/admin/AdminAcademyPage';
import AdminDiagnosticPage from './pages/admin/AdminDiagnosticPage';

import { wsClient } from './services/websocket';
import { useAuth } from './context/AuthContext';

import LevelUpModal from './components/LevelUpModal';
import ConnectMobileModal from './components/ConnectMobileModal';

export default function App() {
  const { user, setUser, isGuest } = useAuth();
  const [modalData, setModalData] = useState(null);

  useEffect(() => {
    wsClient.connect();

    const unsubLevel = wsClient.on('LEVEL_UP', (payload) => {
      if (isGuest) return;
      setModalData({
        type: 'LEVEL_UP',
        level: payload.level,
        title: payload.title,
        xpReward: 250,
      });
    });

    const unsubAch = wsClient.on('ACHIEVEMENT_UNLOCKED', (payload) => {
      if (isGuest) return;
      const ach = Array.isArray(payload) ? payload[0] : payload;
      if (ach) {
        setModalData({
          type: 'ACHIEVEMENT',
          title: ach.title,
          description: ach.description,
          xpReward: ach.xp_reward,
        });
      }
    });

    const unsubPlayer = wsClient.on('PLAYER_UPDATED', (payload) => {
      if (isGuest) return;
      if (setUser && payload) setUser((prev) => (prev ? { ...prev, ...payload } : prev));
    });

    return () => {
      unsubLevel();
      unsubAch();
      unsubPlayer();
    };
  }, [isGuest, setUser]);

  return (
    <>
      <Routes>
        
        <Route path="/" element={isNativeMobile() ? <Navigate to="/mobile/dashboard" replace /> : <LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/connect-qr" element={<div className="min-h-screen bg-[#07110B] flex items-center justify-center p-4"><ConnectMobileModal isOpen={true} onClose={() => {}} /></div>} />

        
        <Route path="/mobile" element={<MobileLayout />}>
          <Route index element={<Navigate to={isGuest ? '/mobile/academy' : '/mobile/dashboard'} replace />} />
          <Route path="connect" element={<MobileConnectPage />} />
          <Route path="dashboard" element={<ProtectedRoute><MobileDashboardPage /></ProtectedRoute>} />
          <Route path="history" element={<ProtectedRoute><MobileHistoryPage /></ProtectedRoute>} />
          <Route path="evolution" element={<ProtectedRoute><MobileEvolutionPage /></ProtectedRoute>} />
          <Route path="academy" element={<MobileAcademyPage />} />
          <Route path="academy/aula/:id" element={<MobileAcademyLessonPage />} />
          <Route path="profile" element={<ProtectedRoute><MobileProfilePage /></ProtectedRoute>} />
        </Route>

        
        <Route path="/academy" element={<Navigate to={isMobileDevice() ? '/mobile/academy' : '/app/academy'} replace />} />
        <Route path="/academy/aula/:id" element={<Navigate to={isMobileDevice() ? '/mobile/academy' : '/app/academy'} replace />} />
        <Route path="/academy/:skill" element={<Navigate to={isMobileDevice() ? '/mobile/academy' : '/app/academy'} replace />} />

        
        <Route
          path="/app"
          element={
            <ProtectedRoute allowGuest>
              <PlayerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={isGuest ? '/app/play' : '/app/dashboard'} replace />} />
          <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="play" element={<PlayPage onLevelUp={isGuest ? undefined : setModalData} />} />
          <Route path="statistics" element={<ProtectedRoute><StatisticsPage /></ProtectedRoute>} />
          <Route path="evolution" element={<ProtectedRoute><EvolutionPage /></ProtectedRoute>} />
          <Route path="academy" element={<AcademyPage />} />
          <Route path="academy/aula/:id" element={<AcademyLessonPage />} />
          <Route path="academy/:skill" element={<SkillAcademyPage />} />
          <Route path="history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="achievements" element={<ProtectedRoute><AchievementsPage /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><ProfilePage player={user} onPlayerUpdate={(p) => setUser((prev) => ({ ...prev, ...p }))} /></ProtectedRoute>} />
        </Route>

        
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          
          <Route index element={<Navigate to="/admin/sensors" replace />} />
          <Route path="sensors" element={<AdminSensorsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="equipments" element={<AdminEquipmentsPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="academy" element={<AdminAcademyPage />} />
          <Route path="diagnostic" element={<AdminDiagnosticPage />} />

          
          <Route path="overview" element={<Navigate to="/admin/sensors" replace />} />
          <Route path="sessions" element={<Navigate to="/admin/reports" replace />} />
          <Route path="settings" element={<Navigate to="/admin/sensors" replace />} />
          <Route path="iot" element={<Navigate to="/admin/diagnostic" replace />} />
        </Route>

        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      
      {!isGuest && <LevelUpModal data={modalData} onClose={() => setModalData(null)} />}
    </>
  );
}
