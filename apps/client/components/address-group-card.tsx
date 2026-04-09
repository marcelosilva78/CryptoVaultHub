"use client";

import { Badge } from "@/components/badge";
import { shortenAddress } from "@/lib/utils";

interface ChainStatus {
  chainId: number;
  chainName: string;
  address: string;
  isDeployed: boolean;
  provisioned: boolean;
}

interface AddressGroupCardProps {
  groupUid: string;
  computedAddress: string;
  label: string | null;
  externalId: string | null;
  status: string;
  chains: ChainStatus[];
  createdAt: string;
  onProvision?: () => void;
}

const chainMeta: Record<number, { name: string; color: string }> = {
  1: { name: "ETH", color: "bg-[#627eea]" },
  56: { name: "BSC", color: "bg-[#f3ba2f]" },
  137: { name: "MATIC", color: "bg-[#8247e5]" },
  42161: { name: "ARB", color: "bg-[#28a0f0]" },
  10: { name: "OP", color: "bg-[#ff0420]" },
  43114: { name: "AVAX", color: "bg-[#e84142]" },
  8453: { name: "BASE", color: "bg-[#0052ff]" },
};

export function AddressGroupCard({
  groupUid,
  computedAddress,
  label,
  externalId,
  status,
  chains,
  createdAt,
  onProvision,
}: AddressGroupCardProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card transition-all duration-fast hover:border-border-focus group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          {label && (
            <div className="text-body font-semibold text-text-primary font-display">
              {label}
            </div>
          )}
          {externalId && (
            <div className="text-micro text-text-muted font-display mt-0.5">
              External: {externalId}
            </div>
          )}
        </div>
        <Badge variant={status === "active" ? "success" : "neutral"} dot>
          {status}
        </Badge>
      </div>

      {/* Shared Address - prominent display */}
      <div className="bg-surface-elevated rounded-input p-3 mb-3">
        <div className="text-micro text-text-muted font-display uppercase tracking-wider mb-1">
          Shared Address
        </div>
        <div className="font-mono text-[13px] text-accent-primary break-all leading-relaxed">
          {computedAddress}
        </div>
      </div>

      {/* Chain Grid */}
      <div className="mb-3">
        <div className="text-micro text-text-muted font-display uppercase tracking-wider mb-2">
          Chain Status
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {Object.entries(chainMeta).map(([id, meta]) => {
            const chainStatus = chains.find(
              (c) => c.chainId === parseInt(id),
            );
            const isProvisioned = chainStatus?.provisioned ?? false;
            const isDeployed = chainStatus?.isDeployed ?? false;

            return (
              <div
                key={id}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-input border text-center transition-all duration-fast ${
                  isProvisioned
                    ? isDeployed
                      ? "border-status-success bg-status-success-subtle"
                      : "border-accent-primary bg-accent-subtle"
                    : "border-border-default bg-surface-input opacity-40"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-pill flex-shrink-0 ${
                    isProvisioned ? meta.color : "bg-text-muted"
                  }`}
                />
                <span className="text-micro font-semibold font-display">
                  {meta.name}
                </span>
                {isDeployed && (
                  <span className="text-[8px] text-status-success ml-auto">
                    live
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
        <div className="text-micro text-text-muted font-display">
          {createdAt}
        </div>
        {onProvision && (
          <button
            onClick={onProvision}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-button font-display text-micro font-semibold cursor-pointer transition-all duration-fast bg-transparent text-accent-primary border border-accent-primary hover:bg-accent-subtle"
          >
            + Provision Chain
          </button>
        )}
      </div>
    </div>
  );
}
