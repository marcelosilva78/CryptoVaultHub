"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { custodyModes, shamirShares } from "@/lib/mock-data";
import type { CustodyMode } from "@/lib/mock-data";

export default function SecurityPage() {
  const [selectedMode, setSelectedMode] = useState<CustodyMode>("full");

  return (
    <div>
      <div className="text-[18px] font-bold mb-[18px]">Security Settings</div>

      <div className="grid grid-cols-2 gap-3.5">
        {/* Custody Mode */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px]">
          <div className="text-[13px] font-bold mb-3.5">Custody Mode</div>
          <div className="flex gap-2 mb-3.5">
            {custodyModes.map((mode) => {
              const isActive = selectedMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`flex-1 p-3 rounded-cvh text-center cursor-pointer transition-colors border ${
                    isActive
                      ? "bg-[rgba(59,130,246,0.12)] border-cvh-accent"
                      : "bg-cvh-bg-tertiary border-cvh-border hover:border-cvh-text-muted"
                  }`}
                >
                  <div
                    className={`text-[12px] font-bold ${
                      isActive
                        ? "text-cvh-accent"
                        : "text-cvh-text-secondary"
                    }`}
                  >
                    {mode.label}
                  </div>
                  <div className="text-[10px] text-cvh-text-muted mt-0.5">
                    {mode.desc}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-cvh-text-muted p-2.5 bg-cvh-bg-tertiary rounded-[6px]">
            In Full Custody mode, CryptoVaultHub manages both Platform Key and
            Client Key. All operations are automatic. Backup Key is split via
            Shamir (3-of-5) for emergency recovery.
          </div>
        </div>

        {/* Shamir Shares */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px]">
          <div className="text-[13px] font-bold mb-3.5">
            Backup Key (Shamir Shares)
          </div>
          <div className="mb-2">
            {shamirShares.map((share, i) => (
              <div
                key={i}
                className={`flex justify-between items-center py-2 text-[12px] ${
                  i < shamirShares.length - 1
                    ? "border-b border-cvh-border-subtle"
                    : ""
                }`}
              >
                <span>{share.name}</span>
                <Badge variant={share.color}>{share.status}</Badge>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-cvh-text-muted">
            3 of 5 shares needed for recovery. 4/5 distributed.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        {/* 2FA */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px]">
          <div className="text-[13px] font-bold mb-3.5">
            Two-Factor Authentication
          </div>
          <div className="flex justify-between items-center py-2 text-[12px]">
            <span>Status</span>
            <Badge variant="green">Enabled for all members</Badge>
          </div>
          <div className="flex justify-between items-center py-2 text-[12px]">
            <span>Required for withdrawals above</span>
            <span className="font-mono">$5,000</span>
          </div>
        </div>

        {/* Safe Mode */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px]">
          <div className="text-[13px] font-bold mb-3.5 text-cvh-red">
            Emergency: Safe Mode
          </div>
          <div className="text-[11px] text-cvh-text-muted mb-3">
            Activating Safe Mode will restrict ALL withdrawals to signer
            addresses only. This is IRREVOCABLE.
          </div>
          <button className="w-full inline-flex items-center justify-center px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-[rgba(239,68,68,0.1)] text-cvh-red border border-[rgba(239,68,68,0.2)]">
            Activate Safe Mode (requires 2FA)
          </button>
        </div>
      </div>
    </div>
  );
}
