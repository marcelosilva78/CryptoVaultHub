'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AdminApiClient } from '@cvh/api-client';
import { setAdminApiClient } from '@cvh/api-client/hooks';

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';
const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3001/admin';

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

/** Initialize the @cvh/api-client SDK singleton so all React Query hooks work. */
function initSdk() {
  // With HttpOnly cookies, the SDK uses cookie-based auth (credentials: 'include').
  // We pass a placeholder token; actual auth is via the HttpOnly cookie.
  setAdminApiClient(new AdminApiClient(ADMIN_API_URL, '__cookie__'));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function clearAndRedirect() {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      window.location.href = '/login';
    }

    async function init() {
      try {
        // Validate the current session via the auth service.
        // The HttpOnly cookie is sent automatically with credentials: 'include'.
        const validateRes = await fetch(`${AUTH_API_URL}/validate`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (cancelled) return;
        if (validateRes.ok) {
          const data = await validateRes.json();
          initSdk();
          setUser(data.user);
          return;
        }

        // Try refreshing the token via our server-side proxy
        const refreshRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!refreshRes.ok) {
          clearAndRedirect();
          return;
        }

        const refreshData = await refreshRes.json();

        if (refreshData.user) {
          initSdk();
          setUser(refreshData.user);
          return;
        }

        // Re-validate to get user data after refresh
        const revalidateRes = await fetch(`${AUTH_API_URL}/validate`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (cancelled) return;
        if (revalidateRes.ok) {
          const revalidateData = await revalidateRes.json();
          initSdk();
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
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(err.message || 'Login failed');
    }
    const data = await res.json();

    if (data.requires2FA) {
      return { requires2FA: true };
    }

    initSdk();
    setUser(data.user);
    return {};
  };

  const verify2FA = async (code: string) => {
    const res = await fetch(`${AUTH_API_URL}/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: '2FA verification failed' }));
      throw new Error(err.message || '2FA verification failed');
    }
    const data = await res.json();
    // 2FA verify response still needs to set cookies server-side.
    // For now, if the auth service returns tokens, the middleware cookie
    // will be updated on next refresh cycle.
    initSdk();
    setUser(data.user);
  };

  const refreshToken = useCallback(async () => {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      setUser(null);
      throw new Error('Token refresh failed');
    }
    const data = await res.json();
    if (data.user) {
      setUser(data.user);
    }
    initSdk();
  }, []);

  const logout = async () => {
    setUser(null);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
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
