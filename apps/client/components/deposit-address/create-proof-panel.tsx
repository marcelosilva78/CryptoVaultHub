"use client";

import { useState } from "react";
import { explorerAddressUrl } from "@/lib/explorer";

interface CreateProofPanelProps {
  address: string;
  chainId: number;
  salt: string;
  deployerAddress: string | null;
  parentAddress: string | null;
  feeAddress: string | null;
  factoryAddress: string | null;
}

/**
 * Verifiable CREATE2 provenance for a deposit address.
 *
 * Shows the four inputs that the ForwarderFactory hashed into the final salt
 * before computing the deterministic address:
 *
 *   final_salt = keccak256(deployer ‖ parent ‖ feeAddress ‖ salt)
 *   address    = CREATE2(factory, final_salt, init_code_hash)
 *
 * Anyone with these five fields (deployer, parent, fee, salt, factory) can
 * re-derive the address locally and confirm the custody invariant — i.e. that
 * funds will only ever forward to `parent` and that only `deployer` can deploy
 * the proxy. This is the cryptographic substitute for "show me the private
 * key" — a forwarder is a contract, not an EOA, so there is no private key
 * but the relationship is mathematically provable.
 */
export function CreateProofPanel({
  address,
  chainId,
  salt,
  deployerAddress,
  parentAddress,
  feeAddress,
  factoryAddress,
}: CreateProofPanelProps) {
  return (
    <div className="rounded-input border border-border-subtle bg-surface-input p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
          CREATE2 derivation proof
        </div>
        <span className="text-[9px] text-text-muted font-mono">
          keccak256(deployer ‖ parent ‖ fee ‖ salt)
        </span>
      </div>

      <div className="space-y-1.5">
        <ProofRow
          label="Forwarder"
          value={address}
          chainId={chainId}
          highlight
        />
        <ProofRow
          label="Factory"
          value={factoryAddress}
          chainId={chainId}
          hint="The CREATE2 deployer contract"
        />
        <ProofRow
          label="Deployer"
          value={deployerAddress}
          chainId={chainId}
          hint="Gas tank — signs createForwarder; msg.sender is hashed into the final salt"
        />
        <ProofRow
          label="Parent"
          value={parentAddress}
          chainId={chainId}
          hint="Hot wallet — funds forward here, always"
        />
        <ProofRow
          label="Fee address"
          value={feeAddress}
          chainId={chainId}
          hint="= Parent in full-custody mode"
        />
        <ProofRow label="Salt" value={salt} chainId={chainId} mono />
      </div>
    </div>
  );
}

interface ProofRowProps {
  label: string;
  value: string | null;
  chainId: number;
  hint?: string;
  highlight?: boolean;
  /** Render value as raw hex without an explorer link (for salt). */
  mono?: boolean;
}

function ProofRow({
  label,
  value,
  chainId,
  hint,
  highlight,
  mono,
}: ProofRowProps) {
  const [copied, setCopied] = useState(false);
  const explorer = !mono && value ? explorerAddressUrl(chainId, value) : null;

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-2">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
          {label}
        </div>
        {hint && (
          <div className="text-[9px] text-text-muted/70 font-display leading-tight mt-0.5">
            {hint}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        {value ? (
          <>
            <code
              className={`font-mono text-code break-all min-w-0 ${
                highlight ? "text-accent-primary" : "text-text-secondary"
              }`}
            >
              {value}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
              title={`Copy ${label}`}
              type="button"
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
                title="Open in explorer"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </>
        ) : (
          <span className="text-caption text-text-muted font-display">—</span>
        )}
      </div>
    </div>
  );
}
