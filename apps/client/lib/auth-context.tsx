'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ClientApiClient } from '@cvh/api-client';
import { setClientApiClient } from '@cvh/api-client/hooks';

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';
const CLIENT_API_URL = process.env.NEXT_PUBLIC_CLIENT_API_URL || 'http://localhost:3002/client';

interface ClientUser {
  id: number;
  email: string;
  name: string;
  role: string;
  clientName: string;
  tier: string;
}

interface ClientAuthContextType {
  user: ClientUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean }>;
  loginWithApiKey: (apiKey: string) => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | null>(null);

/** Initialize the @cvh/api-client SDK singleton so all React Query hooks work. */
function initSdk() {
  // With HttpOnly cookies, the SDK uses cookie-based auth (credentials: 'include').
  // We pass a placeholder token; actual auth is via the HttpOnly cookie.
  setClientApiClient(new ClientApiClient(CLIENT_API_URL, '__cookie__'));
}

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function init() {
      // If already on /login or /register, don't attempt validation
      const path = window.location.pathname;
      if (path === '/login' || path === '/register') {
        setIsLoading(false);
        return;
      }

      try {
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
          // No valid session — middleware will redirect if needed
          return;
        }

        const refreshData = await refreshRes.json();

        if (refreshData.user) {
          initSdk();
          setUser(refreshData.user);
          return;
        }

        const revalidateRes = await fetch(`${AUTH_API_URL}/validate`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (cancelled) return;
        if (revalidateRes.ok) {
          const revalidateData = await revalidateRes.json();
          initSdk();
          setUser(revalidateData.user);
        }
      } catch (e: any) {
        if (e?.name === 'AbortError' || cancelled) return;
        // Silently fail — middleware handles redirects
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

  const loginWithApiKey = async (apiKey: string) => {
    const res = await fetch(`${AUTH_API_URL}/api-keys/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Invalid API key' }));
      throw new Error(err.message || 'Invalid API key');
    }
    const data = await res.json();
    // API key login still uses the token directly for SDK initialization
    // as API keys bypass cookie-based auth
    initSdk();
    setUser(data.user);
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
    <ClientAuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, loginWithApiKey, verify2FA, logout, refreshToken }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export const useClientAuth = () => {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error('useClientAuth must be used within ClientAuthProvider');
  return ctx;
};
