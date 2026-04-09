"use client";

import { Badge } from "@/components/badge";
import { useWithdrawals } from "@cvh/api-client/hooks";
import { withdrawals, withdrawalDestinations } from "@/lib/mock-data";

export default function WithdrawalsPage() {
  // API hook with mock data fallback
  const { data: apiWithdrawals } = useWithdrawals();
  void apiWithdrawals; // Falls back to withdrawals mock data below

  return (
    <div className="grid grid-cols-2 gap-3.5">
      {/* New Withdrawal Form */}
      <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px]">
        <div className="text-[15px] font-bold mb-4">New Withdrawal</div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
            Chain
          </label>
          <select className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-display text-[13px] outline-none focus:border-cvh-accent cursor-pointer">
            <option>BSC (BNB Smart Chain)</option>
            <option>Ethereum</option>
            <option>Polygon</option>
          </select>
        </div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
            Token
          </label>
          <select className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-display text-[13px] outline-none focus:border-cvh-accent cursor-pointer">
            <option>USDT — Balance: 500,000.00</option>
            <option>USDC — Balance: 340,000.00</option>
            <option>BNB — Balance: 12.50</option>
          </select>
        </div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
            Destination (whitelisted)
          </label>
          <select className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-display text-[13px] outline-none focus:border-cvh-accent cursor-pointer">
            {withdrawalDestinations.map((d) => (
              <option key={d.address}>
                {d.label} — {d.address}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
            Amount
          </label>
          <input
            type="text"
            defaultValue="500.00"
            placeholder="0.00"
            className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-mono text-[13px] outline-none focus:border-cvh-accent"
          />
        </div>

        <div className="flex justify-between text-[11px] text-cvh-text-muted mb-3.5 px-3 py-2 bg-cvh-bg-tertiary rounded-[6px]">
          <span>Estimated gas fee</span>
          <span className="font-mono">~$0.35</span>
        </div>

        <button className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim">
          Confirm Withdrawal &rarr;
        </button>
        <div className="text-center text-[10px] text-cvh-text-muted mt-1.5">
          Requires 2FA for amounts above $5,000
        </div>
      </div>

      {/* Withdrawal History */}
      <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
        <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-cvh-border-subtle">
          <div className="text-[13px] font-semibold">Withdrawal History</div>
        </div>
        <table className="w-full border-collapse">
          <thead className="bg-cvh-bg-tertiary">
            <tr>
              {["Date", "Destination", "Token", "Amount", "Status"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-[14px] py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-cvh-text-muted border-b border-cvh-border-subtle"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((w, i) => (
              <tr key={i} className="hover:bg-cvh-bg-hover">
                <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px]">
                  {w.date}
                </td>
                <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
                  <span className="text-[11px] font-semibold block">
                    {w.destinationLabel}
                  </span>
                  <span className="font-mono text-[10px] text-cvh-accent cursor-pointer hover:underline">
                    {w.destinationAddr}
                  </span>
                </td>
                <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[12.5px]">
                  {w.token}
                </td>
                <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-cvh-orange">
                  {w.amount}
                </td>
                <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
                  <Badge
                    variant={w.status === "Confirmed" ? "green" : "orange"}
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
  );
}
