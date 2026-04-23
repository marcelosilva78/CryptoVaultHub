"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const AUTH_API_URL =
  process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:8000/auth";

/* Hexagon + keyhole logo SVG */
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

type PageState =
  | { kind: "loading" }
  | { kind: "form"; email: string }
  | { kind: "error"; message: string };

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setPageState({ kind: "error", message: "Invalid invite link." });
      return;
    }

    fetch(`${AUTH_API_URL}/invite/${token}/validate`)
      .then(async (res) => {
        if (res.status === 410) {
          setPageState({
            kind: "error",
            message:
              "This invite link has expired. Ask your administrator to send a new one.",
          });
        } else if (res.status === 409) {
          setPageState({
            kind: "error",
            message:
              "This invite link has already been used. Try logging in instead.",
          });
        } else if (!res.ok) {
          setPageState({ kind: "error", message: "Invalid invite link." });
        } else {
          const data = await res.json();
          setPageState({ kind: "form", email: data.email });
        }
      })
      .catch(() => {
        setPageState({ kind: "error", message: "Invalid invite link." });
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/register-accept', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password, name }),
      });

      if (res.status === 410) {
        setFormError("This invite link has expired.");
        return;
      }
      if (res.status === 409) {
        setFormError(
          "This invite link has already been used. Try logging in instead."
        );
        return;
      }
      if (!res.ok) {
        setFormError("Something went wrong. Please try again.");
        return;
      }

      router.push("/setup");
    } catch {
      setFormError("Something went wrong. Please try again.");
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
          {pageState.kind === "loading" && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-6 h-6 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
              <p className="text-caption text-text-muted font-display">
                Validating invite link&hellip;
              </p>
            </div>
          )}

          {pageState.kind === "error" && (
            <div className="py-4">
              <h2 className="text-subheading text-text-primary mb-2 font-display">
                Invite Link Invalid
              </h2>
              <p className="text-body text-status-error font-display">
                {pageState.message}
              </p>
              <div className="mt-6 pt-4 border-t border-border-default">
                <a
                  href="/login"
                  className="text-caption text-accent-primary hover:text-accent-hover transition-colors duration-fast font-display"
                >
                  Go to login
                </a>
              </div>
            </div>
          )}

          {pageState.kind === "form" && (
            <form onSubmit={handleSubmit}>
              <h2 className="text-subheading text-text-primary mb-1 font-display">
                Create your account
              </h2>
              <p className="text-caption text-text-muted mb-6 font-display">
                Complete your registration to access CryptoVaultHub.
              </p>

              {formError && (
                <div className="mb-4 px-3 py-2.5 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                  {formError}
                </div>
              )}

              {/* Email (read-only) */}
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
                  readOnly
                  value={pageState.email}
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-muted placeholder:text-text-muted outline-none font-display cursor-not-allowed opacity-70"
                />
              </div>

              {/* Full Name */}
              <div className="mb-4">
                <label
                  htmlFor="name"
                  className="block text-caption font-medium text-text-secondary mb-1.5 font-display"
                >
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow font-display"
                />
              </div>

              {/* Password */}
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
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow font-display"
                />
              </div>

              {/* Confirm Password */}
              <div className="mb-6">
                <label
                  htmlFor="confirmPassword"
                  className="block text-caption font-medium text-text-secondary mb-1.5 font-display"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary placeholder:text-text-muted outline-none transition-all duration-fast focus:border-border-focus focus:ring-1 focus:ring-accent-glow font-display"
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
                    Creating account&hellip;
                  </>
                ) : (
                  "Create account"
                )}
              </button>

              <div className="mt-4 text-center">
                <a
                  href="/login"
                  className="text-caption text-text-muted hover:text-text-primary transition-colors duration-fast font-display"
                >
                  Already have an account? Sign in
                </a>
              </div>
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
