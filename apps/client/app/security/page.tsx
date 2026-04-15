"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/badge";
import { useClientAuth } from "@/lib/auth-context";
import { clientFetch } from "@/lib/api";
import { Loader2 } from "lucide-react";

/* ── Types ────────────────────────────────────────────── */
type CustodyMode = "full" | "cosign" | "client-init";

const custodyModes = [
  { id: "full" as CustodyMode, label: "Full Custody", desc: "CVH manages both keys" },
  { id: "cosign" as CustodyMode, label: "Co-Sign", desc: "Both parties sign" },
  { id: "client-init" as CustodyMode, label: "Client-Init", desc: "You initiate, CVH approves" },
];

const custodyDescriptions: Record<CustodyMode, string> = {
  full: "In Full Custody mode, CryptoVaultHub manages both Platform Key and Client Key. All operations are automatic. Backup Key is split via Shamir (3-of-5) for emergency recovery.",
  cosign: "In Co-Sign mode, both CryptoVaultHub and the client must sign transactions. This provides maximum security with shared responsibility.",
  "client-init": "In Client-Init mode, you initiate all transactions and CryptoVaultHub provides approval. Ideal for teams that want to control transaction flow.",
};

interface ShamirShare {
  name: string;
  status: string;
  color: "green" | "orange" | "red";
}

interface TwoFactorStatus {
  enabled: boolean;
  enforced: boolean;
  withdrawalThreshold: number;
  method: string;
}

export default function SecurityPage() {
  const { user, isLoading } = useClientAuth();
  const [selectedMode, setSelectedMode] = useState<CustodyMode>("full");
  const [savedMode, setSavedMode] = useState<CustodyMode>("full");
  const [custodyLoading, setCustodyLoading] = useState(false);
  const [custodyError, setCustodyError] = useState<string | null>(null);
  const [custodySuccess, setCustodySuccess] = useState(false);

  // Safe Mode state
  const [safeModeDialogOpen, setSafeModeDialogOpen] = useState(false);
  const [safeMode2faCode, setSafeMode2faCode] = useState("");
  const [safeModeLoading, setSafeModeLoading] = useState(false);
  const [safeModeError, setSafeModeError] = useState<string | null>(null);
  const [safeModeActive, setSafeModeActive] = useState(false);

  // 2FA state
  const [twoFaStatus, setTwoFaStatus] = useState<TwoFactorStatus | null>(null);
  const [twoFaLoading, setTwoFaLoading] = useState(true);

  // Shamir shares state
  const [shamirShares, setShamirShares] = useState<ShamirShare[] | null>(null);
  const [shamirLoading, setShamirLoading] = useState(true);

  // Fetch security settings on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchSecuritySettings() {
      // Fetch custody mode
      try {
        const res = await clientFetch<{ success: boolean; custodyMode: CustodyMode; safeModeActive: boolean }>('/v1/security/settings');
        if (!cancelled) {
          setSelectedMode(res.custodyMode);
          setSavedMode(res.custodyMode);
          setSafeModeActive(res.safeModeActive);
        }
      } catch {
        // Endpoint may not exist yet; keep defaults
      }

      // Fetch 2FA status
      try {
        const res = await clientFetch<{ success: boolean; twoFactor: TwoFactorStatus }>('/v1/security/2fa-status');
        if (!cancelled) {
          setTwoFaStatus(res.twoFactor);
        }
      } catch {
        // Use defaults if endpoint unavailable
        if (!cancelled) setTwoFaStatus(null);
      } finally {
        if (!cancelled) setTwoFaLoading(false);
      }

      // Fetch Shamir share status
      try {
        const res = await clientFetch<{ success: boolean; shares: ShamirShare[] }>('/v1/security/shamir-shares');
        if (!cancelled) {
          setShamirShares(res.shares);
        }
      } catch {
        // Endpoint may not exist; show fallback
        if (!cancelled) setShamirShares(null);
      } finally {
        if (!cancelled) setShamirLoading(false);
      }
    }

    fetchSecuritySettings();
    return () => { cancelled = true; };
  }, []);

  // Handle custody mode change via API
  const handleCustodyModeChange = useCallback(async (mode: CustodyMode) => {
    setSelectedMode(mode);
    setCustodyError(null);
    setCustodySuccess(false);

    if (mode === savedMode) return;

    try {
      setCustodyLoading(true);
      await clientFetch('/v1/security/custody-mode', {
        method: 'PATCH',
        body: JSON.stringify({ custodyMode: mode }),
      });
      setSavedMode(mode);
      setCustodySuccess(true);
      setTimeout(() => setCustodySuccess(false), 3000);
    } catch (err: any) {
      setCustodyError(err.message || 'Failed to update custody mode');
      setSelectedMode(savedMode); // Revert on failure
    } finally {
      setCustodyLoading(false);
    }
  }, [savedMode]);

  // Handle Safe Mode activation
  const handleActivateSafeMode = useCallback(async () => {
    if (!safeMode2faCode.trim()) {
      setSafeModeError('Please enter your 2FA code');
      return;
    }

    try {
      setSafeModeLoading(true);
      setSafeModeError(null);
      await clientFetch('/v1/security/safe-mode', {
        method: 'POST',
        body: JSON.stringify({ twoFactorCode: safeMode2faCode }),
      });
      setSafeModeActive(true);
      setSafeModeDialogOpen(false);
      setSafeMode2faCode("");
    } catch (err: any) {
      setSafeModeError(err.message || 'Failed to activate Safe Mode');
    } finally {
      setSafeModeLoading(false);
    }
  }, [safeMode2faCode]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading security settings...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">Security Settings</h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Manage custody mode, authentication, and emergency controls
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card">
        <div className="text-subheading font-display mb-4">Profile Information</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted mb-1 font-display">
              Organization
            </div>
            <div className="text-body font-semibold font-display text-text-primary">
              {user?.clientName || "--"}
            </div>
          </div>
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted mb-1 font-display">
              Plan Tier
            </div>
            {/* Tier badge using accent-subtle */}
            <Badge variant="accent">{user?.tier || "Standard"} Tier</Badge>
          </div>
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted mb-1 font-display">
              Operator
            </div>
            <div className="text-body font-display">
              <span className="text-text-primary">{user?.name || "--"}</span>{" "}
              <span className="text-text-muted">({user?.role || "--"})</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-section-gap">
        {/* Custody Mode */}
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div className="text-subheading font-display">Custody Mode</div>
            {custodyLoading && <Loader2 className="w-4 h-4 animate-spin text-accent-primary" />}
            {custodySuccess && (
              <span className="text-micro text-status-success font-display font-semibold">Saved</span>
            )}
          </div>
          {custodyError && (
            <div className="mb-3 p-2 bg-status-error-subtle text-status-error rounded-input text-caption font-display">
              {custodyError}
            </div>
          )}
          <div className="flex gap-2 mb-3.5">
            {custodyModes.map((mode) => {
              const isActive = selectedMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleCustodyModeChange(mode.id)}
                  disabled={custodyLoading}
                  className={`flex-1 p-3 rounded-card text-center cursor-pointer transition-all duration-fast border ${
                    isActive
                      ? "bg-accent-subtle border-accent-primary"
                      : "bg-surface-input border-border-default hover:border-text-muted"
                  } ${custodyLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div
                    className={`text-body font-bold font-display ${
                      isActive
                        ? "text-accent-primary"
                        : "text-text-secondary"
                    }`}
                  >
                    {mode.label}
                  </div>
                  <div className="text-micro text-text-muted mt-0.5 font-display">
                    {mode.desc}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-caption text-text-muted p-2.5 bg-surface-elevated rounded-input font-display border border-border-subtle">
            {custodyDescriptions[selectedMode]}
          </div>
        </div>

        {/* Shamir Shares */}
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
          <div className="text-subheading font-display mb-4">
            Backup Key (Shamir Shares)
          </div>
          {shamirLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
              <span className="ml-2 text-text-muted text-caption font-display">Loading share status...</span>
            </div>
          ) : shamirShares ? (
            <>
              <div className="mb-2">
                {shamirShares.map((share, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center py-2.5 text-body font-display ${
                      i < shamirShares.length - 1
                        ? "border-b border-border-subtle"
                        : ""
                    }`}
                  >
                    <span className="text-text-primary">{share.name}</span>
                    <Badge variant={share.color}>{share.status}</Badge>
                  </div>
                ))}
              </div>
              <div className="text-micro text-text-muted font-display">
                3 of 5 shares needed for recovery.
              </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="text-caption text-text-muted font-display mb-1">
                Shamir share status is managed by your account administrator.
              </div>
              <div className="text-micro text-text-muted font-display">
                Contact admin for share distribution and recovery details.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-section-gap mt-section-gap">
        {/* 2FA */}
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
          <div className="text-subheading font-display mb-4">
            Two-Factor Authentication
          </div>
          {twoFaLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center py-2.5 text-body font-display border-b border-border-subtle">
                <span className="text-text-secondary">Status</span>
                {twoFaStatus?.enabled ? (
                  <Badge variant="success">{twoFaStatus.enforced ? "Enforced for all members" : "Enabled"}</Badge>
                ) : (
                  <Badge variant="warning">Not configured</Badge>
                )}
              </div>
              <div className="flex justify-between items-center py-2.5 text-body font-display border-b border-border-subtle">
                <span className="text-text-secondary">Required for withdrawals above</span>
                <span className="font-mono text-code text-text-primary">
                  ${twoFaStatus?.withdrawalThreshold?.toLocaleString() ?? "5,000"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 text-body font-display">
                <span className="text-text-secondary">TOTP Method</span>
                <Badge variant="accent">{twoFaStatus?.method || "Authenticator App"}</Badge>
              </div>
            </>
          )}
        </div>

        {/* Safe Mode - serious treatment with warning border */}
        <div className={`bg-surface-card border rounded-card p-card-p shadow-card ${safeModeActive ? "border-status-error" : "border-status-warning"}`}>
          <div className="flex items-center gap-2 mb-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={safeModeActive ? "var(--status-error)" : "var(--status-warning)"} strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className={`text-subheading font-display ${safeModeActive ? "text-status-error" : "text-status-warning"}`}>
              Emergency: Safe Mode
            </span>
            {safeModeActive && <Badge variant="red">ACTIVE</Badge>}
          </div>

          {safeModeActive ? (
            <div className="p-3 bg-status-error-subtle rounded-input border border-status-error">
              <div className="text-caption text-status-error font-semibold font-display">
                Safe Mode is active. All withdrawals are restricted to signer addresses only.
                This cannot be deactivated.
              </div>
            </div>
          ) : (
            <>
              <div className="text-caption text-text-muted mb-3 font-display">
                Activating Safe Mode will restrict ALL withdrawals to signer
                addresses only. This is IRREVOCABLE and cannot be undone.
              </div>
              <div className="p-3 bg-status-warning-subtle rounded-input mb-3 border border-status-warning">
                <div className="text-micro text-status-warning font-semibold mb-1 font-display uppercase tracking-wide">
                  What happens when activated:
                </div>
                <ul className="text-caption text-text-secondary font-display space-y-0.5 list-disc list-inside">
                  <li>All pending withdrawals are cancelled</li>
                  <li>Only signer addresses can receive funds</li>
                  <li>Cannot be deactivated</li>
                </ul>
              </div>

              {/* Confirmation Dialog */}
              {safeModeDialogOpen ? (
                <div className="p-3 bg-surface-elevated rounded-input border border-border-default mb-3">
                  <div className="text-caption font-semibold text-status-error font-display mb-2">
                    Confirm Safe Mode Activation
                  </div>
                  <div className="text-micro text-text-muted font-display mb-3">
                    Enter your 2FA code to confirm. This action is irreversible.
                  </div>
                  {safeModeError && (
                    <div className="mb-2 p-2 bg-status-error-subtle text-status-error rounded-input text-caption font-display">
                      {safeModeError}
                    </div>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={safeMode2faCode}
                    onChange={(e) => setSafeMode2faCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit 2FA code"
                    className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast mb-2"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSafeModeDialogOpen(false);
                        setSafeMode2faCode("");
                        setSafeModeError(null);
                      }}
                      className="flex-1 px-3 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-text-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleActivateSafeMode}
                      disabled={safeModeLoading || safeMode2faCode.length < 6}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-status-error text-white border-none hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {safeModeLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Confirm Activation"
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSafeModeDialogOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-status-error-subtle text-status-error border border-status-error hover:bg-status-error hover:text-white"
                >
                  Activate Safe Mode (requires 2FA)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
