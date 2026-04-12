"use client";

import { useState } from "react";
import { Fuel, X, Loader2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { gasTanksStats, gasTanks } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  red: "error",
  orange: "warning",
};

const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

/* Chain name → chainId mapping */
const chainIdMap: Record<string, number> = {
  Ethereum: 1,
  ETH: 1,
  Polygon: 137,
  MATIC: 137,
  BSC: 56,
  BNB: 56,
  Arbitrum: 42161,
  ARB: 42161,
  Optimism: 10,
  OP: 10,
};

/* ─── API helpers ─────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/**
 * Mini Vault Meter Gauge -- small arc showing fill level
 * Inspired by the vault-meter concept from the identity spec.
 * Renders a 180-degree arc gauge with accent-primary fill.
 */
function VaultMeterMini({
  percent,
  status,
}: {
  percent: number;
  status: "low" | "ok";
}) {
  const radius = 18;
  const strokeWidth = 4;
  const cx = 22;
  const cy = 22;
  // Arc from 180 degrees (left) to 0 degrees (right) -- semicircle
  const circumference = Math.PI * radius;
  const filled = (percent / 100) * circumference;
  const trackColor = "var(--surface-elevated)";
  const fillColor =
    status === "low" ? "var(--status-error)" : "var(--accent-primary)";

  return (
    <div className="flex flex-col items-center">
      <svg width="44" height="26" viewBox="0 0 44 26">
        {/* Track (background arc) */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          className="transition-all duration-normal"
        />
      </svg>
      <span
        className={cn(
          "text-micro font-bold font-mono -mt-0.5",
          status === "low" ? "text-status-error" : "text-accent-primary"
        )}
      >
        {percent}%
      </span>
    </div>
  );
}

/* Hexagonal chain avatar */
function ChainHexAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold shrink-0"
      style={{
        width: 24,
        height: 24,
        fontSize: 10,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}

/* ─── Top Up Modal ────────────────────────────────────────────────── */
interface TopUpTank {
  chainId: number;
  chain: string;
  balance: string;
  threshold: string;
}

function TopUpModal({
  open,
  tank,
  onClose,
  onConfirm,
}: {
  open: boolean;
  tank: TopUpTank | null;
  onClose: () => void;
  onConfirm: (amount: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open || !tank) return null;

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm(amount);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setAmount("");
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    setAmount("");
    setError(null);
    setSuccess(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[440px] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Fuel className="w-4 h-4 text-accent-primary" />
            <span className="font-display text-subheading text-text-primary">
              Top Up Gas Tank
            </span>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Chain info */}
          <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-elevated rounded-input">
            <ChainHexAvatar name={tank.chain} />
            <div>
              <div className="text-caption font-semibold text-text-primary font-display">
                {tank.chain}
              </div>
              <div className="text-micro text-text-muted font-mono">
                Chain ID: {tank.chainId}
              </div>
            </div>
          </div>

          {/* Balance vs threshold */}
          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2 bg-surface-elevated rounded-input">
              <div className="text-micro text-text-muted font-display mb-0.5">Current Balance</div>
              <div className="text-caption font-mono font-semibold text-status-error">
                {tank.balance}
              </div>
            </div>
            <div className="px-3 py-2 bg-surface-elevated rounded-input">
              <div className="text-micro text-text-muted font-display mb-0.5">Threshold</div>
              <div className="text-caption font-mono font-semibold text-text-primary">
                {tank.threshold}
              </div>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">
              Amount (optional)
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Leave blank to top up to target"
              disabled={loading || success}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted disabled:opacity-50"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-3 py-2 font-display">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="text-caption text-status-success bg-status-success/10 border border-status-success/30 rounded-input px-3 py-2 font-display">
              Top-up initiated successfully.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-button text-caption font-semibold font-display text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary transition-all duration-fast disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || success}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-button text-caption font-semibold font-display bg-accent-primary text-accent-text hover:bg-accent-hover transition-all duration-fast disabled:opacity-50"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Top Up
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GasTanksPage() {
  const [topUpModal, setTopUpModal] = useState<TopUpTank | null>(null);

  // Derive percent for vault meter from balance data
  const tanksWithPercent = gasTanks.map((tank) => {
    // Parse balance and threshold to compute approximate fill %
    const balNum = parseFloat(tank.balance);
    const thrNum = parseFloat(tank.threshold);
    const maxEstimate = thrNum * 4; // Estimate a reasonable max
    const percent = Math.min(Math.round((balNum / maxEstimate) * 100), 100);
    return {
      ...tank,
      chainId: chainIdMap[tank.chain] ?? 0,
      percent,
      tankStatus: (tank.statusColor === "red" ? "low" : "ok") as "low" | "ok",
    };
  });

  async function handleTopUp(tank: TopUpTank, amount: string) {
    await adminFetch(`/admin/gas-tanks/${tank.chainId}/top-up`, {
      method: "POST",
      body: JSON.stringify({ amount: amount || undefined }),
    });
  }

  return (
    <>
      <TopUpModal
        open={topUpModal !== null}
        tank={topUpModal}
        onClose={() => setTopUpModal(null)}
        onConfirm={(amount) => handleTopUp(topUpModal!, amount)}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        {gasTanksStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color ? statColorMap[stat.color] : undefined}
            mono={stat.mono}
          />
        ))}
      </div>

      {/* Gas Tank Cards -- card grid with vault meter gauges */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        <div className="flex items-center gap-2">
          <Fuel className="w-4 h-4 text-text-muted" />
          Gas Tanks
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-section-gap">
        {tanksWithPercent.map((tank, i) => (
          <div
            key={i}
            className={cn(
              "bg-surface-card border rounded-card p-card-p shadow-card transition-all duration-fast",
              tank.tankStatus === "low"
                ? "border-status-warning"
                : "border-border-default"
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <ChainHexAvatar name={tank.chain} />
                <div>
                  <div className="text-caption font-semibold text-text-primary font-display">
                    {tank.client}
                  </div>
                  <div className="text-micro text-text-muted font-display">
                    {tank.chain}
                  </div>
                </div>
              </div>
              <VaultMeterMini percent={tank.percent} status={tank.tankStatus} />
            </div>

            <div className="font-mono text-caption text-accent-primary cursor-pointer hover:underline mb-2">
              {tank.address}
            </div>

            <div className="grid grid-cols-2 gap-y-1 text-caption mb-3">
              <span className="text-text-muted font-display">Balance</span>
              <span
                className={cn(
                  "font-mono font-semibold text-right",
                  tank.tankStatus === "low"
                    ? "text-status-error"
                    : "text-text-primary"
                )}
              >
                {tank.balance}
              </span>
              <span className="text-text-muted font-display">Threshold</span>
              <span className="font-mono text-right text-text-secondary">
                {tank.threshold}
              </span>
              <span className="text-text-muted font-display">Burn Rate</span>
              <span className="font-mono text-right text-text-secondary">
                {tank.burnRate}
              </span>
              <span className="text-text-muted font-display">Days Left</span>
              <span
                className={cn(
                  "font-mono font-semibold text-right",
                  tank.daysLeftColor === "red"
                    ? "text-status-error"
                    : "text-status-success"
                )}
              >
                {tank.daysLeft}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <Badge variant={badgeMap[tank.statusColor] ?? "neutral"} dot>
                {tank.status}
              </Badge>
              <button
                onClick={() =>
                  setTopUpModal({
                    chainId: tank.chainId,
                    chain: tank.chain,
                    balance: tank.balance,
                    threshold: tank.threshold,
                  })
                }
                className={cn(
                  "text-micro font-semibold px-2.5 py-1 rounded-button transition-all duration-fast font-display",
                  tank.tankStatus === "low"
                    ? "bg-accent-primary text-accent-text hover:bg-accent-hover"
                    : "bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                )}
              >
                Top Up
              </button>
            </div>

            {tank.tankStatus === "low" && (
              <div className="mt-2 px-2 py-1 bg-status-warning-subtle rounded-badge text-micro text-status-warning font-semibold font-display flex items-center gap-1">
                <span>{"\u26A0"}</span> Low balance -- action required
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Gas Tanks Table (detailed view) */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Detailed View
      </div>
      <DataTable
        title="All Gas Tanks"
        headers={[
          "Client",
          "Chain",
          "Address",
          "Balance",
          "Threshold",
          "Burn Rate",
          "Days Left",
          "Status",
          "Action",
        ]}
        actions={
          <>
            <select className="bg-surface-input border border-border-default rounded-input text-text-primary px-2.5 py-1.5 text-caption font-display">
              <option>All Chains</option>
              <option>BSC</option>
              <option>Ethereum</option>
              <option>Polygon</option>
            </select>
            <select className="bg-surface-input border border-border-default rounded-input text-text-primary px-2.5 py-1.5 text-caption font-display">
              <option>All Status</option>
              <option>Low</option>
              <option>OK</option>
            </select>
          </>
        }
      >
        {tanksWithPercent.map((tank, i) => (
          <TableRow key={i} highlight={tank.highlight}>
            <TableCell>
              <span className="font-semibold font-display text-text-primary">
                {tank.client}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <ChainHexAvatar name={tank.chain} />
                <span className="font-display">{tank.chain}</span>
              </div>
            </TableCell>
            <TableCell>
              <span className="font-mono text-accent-primary text-caption cursor-pointer hover:underline">
                {tank.address}
              </span>
            </TableCell>
            <TableCell
              mono
              className={cn(
                tank.balanceColor === "red"
                  ? "text-status-error font-bold"
                  : ""
              )}
            >
              {tank.balance}
            </TableCell>
            <TableCell mono>{tank.threshold}</TableCell>
            <TableCell mono>{tank.burnRate}</TableCell>
            <TableCell
              mono
              className={cn(
                tank.daysLeftColor === "red"
                  ? "text-status-error font-bold"
                  : "text-status-success"
              )}
            >
              {tank.daysLeft}
            </TableCell>
            <TableCell>
              <Badge variant={badgeMap[tank.statusColor] ?? "neutral"}>
                {tank.status}
              </Badge>
            </TableCell>
            <TableCell>
              <button
                onClick={() =>
                  setTopUpModal({
                    chainId: tank.chainId,
                    chain: tank.chain,
                    balance: tank.balance,
                    threshold: tank.threshold,
                  })
                }
                className={cn(
                  "text-micro font-semibold px-2.5 py-1 rounded-button transition-all duration-fast font-display",
                  tank.statusColor === "red"
                    ? "bg-accent-primary text-accent-text hover:bg-accent-hover"
                    : "bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                )}
              >
                Top Up
              </button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </>
  );
}
