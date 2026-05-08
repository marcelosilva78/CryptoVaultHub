"use client";

interface Props {
  prefix: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

export function RevokeConfirmModal({ prefix, onCancel, onConfirm, busy }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-surface-card border border-status-error rounded-card p-6 max-w-md w-full mx-4">
        <h3 className="text-subheading font-display text-text-primary mb-2">
          Revoke {prefix}…?
        </h3>
        <p className="text-caption text-text-muted font-display mb-4">
          This cannot be undone. Any integrations using this key will start
          failing immediately.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-status-error text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Revoking…" : "Revoke key"}
          </button>
        </div>
      </div>
    </div>
  );
}
