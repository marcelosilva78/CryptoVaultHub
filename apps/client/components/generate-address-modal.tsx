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
      <div className="bg-cvh-bg-secondary border border-cvh-border rounded-cvh-lg p-6 w-[480px] max-h-[80vh] overflow-y-auto animate-fade-up">
        <div className="text-base font-bold mb-4">Generate Deposit Address</div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
            Chain
          </label>
          <select className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-display text-[13px] outline-none focus:border-cvh-accent transition-colors">
            <option>BSC (BNB Smart Chain)</option>
            <option>Ethereum</option>
            <option>Polygon</option>
          </select>
        </div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
            External ID (your user identifier)
          </label>
          <input
            type="text"
            placeholder="e.g. user-joao-123"
            className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-mono text-[13px] outline-none focus:border-cvh-accent transition-colors"
          />
        </div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
            Label
          </label>
          <input
            type="text"
            placeholder="e.g. Joao Silva - Deposit"
            className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-display text-[13px] outline-none focus:border-cvh-accent transition-colors"
          />
        </div>

        <div className="p-2.5 bg-cvh-bg-tertiary rounded-[6px] text-[11px] text-cvh-text-muted">
          The address is computed via CREATE2 and will be deployed automatically
          when the first deposit arrives. Supports all enabled tokens for this
          chain.
        </div>

        <div className="flex justify-end gap-2 mt-[18px]">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
          >
            Generate Address
          </button>
        </div>
      </div>
    </div>
  );
}
