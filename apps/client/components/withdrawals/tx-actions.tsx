"use client";

import { useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { explorerTxUrl } from "@/lib/explorer";
import { copyToClipboard } from "@/lib/clipboard";

interface Props {
  txHash: string | null | undefined;
  chainId: number;
  /** Optional override (e.g. comes from `chains.explorer_url` API field). */
  explorerBaseUrl?: string;
}

export function TxActions({ txHash, chainId, explorerBaseUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const disabled = !txHash;
  const url = txHash ? explorerTxUrl(chainId, txHash, explorerBaseUrl) : null;

  async function handleCopy() {
    if (!txHash) return;
    const ok = await copyToClipboard(txHash);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function handleOpen() {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <button
        type="button"
        aria-label="Copy tx hash"
        title={copied ? "Copied!" : "Copy tx hash"}
        disabled={disabled}
        onClick={handleCopy}
        className="w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        aria-label="Open in explorer"
        title={url ?? "No tx hash yet"}
        disabled={disabled || !url}
        onClick={handleOpen}
        className="w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
