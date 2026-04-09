"use client";

interface GenerateAddressModalProps {
  open: boolean;
  onClose: () => void;
}

export function GenerateAddressModal({ open, onClose }: GenerateAddressModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[480px] max-h-[80vh] overflow-y-auto animate-fade-up shadow-float">
        <div className="text-subheading font-bold mb-4 font-display">
          Generate Deposit Address
        </div>

        <div className="mb-3.5">
          <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
            Chain
          </label>
          <select className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast">
            <option>BSC (BNB Smart Chain)</option>
            <option>Ethereum</option>
            <option>Polygon</option>
          </select>
        </div>

        <div className="mb-3.5">
          <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
            External ID (your user identifier)
          </label>
          <input
            type="text"
            placeholder="e.g. user-joao-123"
            className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
          />
        </div>

        <div className="mb-3.5">
          <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
            Label
          </label>
          <input
            type="text"
            placeholder="e.g. Joao Silva - Deposit"
            className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
          />
        </div>

        <div className="p-2.5 bg-surface-elevated rounded-input text-caption text-text-muted font-display">
          The address is computed via CREATE2 and will be deployed automatically
          when the first deposit arrives. Supports all enabled tokens for this
          chain.
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
          >
            Generate Address
          </button>
        </div>
      </div>
    </div>
  );
}
