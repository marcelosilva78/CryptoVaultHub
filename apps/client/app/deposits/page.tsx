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

export default function DepositsPage() {
  // API hook with mock data fallback
  const { data: apiDeposits } = useDeposits();
  void apiDeposits; // Falls back to deposits mock data below

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const selectedWallet = selectedAddress
    ? walletAddresses.find((w) => w.address === selectedAddress)
    : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div>
          <div className="text-[18px] font-bold">Deposits</div>
          <div className="text-[11px] text-cvh-text-muted mt-0.5">
            Generate deposit addresses and track incoming funds
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
        >
          + Generate Deposit Address
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3.5 mb-[22px]">
        <StatCard
          label="Deposits (24h)"
          value={depositKPIs.deposits24h.toString()}
          valueColor="text-cvh-green"
        />
        <StatCard
          label="Volume (24h)"
          value="$123,400"
          valueColor="text-cvh-green"
        />
        <StatCard
          label="Confirming Now"
          value={depositKPIs.confirmingNow.toString()}
          valueColor="text-cvh-orange"
        />
      </div>

      {/* Deposit Addresses with QR */}
      <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px] mb-3.5">
        <div className="text-[13px] font-semibold mb-3">Deposit Addresses</div>
        <div className="grid grid-cols-4 gap-2">
          {walletAddresses.filter((w) => w.deployed).slice(0, 4).map((w) => (
            <button
              key={w.address}
              onClick={() =>
                setSelectedAddress(
                  selectedAddress === w.address ? null : w.address
                )
              }
              className={`p-3 rounded-cvh border text-left cursor-pointer transition-all font-display ${
                selectedAddress === w.address
                  ? "bg-[rgba(59,130,246,0.12)] border-cvh-accent"
                  : "bg-cvh-bg-tertiary border-cvh-border hover:border-cvh-text-muted"
              }`}
            >
              <div className="text-[12px] font-semibold truncate">{w.label}</div>
              <div className="font-mono text-[10px] text-cvh-accent mt-0.5 truncate">
                {w.address}
              </div>
              <div className="text-[10px] text-cvh-text-muted mt-1">
                {w.chain} - {w.tokens.join(", ")}
              </div>
            </button>
          ))}
        </div>

        {selectedWallet && (
          <div className="mt-3 p-3 bg-cvh-bg-tertiary rounded-[6px] flex items-center gap-4 animate-fade-up">
            <QrCode value={selectedWallet.addressFull} size={120} />
            <div className="flex-1">
              <div className="text-[13px] font-bold mb-1">{selectedWallet.label}</div>
              <div className="font-mono text-[11px] text-cvh-accent mb-2 break-all">
                {selectedWallet.addressFull}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-cvh-text-muted">Chain:</span>{" "}
                  {selectedWallet.chain}
                </div>
                <div>
                  <span className="text-cvh-text-muted">Tokens:</span>{" "}
                  {selectedWallet.tokens.join(", ")}
                </div>
                <div>
                  <span className="text-cvh-text-muted">Deposits:</span>{" "}
                  {selectedWallet.depositCount}
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedWallet.addressFull);
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary"
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
            <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
              <option>All Chains</option>
              <option>BSC</option>
              <option>ETH</option>
              <option>Polygon</option>
            </select>
            <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
              <option>All Status</option>
              <option>Confirming</option>
              <option>Confirmed</option>
            </select>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
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
          <tr key={i} className="hover:bg-cvh-bg-hover">
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px] whitespace-nowrap">
              {d.date}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px] text-cvh-accent cursor-pointer hover:underline">
              {d.address}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[11px] font-mono">
              {d.externalId}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[12.5px] font-semibold">
              {d.token}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[11px]">
              {d.chain}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-cvh-green">
              {d.amount}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <ConfirmationBar
                confirmations={d.confirmations}
                required={d.confirmationsRequired}
              />
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <Badge
                variant={d.status === "Confirmed" ? "green" : "orange"}
              >
                {d.status}
              </Badge>
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <span className="font-mono text-[10px] text-cvh-accent cursor-pointer hover:underline">
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
