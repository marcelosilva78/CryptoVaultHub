"use client";

import { useState } from "react";

interface Props {
  rawKey: string;
  onClose: () => void;
}

export function OneTimeKeyModal({ rawKey, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otk-title"
    >
      <div className="bg-surface-card border-2 border-status-warning rounded-card p-6 max-w-2xl w-full mx-4 shadow-glow">
        <h2 id="otk-title" className="text-heading font-display text-status-warning mb-1">
          Save your new API key
        </h2>
        <p className="text-caption text-text-muted font-display mb-4">
          This is the only time the full key will be displayed.
        </p>

        <div className="bg-surface-page border border-border-subtle rounded-input p-3 mb-3">
          <code className="font-mono text-code text-accent-primary break-all select-all">
            {rawKey}
          </code>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={copy}
            className={`inline-flex items-center px-3 py-1.5 rounded-button font-display text-caption font-semibold transition-colors duration-fast ${
              copied
                ? "bg-status-success-subtle text-status-success border border-status-success"
                : "bg-accent-primary text-accent-text hover:bg-accent-hover"
            }`}
          >
            {copied ? "Copied!" : "Copy key"}
          </button>
        </div>

        <label className="flex items-center gap-2 text-caption font-display mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <span>I have stored this key in a secure location</span>
        </label>

        <button
          type="button"
          disabled={!confirmed}
          onClick={onClose}
          className="w-full px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done — close
        </button>
      </div>
    </div>
  );
}
