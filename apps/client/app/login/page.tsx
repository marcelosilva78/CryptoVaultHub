'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAuth } from '@/lib/auth-context';

type AuthMode = 'email' | 'apikey';

export default function ClientLoginPage() {
  const router = useRouter();
  const { login, loginWithApiKey, verify2FA } = useClientAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.requires2FA) {
        setShow2FA(true);
      } else {
        document.cookie = 'cvh_client_token=mock-jwt-token; path=/';
        router.push('/');
      }
    } catch {
      setError('Invalid credentials. Please check your email and password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApiKeyLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await loginWithApiKey(apiKey);
      document.cookie = 'cvh_client_token=mock-api-key-token; path=/';
      router.push('/');
    } catch {
      setError('Invalid API key. Please check and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FA = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await verify2FA(totpCode);
      document.cookie = 'cvh_client_token=mock-jwt-token; path=/';
      router.push('/');
    } catch {
      setError('Invalid 2FA code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-cvh-bg-primary">
      <div className="w-full max-w-[400px] mx-4">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-cvh-accent to-cvh-purple rounded-[12px] mb-4">
            <span className="text-2xl font-extrabold text-white">V</span>
          </div>
          <h1 className="text-xl font-bold text-cvh-text-primary tracking-tight">
            Crypto<span className="text-cvh-accent">Vault</span>Hub
          </h1>
          <p className="text-sm text-cvh-text-muted mt-1">Client Portal</p>
        </div>

        {/* Card */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-[12px] p-6">
          {show2FA ? (
            <form onSubmit={handle2FA}>
              <h2 className="text-lg font-semibold text-cvh-text-primary mb-1">
                Two-Factor Authentication
              </h2>
              <p className="text-xs text-cvh-text-muted mb-6">
                Enter the 6-digit code from your authenticator app.
              </p>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.25)] rounded-[8px] text-red-400 text-xs">
                  {error}
                </div>
              )}

              <div className="mb-6">
                <label htmlFor="totp" className="block text-xs font-medium text-cvh-text-secondary mb-1.5">
                  Verification Code
                </label>
                <input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full bg-cvh-bg-primary border border-cvh-border rounded-[8px] px-3 py-2.5 text-sm text-cvh-text-primary placeholder-cvh-text-muted outline-none text-center tracking-[0.3em] text-lg font-mono transition-all focus:border-cvh-accent focus:ring-1 focus:ring-cvh-accent/30"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-cvh-accent text-white font-semibold text-sm py-2.5 rounded-[8px] transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </button>

              <button
                type="button"
                onClick={() => { setShow2FA(false); setError(''); }}
                className="w-full mt-3 text-xs text-cvh-text-muted hover:text-cvh-text-primary transition-colors"
              >
                Back to login
              </button>
            </form>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-cvh-text-primary mb-1">Sign in</h2>
              <p className="text-xs text-cvh-text-muted mb-5">
                Access your CryptoVaultHub client dashboard.
              </p>

              {/* Auth mode tabs */}
              <div className="flex mb-6 bg-cvh-bg-primary rounded-[8px] p-1">
                <button
                  type="button"
                  onClick={() => { setAuthMode('email'); setError(''); }}
                  className={`flex-1 text-xs font-medium py-2 rounded-[6px] transition-all ${
                    authMode === 'email'
                      ? 'bg-cvh-bg-secondary text-cvh-accent shadow-sm'
                      : 'text-cvh-text-muted hover:text-cvh-text-secondary'
                  }`}
                >
                  Email &amp; Password
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('apikey'); setError(''); }}
                  className={`flex-1 text-xs font-medium py-2 rounded-[6px] transition-all ${
                    authMode === 'apikey'
                      ? 'bg-cvh-bg-secondary text-cvh-accent shadow-sm'
                      : 'text-cvh-text-muted hover:text-cvh-text-secondary'
                  }`}
                >
                  API Key
                </button>
              </div>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.25)] rounded-[8px] text-red-400 text-xs">
                  {error}
                </div>
              )}

              {authMode === 'email' ? (
                <form onSubmit={handleEmailLogin}>
                  <div className="mb-4">
                    <label htmlFor="email" className="block text-xs font-medium text-cvh-text-secondary mb-1.5">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full bg-cvh-bg-primary border border-cvh-border rounded-[8px] px-3 py-2.5 text-sm text-cvh-text-primary placeholder-cvh-text-muted outline-none transition-all focus:border-cvh-accent focus:ring-1 focus:ring-cvh-accent/30"
                    />
                  </div>

                  <div className="mb-6">
                    <label htmlFor="password" className="block text-xs font-medium text-cvh-text-secondary mb-1.5">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-cvh-bg-primary border border-cvh-border rounded-[8px] px-3 py-2.5 text-sm text-cvh-text-primary placeholder-cvh-text-muted outline-none transition-all focus:border-cvh-accent focus:ring-1 focus:ring-cvh-accent/30"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-cvh-accent text-white font-semibold text-sm py-2.5 rounded-[8px] transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign in'
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleApiKeyLogin}>
                  <div className="mb-6">
                    <label htmlFor="apikey" className="block text-xs font-medium text-cvh-text-secondary mb-1.5">
                      API Key
                    </label>
                    <input
                      id="apikey"
                      type="password"
                      required
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="cvh_live_..."
                      className="w-full bg-cvh-bg-primary border border-cvh-border rounded-[8px] px-3 py-2.5 text-sm text-cvh-text-primary placeholder-cvh-text-muted outline-none font-mono transition-all focus:border-cvh-accent focus:ring-1 focus:ring-cvh-accent/30"
                    />
                    <p className="text-[10px] text-cvh-text-muted mt-1.5">
                      You can find your API key in Settings &gt; API Keys.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-cvh-accent text-white font-semibold text-sm py-2.5 rounded-[8px] transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      'Authenticate'
                    )}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-[10px] text-cvh-text-muted mt-6">
          CryptoVaultHub &copy; {new Date().getFullYear()}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
