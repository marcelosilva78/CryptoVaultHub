'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
}

const ClientAuthContext = createContext<ClientAuthContextType | null>(null);

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('cvh_client_token');
    if (token) {
      // Mock client user for now
      setUser({
        id: 1,
        email: 'operador@corretoraxyz.com',
        name: 'Operador Admin',
        role: 'Owner',
        clientName: 'Corretora XYZ',
        tier: 'Business',
      });
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Will connect to auth-service API
    setUser({
      id: 1,
      email,
      name: 'Operador Admin',
      role: 'Owner',
      clientName: 'Corretora XYZ',
      tier: 'Business',
    });
    localStorage.setItem('cvh_client_token', 'mock-jwt-token');
    return {};
  };

  const loginWithApiKey = async (apiKey: string) => {
    // Will connect to auth-service API key endpoint
    setUser({
      id: 1,
      email: 'api@corretoraxyz.com',
      name: 'API User',
      role: 'api',
      clientName: 'Corretora XYZ',
      tier: 'Business',
    });
    localStorage.setItem('cvh_client_token', 'mock-api-key-token');
  };

  const verify2FA = async (code: string) => {
    // Will connect to auth-service 2FA endpoint
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cvh_client_token');
    window.location.href = '/login';
  };

  return (
    <ClientAuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, loginWithApiKey, verify2FA, logout }}
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
