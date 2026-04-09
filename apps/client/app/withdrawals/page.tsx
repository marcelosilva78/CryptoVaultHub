"use client";

import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { useWithdrawals } from "@cvh/api-client/hooks";
import { withdrawals, withdrawalDestinations, addressBook } from "@/lib/mock-data";

export default function WithdrawalsPage() {
  const { data: apiWithdrawals } = useWithdrawals();
  void apiWithdrawals;

  const totalWithdrawals24h = withdrawals
    .filter((w) => w.date.startsWith("Apr 8") || w.date.startsWith("Apr 9"))
    .reduce((sum, w) => sum + Math.abs(parseFloat(w.amount.replace(/,/g, ""))), 0);

  // Daily limit usage for progress bar
  const dailyLimitUsed = 45800;
  const dailyLimitMax = 500000;
  const dailyLimitPercent = (dailyLimitUsed / dailyLimitMax) * 100;

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">Withdrawals</h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Manage outgoing transactions and address whitelist
        </p>
      </div>

      {/* KPIs with daily limit progress bar */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Pending"
          value="1"
          sub="Awaiting confirmation"
          valueColor="text-status-warning"
        />
        <StatCard
          label="Confirmed Today"
          value={`$${totalWithdrawals24h.toLocaleString()}`}
          valueColor="text-text-primary"
        />
        <StatCard
          label="Whitelisted Addresses"
          value={addressBook.length.toString()}
          sub="In address book"
        />
        {/* Daily Limit with progress bar */}
        <div className="bg-surface-card border border-border-default rounded-card p-card-p relative overflow-hidden transition-colors duration-fast hover:border-border-focus shadow-card">
          <div className="text-micro font-semibold uppercase tracking-[0.07em] text-text-muted mb-2 font-display">
            Daily Limit Used
          </div>
          <div className="text-stat tracking-[-0.03em] leading-none font-display text-text-primary">
            $500K
          </div>
          <div className="mt-2.5">
            <div className="flex justify-between text-micro text-text-muted mb-1 font-display">
              <span>$45.8K used</span>
              <span>{dailyLimitPercent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-surface-elevated rounded-pill overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-pill transition-all duration-normal"
                style={{ width: `${dailyLimitPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-section-gap">
        {/* New Withdrawal Form */}
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
          <div className="text-subheading font-display mb-4">New Withdrawal</div>

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Chain
            </label>
            <select className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast">
              <option>BSC (BNB Smart Chain)</option>
              <option>Ethereum</option>
              <option>Polygon</option>
            </select>
          </div>

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Token
            </label>
            <select className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast">
              <option>USDT -- Balance: 500,000.00</option>
              <option>USDC -- Balance: 340,000.00</option>
              <option>BNB -- Balance: 12.50</option>
            </select>
          </div>

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Destination (whitelisted)
            </label>
            <select className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast">
              {withdrawalDestinations.map((d) => (
                <option key={d.address}>
                  {d.label} -- {d.address}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Amount
            </label>
            <input
              type="text"
              defaultValue="500.00"
              placeholder="0.00"
              className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
            />
          </div>

          <div className="flex justify-between text-caption text-text-muted mb-3.5 px-3 py-2 bg-surface-elevated rounded-input font-display">
            <span>Estimated gas fee</span>
            <span className="font-mono">~$0.35</span>
          </div>

          <button className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover">
            Confirm Withdrawal &rarr;
          </button>
          <div className="text-center text-micro text-text-muted mt-1.5 font-display">
            Requires 2FA for amounts above $5,000
          </div>
        </div>

        {/* Withdrawal History */}
        <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
          <div className="flex items-center justify-between px-card-p py-[14px] border-b border-border-subtle">
            <div className="text-subheading font-display">Withdrawal History</div>
            <button className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
              Export
            </button>
          </div>
          <table className="w-full border-collapse">
            <thead className="bg-surface-elevated">
              <tr>
                {["Date", "Destination", "Token", "Chain", "Amount", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-[14px] py-2 text-micro uppercase tracking-[0.09em] text-text-muted border-b border-border-subtle font-display"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w, i) => (
                <tr key={i} className="hover:bg-surface-hover transition-colors duration-fast">
                  <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
                    {w.date}
                  </td>
                  <td className="px-[14px] py-2.5 border-b border-border-subtle">
                    <span className="text-caption font-semibold block font-display">
                      {w.destinationLabel}
                    </span>
                    <span className="font-mono text-micro text-accent-primary cursor-pointer hover:underline">
                      {w.destinationAddr}
                    </span>
                  </td>
                  <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display">
                    {w.token}
                  </td>
                  <td className="px-[14px] py-2.5 border-b border-border-subtle text-caption font-display">
                    {w.chain}
                  </td>
                  <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-status-warning">
                    {w.amount}
                  </td>
                  <td className="px-[14px] py-2.5 border-b border-border-subtle">
                    <Badge
                      variant={
                        w.status === "Confirmed"
                          ? "success"
                          : w.status === "Pending"
                          ? "accent"
                          : "warning"
                      }
                    >
                      {w.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Address Whitelist */}
      <div className="mt-section-gap">
        <DataTable
          title="Address Whitelist"
          actions={
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
              + Add Address
            </button>
          }
          headers={["Label", "Address", "Chain", "Status", "Withdrawals"]}
        >
          {addressBook.map((addr) => {
            const isCooldown = addr.status !== "Active";
            return (
              <tr key={addr.address} className="hover:bg-surface-hover transition-colors duration-fast">
                <td className="px-[14px] py-2.5 text-body border-b border-border-subtle font-semibold font-display">
                  {addr.label}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-accent-primary">
                  {addr.address}
                </td>
                <td className="px-[14px] py-2.5 text-body border-b border-border-subtle font-display">
                  {addr.chain}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  {isCooldown ? (
                    <Badge variant="warning">{addr.status}</Badge>
                  ) : (
                    <Badge variant="success" dot>
                      Active
                    </Badge>
                  )}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                  {addr.withdrawals}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>
    </div>
  );
}
