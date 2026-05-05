"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { clientFetch } from "@/lib/api";

/* ─── Chain ID → Name map ───────────────────────────────────── */
const chainNames: Record<number, string> = {
  1: "Ethereum",
  56: "BSC",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
  43114: "Avalanche",
  8453: "Base",
};

/* ─── API response types ────────────────────────────────────── */
interface ApiWithdrawal {
  id: string;
  chainId: number;
  chainName?: string;
  tokenSymbol: string;
  toAddress: string;
  amount: string;
  amountUsd: string;
  status: string;
  txHash?: string | null;
  memo?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
}

interface ApiAddressBookEntry {
  id: string;
  address: string;
  chainId: number;
  chainName?: string;
  label: string;
  notes?: string | null;
  status: string; // "cooldown" | "active"
  cooldownExpiresAt?: string | null;
  totalWithdrawals: number;
  createdAt: string;
}

interface ApiBalance {
  tokenSymbol: string;
  tokenAddress: string;
  balance: string;
  balanceUsd: string;
  decimals: number;
}

interface ApiWallet {
  id: number;
  address: string;
  chainId: number;
  chainName: string;
  walletType: string;
  isActive: boolean;
  createdAt: string;
}

interface DisplayWithdrawal {
  date: string;
  destinationLabel: string;
  destinationAddr: string;
  token: string;
  amount: string;
  status: "Confirmed" | "Confirming" | "Pending";
  chain: string;
  txHash: string;
}

interface DisplayAddressBook {
  label: string;
  address: string;
  chain: string;
  added: string;
  status: string;
  withdrawals: number;
}

interface TokenBalance {
  symbol: string;
  balance: string;
  chain: string;
  chainId: number;
}

export default function WithdrawalsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<DisplayWithdrawal[]>([]);
  const [addressBook, setAddressBook] = useState<DisplayAddressBook[]>([]);
  const [destinations, setDestinations] = useState<{ label: string; address: string; chainId: number }[]>([]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [availableChains, setAvailableChains] = useState<{ chainId: number; name: string }[]>([]);

  // Withdrawal form state
  const [formChain, setFormChain] = useState<number>(56);
  const [formToken, setFormToken] = useState("");
  const [formDestination, setFormDestination] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // KPI state
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmedTodayUsd, setConfirmedTodayUsd] = useState(0);
  const [dailyLimitUsed, setDailyLimitUsed] = useState(0);
  const [dailyLimitMax] = useState(500000);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch withdrawals, address book, and wallets in parallel
        const [withdrawalsRes, addressesRes, walletsRes] = await Promise.all([
          clientFetch<{ success: boolean; withdrawals: ApiWithdrawal[]; meta: { total: number } }>('/v1/withdrawals?limit=100')
            .catch(() => ({ success: false, withdrawals: [] as ApiWithdrawal[], meta: { total: 0 } })),
          clientFetch<{ success: boolean; addresses: ApiAddressBookEntry[]; meta: { total: number } }>('/v1/addresses?limit=100')
            .catch(() => ({ success: false, addresses: [] as ApiAddressBookEntry[], meta: { total: 0 } })),
          clientFetch<{ success: boolean; wallets: ApiWallet[] }>('/v1/wallets')
            .catch(() => ({ success: false, wallets: [] as ApiWallet[] })),
        ]);

        if (cancelled) return;

        const addressEntries = addressesRes?.addresses ?? [];

        // Fetch balances for each hot wallet chain
        const hotWallets = (walletsRes?.wallets ?? []).filter(w => w.walletType === 'hot');
        const uniqueChainIds = [...new Set(hotWallets.map(w => w.chainId))];
        const chains = uniqueChainIds.map(id => ({
          chainId: id,
          name: chainNames[id] || `Chain ${id}`,
        }));
        setAvailableChains(chains);

        const balanceResults = await Promise.all(
          uniqueChainIds.map(chainId =>
            clientFetch<{ success: boolean; balances: ApiBalance[] }>(`/v1/wallets/${chainId}/balances`)
              .catch(() => ({ success: false, balances: [] as ApiBalance[] }))
          )
        );

        if (cancelled) return;

        // Build token balances
        const allBalances: TokenBalance[] = [];
        balanceResults.forEach((res, idx) => {
          const chain = chainNames[uniqueChainIds[idx]] || `Chain ${uniqueChainIds[idx]}`;
          res.balances.forEach(b => {
            allBalances.push({
              symbol: b.tokenSymbol,
              balance: b.balance,
              chain,
              chainId: uniqueChainIds[idx],
            });
          });
        });
        setTokenBalances(allBalances);

        // Set default form values
        if (chains.length > 0) setFormChain(chains[0].chainId);
        if (allBalances.length > 0) setFormToken(allBalances[0].symbol);

        // Transform withdrawals
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        let pending = 0;
        let confirmedToday = 0;
        let limitUsed = 0;

        const displayWithdrawals: DisplayWithdrawal[] = (withdrawalsRes?.withdrawals ?? []).map(w => {
          const chain = w.chainName || chainNames[w.chainId] || `Chain ${w.chainId}`;

          // Find label from address book
          const addrEntry = addressEntries.find(a => a.address.toLowerCase() === w.toAddress.toLowerCase());
          const destLabel = addrEntry?.label || "Unknown";
          const shortAddr = w.toAddress.length > 14
            ? `${w.toAddress.slice(0, 6)}...${w.toAddress.slice(-4)}`
            : w.toAddress;

          // KPI calculations
          const isPending = ['pending_approval', 'pending_kyt', 'pending_signing', 'pending_broadcast', 'broadcasted', 'confirming'].includes(w.status);
          if (isPending) pending++;

          const isConfirmedToday = w.status === 'confirmed' && w.confirmedAt?.startsWith(todayStr);
          if (isConfirmedToday) {
            confirmedToday++;
            const usd = parseFloat(w.amountUsd || '0');
            limitUsed += usd;
          }

          // Map status
          let displayStatus: "Confirmed" | "Confirming" | "Pending" = "Pending";
          if (w.status === 'confirmed') displayStatus = "Confirmed";
          else if (w.status === 'confirming' || w.status === 'broadcasted') displayStatus = "Confirming";

          const dateStr = new Date(w.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          return {
            date: dateStr,
            destinationLabel: destLabel,
            destinationAddr: shortAddr,
            token: w.tokenSymbol,
            amount: `-${w.amount}`,
            status: displayStatus,
            chain,
            txHash: w.txHash || "",
          };
        });

        setWithdrawals(displayWithdrawals);
        setPendingCount(pending);
        setConfirmedTodayUsd(confirmedToday > 0 ? limitUsed : 0);
        setDailyLimitUsed(limitUsed);

        // Transform address book
        const displayAddresses: DisplayAddressBook[] = addressEntries.map(a => {
          const chain = a.chainName || chainNames[a.chainId] || `Chain ${a.chainId}`;
          let statusDisplay = "Active";
          if (a.status === 'cooldown' && a.cooldownExpiresAt) {
            const expiresAt = new Date(a.cooldownExpiresAt);
            const diff = expiresAt.getTime() - now.getTime();
            if (diff > 0) {
              const hours = Math.floor(diff / (1000 * 60 * 60));
              const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              statusDisplay = `Cooldown ${hours}h${mins}m`;
            } else {
              statusDisplay = "Active";
            }
          }

          return {
            label: a.label,
            address: a.address.length > 14 ? `${a.address.slice(0, 6)}...${a.address.slice(-4)}` : a.address,
            chain,
            added: new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            status: statusDisplay,
            withdrawals: a.totalWithdrawals,
          };
        });

        setAddressBook(displayAddresses);

        // Build destinations for the form dropdown
        const dests = addressEntries
          .filter(a => a.status === 'active')
          .map(a => ({
            label: a.label,
            address: a.address,
            chainId: a.chainId,
          }));
        setDestinations(dests);
        if (dests.length > 0) setFormDestination(dests[0].address);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load withdrawals');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Filter token balances by selected chain (computed early for validation)
  const chainTokens = tokenBalances.filter(b => b.chainId === formChain);
  // Filter destinations by selected chain
  const chainDestinations = destinations.filter(d => d.chainId === formChain);

  // Validate the amount and return an error string (or null if valid)
  function validateAmount(amount: string): string | null {
    if (!amount || amount.trim() === '') return 'Amount is required';
    const num = parseFloat(amount);
    if (isNaN(num)) return 'Please enter a valid number';
    if (num <= 0) return 'Amount must be greater than 0';
    // Check against available balance for the selected token
    const selectedBalance = chainTokens.find(t => t.symbol === formToken);
    if (selectedBalance) {
      const available = parseFloat(selectedBalance.balance);
      if (!isNaN(available) && num > available) {
        return `Exceeds available balance (${selectedBalance.balance} ${formToken})`;
      }
    }
    return null;
  }

  // Determine if the form is valid for submission
  const formAmountValidationError = validateAmount(formAmount);
  const isFormValid = !!formToken && !!formDestination && !!formAmount && !formAmountValidationError;

  // Handle withdrawal submission
  async function handleSubmitWithdrawal() {
    const validationError = validateAmount(formAmount);
    if (validationError) {
      setAmountError(validationError);
      return;
    }
    if (!formToken || !formDestination) return;

    try {
      setSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(false);
      setAmountError(null);

      await clientFetch('/v1/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          chainId: formChain,
          tokenSymbol: formToken,
          toAddress: formDestination,
          amount: formAmount,
        }),
      });

      setSubmitSuccess(true);
      setFormAmount("");

      // Refresh withdrawals list
      const withdrawalsRes = await clientFetch<{ success: boolean; withdrawals: ApiWithdrawal[]; meta: { total: number } }>('/v1/withdrawals?limit=100');
      const addressesRes = await clientFetch<{ success: boolean; addresses: ApiAddressBookEntry[]; meta: { total: number } }>('/v1/addresses?limit=100');

      const displayWithdrawals: DisplayWithdrawal[] = (withdrawalsRes?.withdrawals ?? []).map(w => {
        const chain = w.chainName || chainNames[w.chainId] || `Chain ${w.chainId}`;
        const addrEntry = (addressesRes?.addresses ?? []).find(a => a.address.toLowerCase() === w.toAddress.toLowerCase());
        const destLabel = addrEntry?.label || "Unknown";
        const shortAddr = w.toAddress.length > 14 ? `${w.toAddress.slice(0, 6)}...${w.toAddress.slice(-4)}` : w.toAddress;

        let displayStatus: "Confirmed" | "Confirming" | "Pending" = "Pending";
        if (w.status === 'confirmed') displayStatus = "Confirmed";
        else if (w.status === 'confirming' || w.status === 'broadcasted') displayStatus = "Confirming";

        const dateStr = new Date(w.createdAt).toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
        });

        return { date: dateStr, destinationLabel: destLabel, destinationAddr: shortAddr, token: w.tokenSymbol, amount: `-${w.amount}`, status: displayStatus, chain, txHash: w.txHash || "" };
      });
      setWithdrawals(displayWithdrawals);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create withdrawal');
    } finally {
      setSubmitting(false);
    }
  }

  const dailyLimitPercent = dailyLimitMax > 0 ? (dailyLimitUsed / dailyLimitMax) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="ml-3 text-text-muted font-display">Loading withdrawals...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">Error loading withdrawals</div>
        <div className="text-text-muted text-caption font-display">{error}</div>
      </div>
    );
  }

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
          value={pendingCount.toString()}
          sub="Awaiting confirmation"
          valueColor="text-status-warning"
        />
        <StatCard
          label="Confirmed Today"
          value={`$${confirmedTodayUsd.toLocaleString()}`}
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
              <span>${(dailyLimitUsed / 1000).toFixed(1)}K used</span>
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

          {submitSuccess && (
            <div className="mb-3 p-2.5 bg-status-success-subtle text-status-success rounded-input text-caption font-display">
              Withdrawal request submitted successfully.
            </div>
          )}
          {submitError && (
            <div className="mb-3 p-2.5 bg-status-error-subtle text-status-error rounded-input text-caption font-display">
              {submitError}
            </div>
          )}

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Chain
            </label>
            <select
              value={formChain}
              onChange={(e) => {
                const chain = parseInt(e.target.value);
                setFormChain(chain);
                const ct = tokenBalances.filter(b => b.chainId === chain);
                if (ct.length > 0) setFormToken(ct[0].symbol);
                const cd = destinations.filter(d => d.chainId === chain);
                if (cd.length > 0) setFormDestination(cd[0].address);
              }}
              className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
            >
              {availableChains.map(c => (
                <option key={c.chainId} value={c.chainId}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Token
            </label>
            <select
              value={formToken}
              onChange={(e) => setFormToken(e.target.value)}
              className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
            >
              {chainTokens.map(t => (
                <option key={`${t.symbol}-${t.chainId}`} value={t.symbol}>
                  {t.symbol} -- Balance: {t.balance}
                </option>
              ))}
              {chainTokens.length === 0 && (
                <option value="">No tokens available</option>
              )}
            </select>
          </div>

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Destination (whitelisted)
            </label>
            <select
              value={formDestination}
              onChange={(e) => setFormDestination(e.target.value)}
              className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
            >
              {chainDestinations.map((d) => (
                <option key={d.address} value={d.address}>
                  {d.label} -- {d.address}
                </option>
              ))}
              {chainDestinations.length === 0 && (
                <option value="">No whitelisted addresses for this chain</option>
              )}
            </select>
          </div>

          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
              Amount
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={formAmount}
              onChange={(e) => {
                setFormAmount(e.target.value);
                setAmountError(null);
              }}
              onBlur={() => {
                if (formAmount) {
                  setAmountError(validateAmount(formAmount));
                }
              }}
              placeholder="0.00"
              className={`w-full bg-surface-input border rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast ${
                amountError ? "border-status-error" : "border-border-default"
              }`}
            />
            {amountError && (
              <div className="mt-1 text-micro text-status-error font-display">
                {amountError}
              </div>
            )}
          </div>

          <div className="flex justify-between text-caption text-text-muted mb-3.5 px-3 py-2 bg-surface-elevated rounded-input font-display">
            <span>Estimated gas fee</span>
            <span className="font-mono">~$0.35</span>
          </div>

          <button
            onClick={handleSubmitWithdrawal}
            disabled={submitting || !isFormValid}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>Confirm Withdrawal &rarr;</>
            )}
          </button>
          <div className="text-center text-micro text-text-muted mt-1.5 font-display">
            Requires 2FA for amounts above $5,000
          </div>
        </div>

        {/* Withdrawal History */}
        <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
          <div className="flex items-center justify-between px-card-p py-[14px] border-b border-border-subtle">
            <div className="text-subheading font-display">Withdrawal History</div>
            <button
              onClick={() => window.alert("Export functionality is available in the Exports page.")}
              className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
            >
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
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-caption font-display">
                    No withdrawals found.
                  </td>
                </tr>
              ) : (
                withdrawals.map((w, i) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Address Whitelist */}
      <div className="mt-section-gap">
        <DataTable
          title="Address Whitelist"
          actions={
            <button
              onClick={() => window.alert("Add addresses through the Address Book page.")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
            >
              + Add Address
            </button>
          }
          headers={["Label", "Address", "Chain", "Status", "Withdrawals"]}
        >
          {addressBook.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-caption font-display">
                No whitelisted addresses found.
              </td>
            </tr>
          ) : (
            addressBook.map((addr) => {
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
            })
          )}
        </DataTable>
      </div>
    </div>
  );
}
