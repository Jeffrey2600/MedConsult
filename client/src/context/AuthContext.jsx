import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth.js';
import { getToken, setToken, clearToken } from '../api/client.js';

const AuthContext = createContext(null);

/**
 * Holds the only genuinely global client state: who is signed in.
 * Everything else (doctors, appointments, prescriptions) is server data and
 * lives in TanStack Query, which handles its own caching and refetching.
 */
export function AuthProvider({ children }) {
  const { i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(getToken() ? 'loading' : 'anonymous');

  const applySession = useCallback(
    (data) => {
      setUser(data.user);
      setProfile(data.profile ?? null);
      setStatus('authenticated');
      // Follow the language saved on the account, so signing in on a shared
      // or new device restores the user's own language choice.
      if (data.user?.preferredLanguage && data.user.preferredLanguage !== i18n.language) {
        i18n.changeLanguage(data.user.preferredLanguage);
      }
    },
    [i18n]
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setProfile(null);
    setStatus('anonymous');
  }, []);

  // Restore the session on a page refresh.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;

    authApi
      .me()
      .then((data) => {
        if (!cancelled) applySession(data);
      })
      .catch(() => {
        if (!cancelled) logout();
      });

    return () => {
      cancelled = true;
    };
  }, [applySession, logout]);

  // The axios interceptor fires this when the server rejects our token.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('medconsult:unauthorised', handler);
    return () => window.removeEventListener('medconsult:unauthorised', handler);
  }, [logout]);

  const login = useCallback(
    async (credentials) => {
      const data = await authApi.login(credentials);
      setToken(data.token);
      applySession(data);
      return data;
    },
    [applySession]
  );

  const registerPatient = useCallback(
    async (payload) => {
      const data = await authApi.registerPatient(payload);
      setToken(data.token);
      applySession(data);
      return data;
    },
    [applySession]
  );

  const registerDoctor = useCallback(
    async (payload) => {
      const data = await authApi.registerDoctor(payload);
      setToken(data.token);
      applySession(data);
      return data;
    },
    [applySession]
  );

  /** Called after a profile edit so the header and guards stay in sync. */
  const refresh = useCallback(async () => {
    const data = await authApi.me();
    applySession(data);
    return data;
  }, [applySession]);

  const value = useMemo(
    () => ({
      user,
      profile,
      status,
      isLoading: status === 'loading',
      isAuthenticated: status === 'authenticated',
      role: user?.role ?? null,
      login,
      logout,
      registerPatient,
      registerDoctor,
      refresh,
      setProfile,
    }),
    [user, profile, status, login, logout, registerPatient, registerDoctor, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
