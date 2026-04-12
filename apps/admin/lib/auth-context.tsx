'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean }>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('cvh_admin_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    function clearAndRedirect() {
      localStorage.removeItem('cvh_admin_token');
      localStorage.removeItem('cvh_admin_refresh');
      document.cookie = 'cvh_admin_token=; path=/; max-age=0';
      window.location.href = '/login';
    }

    async function init() {
      try {
        const validateRes = await fetch(`${AUTH_API_URL}/validate`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (cancelled) return;
        if (validateRes.ok) {
          const data = await validateRes.json();
          setUser(data.user);
          return;
        }

        const storedRefresh = localStorage.getItem('cvh_admin_refresh');
        if (!storedRefresh) {
          clearAndRedirect();
          return;
        }

        const refreshRes = await fetch(`${AUTH_API_URL}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefresh }),
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!refreshRes.ok) {
          clearAndRedirect();
          return;
        }

        const refreshData = await refreshRes.json();
        const accessToken = refreshData.tokens?.accessToken ?? refreshData.accessToken;
        const newRefresh = refreshData.tokens?.refreshToken ?? refreshData.refreshToken;

        if (!accessToken) {
          clearAndRedirect();
          return;
        }

        localStorage.setItem('cvh_admin_token', accessToken);
        if (newRefresh) localStorage.setItem('cvh_admin_refresh', newRefresh);
        document.cookie = `cvh_admin_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

        if (refreshData.user) {
          setUser(refreshData.user);
          return;
        }

        const revalidateRes = await fetch(`${AUTH_API_URL}/validate`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (cancelled) return;
        if (revalidateRes.ok) {
          const revalidateData = await revalidateRes.json();
          setUser(revalidateData.user);
        } else {
          clearAndRedirect();
        }
      } catch (e: any) {
        if (e?.name === 'AbortError' || cancelled) return;
        clearAndRedirect();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${AUTH_API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(err.message || 'Login failed');
    }
    const data = await res.json();

    if (data.requires2FA) {
      return { requires2FA: true };
    }

    // Auth service wraps tokens under data.tokens; fall back to flat format
    const accessToken = data.tokens?.accessToken ?? data.accessToken;
    const refresh = data.tokens?.refreshToken ?? data.refreshToken;
    const userData = data.user;
    localStorage.setItem('cvh_admin_token', accessToken);
    localStorage.setItem('cvh_admin_refresh', refresh);
    document.cookie = `cvh_admin_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    setUser(userData);
    return {};
  };

  const verify2FA = async (code: string) => {
    const res = await fetch(`${AUTH_API_URL}/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: '2FA verification failed' }));
      throw new Error(err.message || '2FA verification failed');
    }
    const data = await res.json();
    const accessToken = data.tokens?.accessToken ?? data.accessToken;
    const refresh = data.tokens?.refreshToken ?? data.refreshToken;
    const userData = data.user;
    localStorage.setItem('cvh_admin_token', accessToken);
    localStorage.setItem('cvh_admin_refresh', refresh);
    document.cookie = `cvh_admin_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    setUser(userData);
  };

  const refreshToken = useCallback(async () => {
    const refresh = localStorage.getItem('cvh_admin_refresh');
    if (!refresh) throw new Error('No refresh token');

    const res = await fetch(`${AUTH_API_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) {
      localStorage.removeItem('cvh_admin_token');
      localStorage.removeItem('cvh_admin_refresh');
      document.cookie = 'cvh_admin_token=; path=/; max-age=0';
      setUser(null);
      throw new Error('Token refresh failed');
    }
    const data = await res.json();
    const accessToken = data.tokens?.accessToken ?? data.accessToken;
    const newRefresh = data.tokens?.refreshToken ?? data.refreshToken;
    localStorage.setItem('cvh_admin_token', accessToken);
    if (newRefresh) localStorage.setItem('cvh_admin_refresh', newRefresh);
    document.cookie = `cvh_admin_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }, []);

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cvh_admin_token');
    localStorage.removeItem('cvh_admin_refresh');
    document.cookie = 'cvh_admin_token=; path=/; max-age=0';
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, verify2FA, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
