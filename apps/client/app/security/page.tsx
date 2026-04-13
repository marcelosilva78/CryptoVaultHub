"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { useClientAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

/* ── Static data (no backend endpoints available for these) ────── */
type CustodyMode = "full" | "cosign" | "client-init";

const custodyModes = [
  { id: "full" as CustodyMode, label: "Full Custody", desc: "CVH manages both keys" },
  { id: "cosign" as CustodyMode, label: "Co-Sign", desc: "Both parties sign" },
  { id: "client-init" as CustodyMode, label: "Client-Init", desc: "You initiate, CVH approves" },
];

const shamirShares = [
  { name: "Share 1 -- Client Primary", status: "Downloaded", color: "green" as const },
  { name: "Share 2 -- CVH Admin", status: "Stored", color: "green" as const },
  { name: "Share 3 -- Cold Storage", status: "Exported", color: "green" as const },
  { name: "Share 4 -- Client Secondary", status: "Pending Download", color: "orange" as const },
  { name: "Share 5 -- Physical Vault", status: "Stored", color: "green" as const },
];

export default function SecurityPage() {
  const { user, isLoading } = useClientAuth();
  const [selectedMode, setSelectedMode] = useState<CustodyMode>("full");

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
          <div className="text-subheading font-display mb-4">Custody Mode</div>
          <div className="flex gap-2 mb-3.5">
            {custodyModes.map((mode) => {
              const isActive = selectedMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`flex-1 p-3 rounded-card text-center cursor-pointer transition-all duration-fast border ${
                    isActive
                      ? "bg-accent-subtle border-accent-primary"
                      : "bg-surface-input border-border-default hover:border-text-muted"
                  }`}
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
            In Full Custody mode, CryptoVaultHub manages both Platform Key and
            Client Key. All operations are automatic. Backup Key is split via
            Shamir (3-of-5) for emergency recovery.
          </div>
        </div>

        {/* Shamir Shares */}
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
          <div className="text-subheading font-display mb-4">
            Backup Key (Shamir Shares)
          </div>
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
            3 of 5 shares needed for recovery. 4/5 distributed.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-section-gap mt-section-gap">
        {/* 2FA */}
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
          <div className="text-subheading font-display mb-4">
            Two-Factor Authentication
          </div>
          <div className="flex justify-between items-center py-2.5 text-body font-display border-b border-border-subtle">
            <span className="text-text-secondary">Status</span>
            <Badge variant="success">Enabled for all members</Badge>
          </div>
          <div className="flex justify-between items-center py-2.5 text-body font-display border-b border-border-subtle">
            <span className="text-text-secondary">Required for withdrawals above</span>
            <span className="font-mono text-code text-text-primary">$5,000</span>
          </div>
          <div className="flex justify-between items-center py-2.5 text-body font-display">
            <span className="text-text-secondary">TOTP Method</span>
            <Badge variant="accent">Authenticator App</Badge>
          </div>
        </div>

        {/* Safe Mode - serious treatment with warning border */}
        <div className="bg-surface-card border border-status-warning rounded-card p-card-p shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-subheading font-display text-status-warning">
              Emergency: Safe Mode
            </span>
          </div>
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
          <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-status-error-subtle text-status-error border border-status-error hover:bg-status-error hover:text-white">
            Activate Safe Mode (requires 2FA)
          </button>
        </div>
      </div>
    </div>
  );
}
