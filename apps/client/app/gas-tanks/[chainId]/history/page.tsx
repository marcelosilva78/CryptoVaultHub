'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { gasTanksApi, GasTankTx, GasTank } from '@/lib/api';
import { LayoutShell } from '@/components/layout-shell';

const opLabel: Record<string, string> = {
  deploy_wallet: 'Wallet deploy',
  deploy_forwarder: 'Forwarder deploy',
  sweep: 'Sweep',
  flush: 'Flush',
  topup_internal: 'Internal top-up',
  other: 'Other',
};
const ALL_OPS = Object.keys(opLabel);
const PAGE_SIZE = 50;

function formatNative(wei: string | null | undefined, decimals = 18) {
  if (!wei) return '—';
  try { return (Number(BigInt(wei)) / 10 ** decimals).toFixed(6); }
  catch { return '—'; }
}

export default function GasTankHistoryPage() {
  const params = useParams<{ chainId: string }>();
  const chainId = Number(params?.chainId);

  const [type, setType] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [page, setPage] = useState(0);

  // Fetch the tank for the explorer URL + symbol
  const { data: tanksResp } = useQuery({
    queryKey: ['gas-tanks'],
    queryFn: () => gasTanksApi.list(),
  });
  const tank: GasTank | undefined = tanksResp?.gasTanks.find((t) => t.chainId === chainId);

  const { data, isLoading } = useQuery({
    queryKey: ['gas-tank-history', chainId, type, from, to, page],
    queryFn: () => gasTanksApi.history(chainId, {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      type: type || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
  });

  const explorerTxUrl = (txHash: string) =>
    tank?.explorerUrl ? `${tank.explorerUrl.replace(/\/$/, '')}/tx/${txHash}` : '#';

  return (
    <LayoutShell>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Gas Spend — {tank?.chainName ?? `Chain ${chainId}`}
            </h1>
            <p className="text-sm text-zinc-400">All gas-tank-funded transactions for this chain.</p>
          </div>
          <Link href="/gas-tanks" className="text-sm text-blue-400 hover:underline">← Back to Gas Tanks</Link>
        </header>

        <div className="flex flex-wrap gap-3 rounded-xl border border-white/10 bg-zinc-900/60 p-4">
          <div>
            <label className="block text-xs text-zinc-500">Type</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}
                    className="mt-1 rounded-md bg-zinc-800 px-3 py-2 text-sm text-white">
              <option value="">All</option>
              {ALL_OPS.map((op) => <option key={op} value={op}>{opLabel[op]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">From</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }}
                   className="mt-1 rounded-md bg-zinc-800 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">To</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }}
                   className="mt-1 rounded-md bg-zinc-800 px-3 py-2 text-sm text-white" />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/60">
          {isLoading && <p className="p-4 text-zinc-500">Loading…</p>}
          {data && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Gas used</th>
                  <th>Gas cost</th>
                  <th className="px-4">Tx</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: GasTankTx) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="px-4 py-2 whitespace-nowrap">{new Date(r.submittedAt).toLocaleString()}</td>
                    <td>{opLabel[r.operationType] ?? r.operationType}</td>
                    <td>
                      <span className={r.status === 'confirmed' ? 'text-green-400' : r.status === 'failed' ? 'text-red-400' : 'text-zinc-400'}>
                        {r.status}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{r.gasUsed ?? '—'}</td>
                    <td className="font-mono text-xs">
                      {r.gasCostWei ? `${formatNative(r.gasCostWei)} ${tank?.nativeSymbol ?? ''}` : '—'}
                    </td>
                    <td className="px-4">
                      {tank?.explorerUrl ? (
                        <a className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                           href={explorerTxUrl(r.txHash)} target="_blank" rel="noreferrer">
                          {r.txHash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-zinc-500">{r.txHash.slice(0, 10)}…</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-zinc-500">No transactions match.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between p-4 border-t border-white/5 text-sm">
              <span className="text-zinc-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                        className="rounded-md border border-white/10 px-3 py-1 disabled:opacity-50 hover:bg-white/5">Prev</button>
                <button disabled={(page + 1) * PAGE_SIZE >= data.total} onClick={() => setPage((p) => p + 1)}
                        className="rounded-md border border-white/10 px-3 py-1 disabled:opacity-50 hover:bg-white/5">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
