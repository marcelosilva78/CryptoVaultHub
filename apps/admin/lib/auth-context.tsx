'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const token = localStorage.getItem('cvh_admin_token');
    if (token) {
      // Mock user for now
      setUser({ id: 1, email: 'admin@cryptovaulthub.com', name: 'Admin', role: 'super_admin' });
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Will connect to auth-service API
    setUser({ id: 1, email, name: 'Admin', role: 'super_admin' });
    localStorage.setItem('cvh_admin_token', 'mock-jwt-token');
    document.cookie = 'cvh_admin_token=mock-jwt-token; path=/; max-age=86400';
    return {};
  };

  const verify2FA = async (code: string) => {
    // Will connect to auth-service 2FA endpoint
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cvh_admin_token');
    document.cookie = 'cvh_admin_token=; path=/; max-age=0';
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, verify2FA, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
