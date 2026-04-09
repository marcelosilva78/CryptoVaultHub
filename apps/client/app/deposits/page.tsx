"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { ConfirmationBar } from "@/components/confirmation-bar";
import { QrCode } from "@/components/qr-code";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { useDeposits } from "@cvh/api-client/hooks";
import { depositKPIs, deposits, walletAddresses } from "@/lib/mock-data";

/** Hexagonal clip-path for chain avatars */
const hexClip = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

export default function DepositsPage() {
  const { data: apiDeposits } = useDeposits();
  void apiDeposits;

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const selectedWallet = selectedAddress
    ? walletAddresses.find((w) => w.address === selectedAddress)
    : null;

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">Deposits</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Generate deposit addresses and track incoming funds
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + Generate Deposit Address
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Deposits (24h)"
          value={depositKPIs.deposits24h.toString()}
          valueColor="text-status-success"
        />
        <StatCard
          label="Volume (24h)"
          value="$123,400"
          valueColor="text-status-success"
        />
        <StatCard
          label="Confirming Now"
          value={depositKPIs.confirmingNow.toString()}
          valueColor="text-status-warning"
        />
      </div>

      {/* Deposit Addresses with QR */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card">
        <div className="text-subheading font-display mb-3">Deposit Addresses</div>
        <div className="grid grid-cols-4 gap-2">
          {walletAddresses.filter((w) => w.deployed).slice(0, 4).map((w) => (
            <button
              key={w.address}
              onClick={() =>
                setSelectedAddress(
                  selectedAddress === w.address ? null : w.address
                )
              }
              className={`p-3 rounded-card border text-left cursor-pointer transition-all duration-fast font-display ${
                selectedAddress === w.address
                  ? "bg-accent-subtle border-accent-primary"
                  : "bg-surface-input border-border-default hover:border-text-muted"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {/* Hexagonal chain avatar */}
                <div
                  className="w-5 h-5 bg-accent-primary flex items-center justify-center text-[8px] font-bold text-accent-text shrink-0"
                  style={{ clipPath: hexClip }}
                >
                  {w.chain.slice(0, 2)}
                </div>
                <div className="text-body font-semibold truncate">{w.label}</div>
              </div>
              <div className="font-mono text-micro text-accent-primary mt-0.5 truncate">
                {w.address}
              </div>
              <div className="text-micro text-text-muted mt-1 font-display">
                {w.chain} - {w.tokens.join(", ")}
              </div>
            </button>
          ))}
        </div>

        {/* Selected address detail with QR */}
        {selectedWallet && (
          <div className="mt-3 p-4 bg-surface-elevated rounded-card flex items-center gap-4 animate-fade-in border border-border-subtle">
            <QrCode value={selectedWallet.addressFull} size={120} />
            <div className="flex-1">
              <div className="text-subheading font-display mb-1">{selectedWallet.label}</div>
              <div className="font-mono text-code text-accent-primary mb-2 break-all">
                {selectedWallet.addressFull}
              </div>
              <div className="grid grid-cols-3 gap-2 text-caption font-display">
                <div>
                  <span className="text-text-muted">Chain:</span>{" "}
                  <span className="text-text-primary">{selectedWallet.chain}</span>
                </div>
                <div>
                  <span className="text-text-muted">Tokens:</span>{" "}
                  <span className="text-text-primary">{selectedWallet.tokens.join(", ")}</span>
                </div>
                <div>
                  <span className="text-text-muted">Deposits:</span>{" "}
                  <span className="text-text-primary">{selectedWallet.depositCount}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedWallet.addressFull);
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Copy Address
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Deposit History */}
      <DataTable
        title="Deposit History"
        actions={
          <>
            <select className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast">
              <option>All Chains</option>
              <option>BSC</option>
              <option>ETH</option>
              <option>Polygon</option>
            </select>
            <select className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast">
              <option>All Status</option>
              <option>Confirming</option>
              <option>Confirmed</option>
            </select>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
              Export CSV
            </button>
          </>
        }
        headers={[
          "Date",
          "Address",
          "External ID",
          "Token",
          "Chain",
          "Amount",
          "Confirmations",
          "Status",
          "TX",
        ]}
      >
        {deposits.map((d, i) => (
          <tr key={i} className="hover:bg-surface-hover transition-colors duration-fast">
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
              {d.date}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-accent-primary cursor-pointer hover:underline">
              {d.address}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle text-caption font-mono">
              {d.externalId}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-semibold font-display">
              {d.token}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle text-caption font-display">
              {d.chain}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-status-success">
              {d.amount}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <ConfirmationBar
                confirmations={d.confirmations}
                required={d.confirmationsRequired}
              />
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <Badge
                variant={d.status === "Confirmed" ? "success" : "warning"}
              >
                {d.status}
              </Badge>
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <span className="font-mono text-micro text-accent-primary cursor-pointer hover:underline">
                {d.txHash.length > 16 ? `${d.txHash.slice(0, 10)}...${d.txHash.slice(-6)}` : d.txHash}
              </span>
            </td>
          </tr>
        ))}
      </DataTable>

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
