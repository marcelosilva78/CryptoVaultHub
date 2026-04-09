'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

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
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0c]">
      <div className="w-full max-w-[400px] mx-4">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#d4a843] to-[#b8922e] rounded-[12px] mb-4">
            <span className="text-2xl font-extrabold text-black">V</span>
          </div>
          <h1 className="text-xl font-bold text-[#e8e8ed] tracking-tight">
            Crypto<span className="text-[#d4a843]">Vault</span>Hub
          </h1>
          <p className="text-sm text-[#55556a] mt-1">Admin Panel</p>
        </div>

        {/* Card */}
        <div className="bg-[#111114] border border-[#1e1e28] rounded-[12px] p-6">
          {!show2FA ? (
            <form onSubmit={handleLogin}>
              <h2 className="text-lg font-semibold text-[#e8e8ed] mb-1">Sign in</h2>
              <p className="text-xs text-[#55556a] mb-6">
                Enter your credentials to access the admin dashboard.
              </p>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-[rgba(248,113,113,0.12)] border border-[rgba(248,113,113,0.25)] rounded-[8px] text-[#f87171] text-xs">
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="email" className="block text-xs font-medium text-[#8888a0] mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@cryptovaulthub.com"
                  className="w-full bg-[#18181c] border border-[#2a2a35] rounded-[8px] px-3 py-2.5 text-sm text-[#e8e8ed] placeholder-[#55556a] outline-none transition-all focus:border-[#d4a843] focus:ring-1 focus:ring-[rgba(212,168,67,0.3)]"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="block text-xs font-medium text-[#8888a0] mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-[#18181c] border border-[#2a2a35] rounded-[8px] px-3 py-2.5 text-sm text-[#e8e8ed] placeholder-[#55556a] outline-none transition-all focus:border-[#d4a843] focus:ring-1 focus:ring-[rgba(212,168,67,0.3)]"
                />
              </div>

              <div className="flex items-center justify-between mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#2a2a35] bg-[#18181c] text-[#d4a843] focus:ring-[#d4a843] focus:ring-offset-0"
                  />
                  <span className="text-xs text-[#8888a0]">Remember me</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-[#d4a843] to-[#b8922e] text-black font-semibold text-sm py-2.5 rounded-[8px] transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FA}>
              <h2 className="text-lg font-semibold text-[#e8e8ed] mb-1">Two-Factor Authentication</h2>
              <p className="text-xs text-[#55556a] mb-6">
                Enter the 6-digit code from your authenticator app.
              </p>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-[rgba(248,113,113,0.12)] border border-[rgba(248,113,113,0.25)] rounded-[8px] text-[#f87171] text-xs">
                  {error}
                </div>
              )}

              <div className="mb-6">
                <label htmlFor="totp" className="block text-xs font-medium text-[#8888a0] mb-1.5">
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
                  className="w-full bg-[#18181c] border border-[#2a2a35] rounded-[8px] px-3 py-2.5 text-sm text-[#e8e8ed] placeholder-[#55556a] outline-none text-center tracking-[0.3em] text-lg font-mono transition-all focus:border-[#d4a843] focus:ring-1 focus:ring-[rgba(212,168,67,0.3)]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-[#d4a843] to-[#b8922e] text-black font-semibold text-sm py-2.5 rounded-[8px] transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </button>

              <button
                type="button"
                onClick={() => { setShow2FA(false); setError(''); }}
                className="w-full mt-3 text-xs text-[#8888a0] hover:text-[#e8e8ed] transition-colors"
              >
                Back to login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[10px] text-[#55556a] mt-6">
          CryptoVaultHub &copy; {new Date().getFullYear()}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
