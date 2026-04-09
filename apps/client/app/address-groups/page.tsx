"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { AddressGroupCard } from "@/components/address-group-card";
import { useAddressGroups } from "@cvh/api-client/hooks";

// Mock data for initial UI
const mockGroups = [
  {
    id: 1,
    groupUid: "ag_a1b2c3d4e5f6g7h8",
    computedAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
    label: "VIP Customer - Joao Silva",
    externalId: "user-joao-001",
    status: "active",
    createdAt: "Apr 9, 14:30",
    chains: [
      { chainId: 1, chainName: "Ethereum", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68", isDeployed: true, provisioned: true },
      { chainId: 56, chainName: "BSC", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68", isDeployed: true, provisioned: true },
      { chainId: 137, chainName: "Polygon", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68", isDeployed: false, provisioned: true },
    ],
  },
  {
    id: 2,
    groupUid: "ag_h8g7f6e5d4c3b2a1",
    computedAddress: "0x8f3a21Bb7c6d5e4f3a2c1a0b9c8d7e6f5a4b3c2d",
    label: "Merchant - CryptoShop",
    externalId: "merchant-cryptoshop-001",
    status: "active",
    createdAt: "Apr 8, 10:15",
    chains: [
      { chainId: 56, chainName: "BSC", address: "0x8f3a21Bb7c6d5e4f3a2c1a0b9c8d7e6f5a4b3c2d", isDeployed: true, provisioned: true },
      { chainId: 42161, chainName: "Arbitrum", address: "0x8f3a21Bb7c6d5e4f3a2c1a0b9c8d7e6f5a4b3c2d", isDeployed: false, provisioned: true },
    ],
  },
  {
    id: 3,
    groupUid: "ag_x1y2z3w4v5u6t7s8",
    computedAddress: "0x9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
    label: "Settlement Account - Partner A",
    externalId: null,
    status: "active",
    createdAt: "Apr 7, 08:00",
    chains: [
      { chainId: 1, chainName: "Ethereum", address: "0x9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b", isDeployed: true, provisioned: true },
    ],
  },
  {
    id: 4,
    groupUid: "ag_disabled001",
    computedAddress: "0xdead00000000000000000000000000000000beef",
    label: "Deactivated Group",
    externalId: "old-user-999",
    status: "disabled",
    createdAt: "Mar 15, 12:00",
    chains: [
      { chainId: 56, chainName: "BSC", address: "0xdead00000000000000000000000000000000beef", isDeployed: false, provisioned: true },
    ],
  },
];

export default function AddressGroupsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  // API hook with mock data fallback
  const { data: apiGroups } = useAddressGroups();
  void apiGroups;

  const activeGroups = mockGroups.filter((g) => g.status === "active").length;
  const totalChains = mockGroups.reduce(
    (sum, g) => sum + g.chains.filter((c) => c.provisioned).length,
    0,
  );
  const deployedCount = mockGroups.reduce(
    (sum, g) => sum + g.chains.filter((c) => c.isDeployed).length,
    0,
  );

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">
          Address Groups
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Multi-chain deposit addresses sharing a single computed address
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Active Groups"
          value={activeGroups.toString()}
          sub="Cross-chain identities"
          valueColor="text-accent-primary"
        />
        <StatCard
          label="Total Provisions"
          value={totalChains.toString()}
          sub="Across all chains"
        />
        <StatCard
          label="Deployed On-Chain"
          value={deployedCount.toString()}
          sub="Forwarders live"
          valueColor="text-status-success"
        />
        <StatCard
          label="Supported Chains"
          value="7"
          sub="ETH, BSC, MATIC, ARB..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-subheading font-display">All Groups</div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + New Group
        </button>
      </div>

      {/* Group Cards Grid */}
      <div className="grid grid-cols-2 gap-4">
        {mockGroups.map((group) => (
          <AddressGroupCard
            key={group.id}
            groupUid={group.groupUid}
            computedAddress={group.computedAddress}
            label={group.label}
            externalId={group.externalId}
            status={group.status}
            chains={group.chains}
            createdAt={group.createdAt}
            onProvision={() => {
              // Will connect to provision modal
            }}
          />
        ))}
      </div>

      {/* Create Modal (simplified inline) */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[480px] animate-fade-up shadow-float">
            <div className="text-subheading font-bold mb-4 font-display">
              Create Address Group
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Label
              </label>
              <input
                type="text"
                placeholder="e.g. VIP Customer - Jane Doe"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                External ID (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. user-12345"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.06em] font-display">
                Initial Chains
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 1, name: "ETH" },
                  { id: 56, name: "BSC" },
                  { id: 137, name: "MATIC" },
                  { id: 42161, name: "ARB" },
                  { id: 10, name: "OP" },
                  { id: 43114, name: "AVAX" },
                  { id: 8453, name: "BASE" },
                ].map((chain) => (
                  <label
                    key={chain.id}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-input border border-border-default bg-surface-input cursor-pointer hover:border-border-focus transition-colors duration-fast"
                  >
                    <input
                      type="checkbox"
                      defaultChecked={[56, 1].includes(chain.id)}
                      className="w-3 h-3 accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <span className="text-micro font-semibold font-display">
                      {chain.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-2.5 bg-surface-elevated rounded-input text-caption text-text-muted font-display mb-4">
              A deterministic address will be computed via CREATE2. The same
              address will be used across all selected chains, enabling
              cross-chain deposits to a single identity.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
