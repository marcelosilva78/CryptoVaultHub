"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { FlushModal } from "@/components/flush-modal";
import { useFlushOperations } from "@cvh/api-client/hooks";

// Mock data for initial UI
const mockOperations = [
  {
    id: 1,
    operationUid: "flush_a1b2c3d4e5f6",
    chainId: 56,
    chainName: "BSC",
    operationType: "flush_tokens",
    tokenSymbol: "USDT",
    status: "succeeded",
    totalAddresses: 25,
    succeededCount: 25,
    failedCount: 0,
    totalAmount: "125,000.00",
    gasCostTotal: "0.0125",
    createdAt: "Apr 9, 14:30",
    completedAt: "Apr 9, 14:32",
  },
  {
    id: 2,
    operationUid: "flush_f6e5d4c3b2a1",
    chainId: 1,
    chainName: "Ethereum",
    operationType: "sweep_native",
    tokenSymbol: "ETH",
    status: "processing",
    totalAddresses: 10,
    succeededCount: 6,
    failedCount: 0,
    totalAmount: "3.45",
    gasCostTotal: "0.0089",
    createdAt: "Apr 9, 15:00",
    completedAt: null,
  },
  {
    id: 3,
    operationUid: "flush_1a2b3c4d5e6f",
    chainId: 137,
    chainName: "Polygon",
    operationType: "flush_tokens",
    tokenSymbol: "USDC",
    status: "partially_succeeded",
    totalAddresses: 15,
    succeededCount: 12,
    failedCount: 3,
    totalAmount: "45,200.00",
    gasCostTotal: "0.005",
    createdAt: "Apr 8, 22:15",
    completedAt: "Apr 8, 22:18",
  },
  {
    id: 4,
    operationUid: "flush_6f5e4d3c2b1a",
    chainId: 56,
    chainName: "BSC",
    operationType: "flush_tokens",
    tokenSymbol: "USDT",
    status: "failed",
    totalAddresses: 5,
    succeededCount: 0,
    failedCount: 5,
    totalAmount: "0.00",
    gasCostTotal: "0.003",
    createdAt: "Apr 8, 18:00",
    completedAt: "Apr 8, 18:01",
  },
  {
    id: 5,
    operationUid: "flush_abcdef123456",
    chainId: 1,
    chainName: "Ethereum",
    operationType: "flush_tokens",
    tokenSymbol: "USDT",
    status: "pending",
    totalAddresses: 30,
    succeededCount: 0,
    failedCount: 0,
    totalAmount: "0.00",
    gasCostTotal: "0.00",
    createdAt: "Apr 9, 15:10",
    completedAt: null,
  },
  {
    id: 6,
    operationUid: "flush_cancel001",
    chainId: 56,
    chainName: "BSC",
    operationType: "sweep_native",
    tokenSymbol: "BNB",
    status: "canceled",
    totalAddresses: 8,
    succeededCount: 0,
    failedCount: 0,
    totalAmount: "0.00",
    gasCostTotal: "0.00",
    createdAt: "Apr 7, 10:00",
    completedAt: "Apr 7, 10:01",
  },
];


export default function FlushPage() {
  const [showModal, setShowModal] = useState(false);

  // API hook with mock data fallback
  const { data: apiOperations } = useFlushOperations();
  void apiOperations;

  const succeededToday = mockOperations.filter(
    (o) => o.status === "succeeded" && o.createdAt.startsWith("Apr 9"),
  ).length;
  const processingCount = mockOperations.filter(
    (o) => o.status === "processing" || o.status === "pending",
  ).length;
  const failedCount = mockOperations.filter(
    (o) => o.status === "failed" || o.status === "partially_succeeded",
  ).length;

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">
          Flush Operations
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Sweep tokens and native assets from deposit addresses to your hot
          wallet
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Succeeded Today"
          value={succeededToday.toString()}
          sub="Operations completed"
          valueColor="text-status-success"
        />
        <StatCard
          label="In Progress"
          value={processingCount.toString()}
          sub="Processing or queued"
          valueColor="text-status-warning"
        />
        <StatCard
          label="Failed / Partial"
          value={failedCount.toString()}
          sub="Require attention"
          valueColor="text-status-error"
        />
        <StatCard
          label="Total Flushed"
          value="$170.2K"
          sub="Last 24 hours"
        />
      </div>

      {/* Operations Table */}
      <DataTable
        title="Flush Operations"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
          >
            New Flush
          </button>
        }
        headers={[
          "Date",
          "Type",
          "Chain",
          "Token",
          "Addresses",
          "Amount",
          "Gas Cost",
          "Status",
        ]}
      >
        {mockOperations.map((op) => (
          <tr
            key={op.id}
            className="hover:bg-surface-hover transition-colors duration-fast cursor-pointer"
          >
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
              {op.createdAt}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display">
              {op.operationType === "flush_tokens"
                ? "Token Flush"
                : "Native Sweep"}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display">
              {op.chainName}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display font-semibold">
              {op.tokenSymbol}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
              <span className="text-status-success">
                {op.succeededCount}
              </span>
              {op.failedCount > 0 && (
                <span className="text-status-error">
                  /{op.failedCount}
                </span>
              )}
              <span className="text-text-muted">
                {" "}
                of {op.totalAddresses}
              </span>
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
              {op.totalAmount}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-text-muted">
              {op.gasCostTotal}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <StatusBadge status={op.status} />
            </td>
          </tr>
        ))}
      </DataTable>

      {/* Flush Modal */}
      <FlushModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
