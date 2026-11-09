import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken, getAuthToken, setGuestToken, getGuestToken } from '../services/api';
import { syncService } from '../services/syncService';
import { cloudAuthService } from '../services/cloudAuthService';
import { isWebDemoMode, isCloudOnlyMode, isEquipmentMode } from '../services/appEnvironment';
import { getSavedServerUrl, isNativeMobile } from '../services/serverConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [guest, setGuest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    syncService.setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    checkCurrentAuth();
  }, []);

  const checkCurrentAuth = async () => {
    const cloudSession = cloudAuthService.getStoredCloudSession();
    const token = getAuthToken();
    const guestToken = getGuestToken();

    if (cloudSession?.accessToken && (isWebDemoMode() || isCloudOnlyMode() || isNativeMobile() || !getSavedServerUrl() || !token)) {
      if (cloudSession.expiresAt && cloudSession.expiresAt < Date.now() + 60000 && cloudSession.refreshToken) {
        try {
          const refreshed = await cloudAuthService.refreshCloudSession({
            refreshToken: cloudSession.refreshToken
          });
          setUser({
            id: refreshed.user?.id || cloudSession.user?.id,
            cloudUserId: refreshed.user?.id || cloudSession.user?.id,
            name: refreshed.user?.user_metadata?.name || refreshed.user?.email?.split('@')[0] || cloudSession.user?.name,
            email: refreshed.user?.email || cloudSession.user?.email,
            role: 'player',
            avatar: '🎾',
            status: 'active',
            isCloudOnly: true
          });
          setLoading(false);
          return;
        } catch (_) {
          cloudAuthService.clearCloudSession();
        }
      } else {
        setUser({
          id: cloudSession.user?.id,
          cloudUserId: cloudSession.user?.id,
          name: cloudSession.user?.user_metadata?.name || cloudSession.user?.email?.split('@')[0] || 'Atleta',
          email: cloudSession.user?.email,
          role: 'player',
          avatar: '🎾',
          status: 'active',
          isCloudOnly: true
        });
        setLoading(false);
        return;
      }
    }

    if (token && !isWebDemoMode()) {
      if (isEquipmentMode() && !isNativeMobile()) {
        try {
          const data = await api.getMe();
          if (data?.user) {
            setGuestToken(null);
            setGuest(null);
            setUser(data.user);
            setLoading(false);
            return;
          }
        } catch (e) {
        }
      }
    }

    if (cloudSession?.accessToken) {
      if (cloudSession.expiresAt && cloudSession.expiresAt < Date.now() + 60000 && cloudSession.refreshToken) {
        try {
          const refreshed = await cloudAuthService.refreshCloudSession({
            refreshToken: cloudSession.refreshToken
          });
          setUser({
            id: refreshed.user?.id || cloudSession.user?.id,
            cloudUserId: refreshed.user?.id || cloudSession.user?.id,
            name: refreshed.user?.user_metadata?.name || refreshed.user?.email?.split('@')[0] || cloudSession.user?.name,
            email: refreshed.user?.email || cloudSession.user?.email,
            role: 'player',
            avatar: '🎾',
            status: 'active',
            isCloudOnly: true
          });
          setLoading(false);
          return;
        } catch (_) {
          cloudAuthService.clearCloudSession();
        }
      } else {
        setUser({
          id: cloudSession.user?.id,
          cloudUserId: cloudSession.user?.id,
          name: cloudSession.user?.user_metadata?.name || cloudSession.user?.email?.split('@')[0] || 'Atleta',
          email: cloudSession.user?.email,
          role: 'player',
          avatar: '🎾',
          status: 'active',
          isCloudOnly: true
        });
        setLoading(false);
        return;
      }
    }

    if (guestToken && isEquipmentMode() && !isNativeMobile()) {
      try {
        const data = await api.getGuestMe();
        if (data?.guest) {
          setUser(null);
          setGuest(data.guest);
          setLoading(false);
          return;
        }
      } catch (e) {
        setGuestToken(null);
        setGuest(null);
      }
    }

    setUser(null);
    setGuest(null);
    setLoading(false);
  };

  const login = async (username, password) => {
    const prevGuestToken = getGuestToken();
    if (prevGuestToken) {
      try {
        await api.logoutGuest();
      } catch (e) {}
      setGuestToken(null);
      setGuest(null);
    }

    const res = await api.login({ username, password, guest_token: prevGuestToken || undefined });
    if (res.success && res.token) {
      setGuestToken(null);
      setGuest(null);
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    }
    throw new Error('Falha no login');
  };

  const loginCloud = async (email, password) => {
    const prevGuestToken = getGuestToken();
    if (prevGuestToken) {
      try {
        await api.logoutGuest();
      } catch (e) {}
      setGuestToken(null);
      setGuest(null);
    }

    const res = await cloudAuthService.loginWithCloudAccount({ email, password });
    if (res.success) {
      setGuestToken(null);
      setGuest(null);
      if (res.token) {
        setAuthToken(res.token);
      }
      setUser(res.user);
      return res.user;
    }
    throw new Error(res.error || 'Falha ao autenticar com conta online');
  };

  const signupCloud = async (name, email, password) => {
    const signupRes = await cloudAuthService.registerWithCloudAccount({ name, email, password });
    if (signupRes.localLogin?.success && signupRes.localLogin?.token) {
      setGuestToken(null);
      setGuest(null);
      setAuthToken(signupRes.localLogin.token);
      setUser(signupRes.localLogin.user);
    }
    return signupRes;
  };

  const recoverPasswordCloud = async (email) => {
    return cloudAuthService.recoverPasswordForCloud({ email });
  };

  const resendConfirmationEmail = async (email) => {
    return cloudAuthService.resendConfirmationEmail({ email });
  };

  const startGuest = async () => {
    if (getAuthToken()) {
      setAuthToken(null);
      setUser(null);
    }
    if (getGuestToken()) {
      try {
        await api.logoutGuest();
      } catch (e) {}
      setGuestToken(null);
    }

    const res = await api.startGuestSession();
    if (res.success && res.token && res.guest) {
      setGuestToken(res.token);
      setUser(null);
      setGuest(res.guest);
      return res.guest;
    }
    throw new Error('Falha ao iniciar sessão de visitante');
  };

  const exitGuest = async () => {
    try {
      await api.logoutGuest();
    } catch (e) {}
    setGuestToken(null);
    setGuest(null);
  };

  const logout = async () => {
    cloudAuthService.clearCloudSession();
    if (getGuestToken()) {
      try {
        await api.logoutGuest();
      } catch (e) {}
      setGuestToken(null);
      setGuest(null);
    }
    if (getAuthToken()) {
      try {
        await api.logout();
      } catch (e) {}
      setAuthToken(null);
      setUser(null);
    } else {
      setUser(null);
    }
  };

  const value = {
    user,
    setUser,
    guest,
    setGuest,
    loading,
    login,
    loginCloud,
    signupCloud,
    recoverPasswordCloud,
    resendConfirmationEmail,
    startGuest,
    exitGuest,
    logout,
    checkCurrentAuth,
    isAuthenticated: !!user,
    isGuest: !!guest && !user,
    canPlay: !!user || !!guest,
    isAdmin: user?.role === 'admin',
    isPlayer: user?.role === 'player'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
