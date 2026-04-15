"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useClientAuth } from "@/lib/auth-context";

type AuthMode = "email" | "apikey";

/* Hexagon + keyhole logo SVG (larger for login) */
function LogoIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 2L36.5 11V29L20 38L3.5 29V11L20 2Z"
        stroke="var(--accent-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="20" cy="16" r="4.5" fill="var(--accent-primary)" />
      <path d="M17 19L16 28H24L23 19" fill="var(--accent-primary)" />
    </svg>
  );
}

/* Blockchain topology pattern (very subtle background) */
function TopologyPattern() {
  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.03 }}
    >
      <defs>
        <pattern
          id="topology"
          x="0"
          y="0"
          width="120"
          height="120"
          patternUnits="userSpaceOnUse"
        >
          {/* Nodes */}
          <circle cx="10" cy="10" r="2" fill="var(--accent-primary)" />
          <circle cx="60" cy="25" r="2.5" fill="var(--accent-primary)" />
          <circle cx="110" cy="15" r="2" fill="var(--accent-primary)" />
          <circle cx="35" cy="55" r="2" fill="var(--accent-primary)" />
          <circle cx="85" cy="65" r="2.5" fill="var(--accent-primary)" />
          <circle cx="15" cy="95" r="2" fill="var(--accent-primary)" />
          <circle cx="70" cy="100" r="2" fill="var(--accent-primary)" />
          <circle cx="105" cy="85" r="2.5" fill="var(--accent-primary)" />
          {/* Connections */}
          <line
            x1="10" y1="10" x2="60" y2="25"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="60" y1="25" x2="110" y2="15"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="60" y1="25" x2="35" y2="55"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="35" y1="55" x2="85" y2="65"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="85" y1="65" x2="110" y2="15"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="35" y1="55" x2="15" y2="95"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="15" y1="95" x2="70" y2="100"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="70" y1="100" x2="105" y2="85"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="85" y1="65" x2="105" y2="85"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
          <line
            x1="10" y1="10" x2="35" y2="55"
            stroke="var(--accent-primary)" strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topology)" />
    </svg>
  );
}

export default function ClientLoginPage() {
  const router = useRouter();
  const { login, loginWithApiKey, verify2FA } = useClientAuth();

  const [authMode, setAuthMode] = useState<AuthMode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [show2FA, setShow2FA] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.requires2FA) {
        setShow2FA(true);
      } else {
        router.push("/");
      }
    } catch {
      setError("Invalid credentials. Please check your email and password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApiKeyLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await loginWithApiKey(apiKey);
      router.push("/");
    } catch {
      setError("Invalid API key. Please check and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FA = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await verify2FA(totpCode);
      router.push("/");
    } catch {
      setError("Invalid 2FA code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface-page z-[200]">
      <TopologyPattern />

      <div className="w-full max-w-[420px] mx-4 relative z-10">
        {/* Logo + Wordmark */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <LogoIcon size={48} />
          </div>
          <h1 className="text-heading font-display tracking-tight text-text-primary">
            <span className="font-[400]">Crypto</span>
            <span className="text-accent-primary font-[700]">Vault</span>
            <span className="font-[400]">Hub</span>
          </h1>
          <p className="text-caption text-text-muted mt-1 font-display">
            Client Portal
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-card border border-border-default rounded-modal p-6 shadow-card">
          {show2FA ? (
            <form onSubmit={handle2FA}>
              <h2 className="text-subheading text-text-primary mb-1 font-display">
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
                <label
                  htmlFor="totp"
                  className="block text-caption font-medium text-text-secondary mb-1.5 font-display"
                >
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
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-text-primary placeholder:text-text-muted outline-none text-center tracking-[0.3em] text-lg font-mono transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-accent-primary text-accent-text font-semibold text-body py-2.5 rounded-button transition-all duration-fast hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-display"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShow2FA(false);
                  setError("");
                }}
                className="w-full mt-3 text-caption text-text-muted hover:text-text-primary transition-colors duration-fast font-display"
              >
                Back to login
              </button>
            </form>
          ) : (
            <>
              <h2 className="text-subheading text-text-primary mb-1 font-display">
                Sign in
              </h2>
              <p className="text-caption text-text-muted mb-5 font-display">
                Access your CryptoVaultHub client dashboard.
              </p>

              {/* Auth mode tabs */}
              <div className="flex mb-6 bg-surface-input rounded-card p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("email");
                    setError("");
                  }}
                  className={`flex-1 text-caption font-medium py-2 rounded-input transition-all duration-fast font-display ${
                    authMode === "email"
                      ? "bg-surface-card text-accent-primary shadow-card"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  Email &amp; Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("apikey");
                    setError("");
                  }}
                  className={`flex-1 text-caption font-medium py-2 rounded-input transition-all duration-fast font-display ${
                    authMode === "apikey"
                      ? "bg-surface-card text-accent-primary shadow-card"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  API Key
                </button>
              </div>

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                  {error}
                </div>
              )}

              {authMode === "email" ? (
                <form onSubmit={handleEmailLogin}>
                  <div className="mb-4">
                    <label
                      htmlFor="email"
                      className="block text-caption font-medium text-text-secondary mb-1.5 font-display"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow font-display"
                    />
                  </div>

                  <div className="mb-4">
                    <label
                      htmlFor="password"
                      className="block text-caption font-medium text-text-secondary mb-1.5 font-display"
                    >
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

                  {/* Remember me */}
                  <div className="flex items-center gap-2 mb-6">
                    <input
                      id="remember"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded-[3px] border border-border-default bg-surface-input accent-accent-primary"
                    />
                    <label
                      htmlFor="remember"
                      className="text-caption text-text-secondary font-display cursor-pointer"
                    >
                      Remember me
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-accent-primary text-accent-text font-semibold text-body py-2.5 rounded-button transition-all duration-fast hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-display"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleApiKeyLogin}>
                  <div className="mb-6">
                    <label
                      htmlFor="apikey"
                      className="block text-caption font-medium text-text-secondary mb-1.5 font-display"
                    >
                      API Key
                    </label>
                    <input
                      id="apikey"
                      type="password"
                      required
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="cvh_live_..."
                      className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none font-mono transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow"
                    />
                    <p className="text-micro text-text-muted mt-1.5 font-display">
                      You can find your API key in Settings &gt; API Keys.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-accent-primary text-accent-text font-semibold text-body py-2.5 rounded-button transition-all duration-fast hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-display"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      "Authenticate"
                    )}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-micro text-text-muted mt-6 font-display">
          CryptoVaultHub &copy; {new Date().getFullYear()}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
