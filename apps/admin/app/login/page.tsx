'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/* Hexagon + Keyhole Logo (48px) */
function VaultLogo() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hexagon outline */}
      <polygon
        points="24,2 43,13 43,35 24,46 5,35 5,13"
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Keyhole circle */}
      <circle cx="24" cy="19" r="5" fill="var(--accent-primary)" />
      {/* Keyhole body */}
      <path
        d="M21 22 L24 34 L27 22 Z"
        fill="var(--accent-primary)"
      />
    </svg>
  );
}

/* Blockchain topology background pattern */
function TopologyPattern() {
  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.03 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="topo" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="1.5" fill="var(--accent-primary)" />
          <circle cx="50" cy="10" r="1.5" fill="var(--accent-primary)" />
          <circle cx="30" cy="40" r="1.5" fill="var(--accent-primary)" />
          <circle cx="70" cy="45" r="1.5" fill="var(--accent-primary)" />
          <circle cx="10" cy="70" r="1.5" fill="var(--accent-primary)" />
          <circle cx="60" cy="75" r="1.5" fill="var(--accent-primary)" />
          <line x1="10" y1="10" x2="50" y2="10" stroke="var(--accent-primary)" strokeWidth="0.5" />
          <line x1="50" y1="10" x2="30" y2="40" stroke="var(--accent-primary)" strokeWidth="0.5" />
          <line x1="10" y1="10" x2="30" y2="40" stroke="var(--accent-primary)" strokeWidth="0.5" />
          <line x1="30" y1="40" x2="70" y2="45" stroke="var(--accent-primary)" strokeWidth="0.5" />
          <line x1="30" y1="40" x2="10" y2="70" stroke="var(--accent-primary)" strokeWidth="0.5" />
          <line x1="70" y1="45" x2="60" y2="75" stroke="var(--accent-primary)" strokeWidth="0.5" />
          <line x1="10" y1="70" x2="60" y2="75" stroke="var(--accent-primary)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo)" />
    </svg>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, verify2FA } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.requires2FA) {
        setShow2FA(true);
      } else {
        if (rememberMe) {
          document.cookie = 'cvh_admin_token=mock-jwt-token; path=/; max-age=2592000';
        } else {
          document.cookie = 'cvh_admin_token=mock-jwt-token; path=/';
        }
        router.push('/');
      }
    } catch {
      setError('Invalid credentials. Please check your email and password.');
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
      document.cookie = 'cvh_admin_token=mock-jwt-token; path=/';
      router.push('/');
    } catch {
      setError('Invalid 2FA code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-page relative">
      <TopologyPattern />

      <div className="w-full max-w-[400px] mx-4 relative z-10">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <VaultLogo />
          </div>
          <h1 className="text-heading font-display text-text-primary tracking-tight">
            Crypto<span className="font-bold">Vault</span>Hub
          </h1>
          <p className="text-body text-text-muted mt-1 font-display">Admin Panel</p>
        </div>

        {/* Card */}
        <div className="bg-surface-card border border-border-default rounded-modal p-6 shadow-card">
          {!show2FA ? (
            <form onSubmit={handleLogin}>
              <h2 className="text-subheading font-semibold text-text-primary font-display mb-1">
                Sign in
              </h2>
              <p className="text-caption text-text-muted mb-6 font-display">
                Enter your credentials to access the admin dashboard.
              </p>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="email" className="block text-caption font-medium text-text-secondary mb-1.5 font-display">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@cryptovaulthub.com"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow font-display"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="block text-caption font-medium text-text-secondary mb-1.5 font-display">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow font-display"
                />
              </div>

              <div className="flex items-center justify-between mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border-default bg-surface-input text-accent-primary focus:ring-accent-primary focus:ring-offset-0 accent-[var(--accent-primary)]"
                  />
                  <span className="text-caption text-text-secondary font-display">Remember me</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-accent-primary text-accent-text font-semibold text-body py-2.5 rounded-button transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-display"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <polygon
                        points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="60"
                        strokeDashoffset="15"
                        opacity="0.6"
                      />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FA}>
              <h2 className="text-subheading font-semibold text-text-primary font-display mb-1">
                Two-Factor Authentication
              </h2>
              <p className="text-caption text-text-muted mb-6 font-display">
                Enter the 6-digit code from your authenticator app.
              </p>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                  {error}
                </div>
              )}

              <div className="mb-6">
                <label htmlFor="totp" className="block text-caption font-medium text-text-secondary mb-1.5 font-display">
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
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-text-primary placeholder:text-text-muted outline-none text-center tracking-[0.3em] text-lg font-mono transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-accent-primary text-accent-text font-semibold text-body py-2.5 rounded-button transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-display"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <polygon
                        points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="60"
                        strokeDashoffset="15"
                        opacity="0.6"
                      />
                    </svg>
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </button>

              <button
                type="button"
                onClick={() => { setShow2FA(false); setError(''); }}
                className="w-full mt-3 text-caption text-text-muted hover:text-text-primary transition-colors duration-fast font-display"
              >
                Back to login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-micro text-text-muted mt-6 font-display">
          CryptoVaultHub &copy; {new Date().getFullYear()}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
