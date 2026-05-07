'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import { GasTank, GasTankTx, gasTanksApi } from '@/lib/api';

interface Props { tank: GasTank; onClose: () => void; }

const opLabel: Record<string, string> = {
  deploy_wallet: 'Wallet deploy',
  deploy_forwarder: 'Forwarder deploy',
  sweep: 'Sweep',
  flush: 'Flush',
  topup_internal: 'Internal top-up',
  other: 'Other',
};

function explorerTxUrl(explorerUrl: string | null, txHash: string): string {
  if (!explorerUrl) return '#';
  return `${explorerUrl.replace(/\/$/, '')}/tx/${txHash}`;
}

function formatNative(wei: string | null | undefined, decimals = 18) {
  if (!wei) return '—';
  try { return (Number(BigInt(wei)) / 10 ** decimals).toFixed(6); }
  catch { return '—'; }
}

export function GasTankHistoryTable({ tank, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['gas-tank-history', tank.chainId, 5],
    queryFn: () => gasTanksApi.history(tank.chainId, { limit: 5, offset: 0 }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Gas Spend — {tank.chainName}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-zinc-400" /></button>
        </header>

        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
          Gas spend tracking started on May 6, 2026. Earlier operations are visible in the
          {' '}<Link href="/projects" className="underline hover:text-blue-100">Deploy History</Link>{' '}
          and{' '}<Link href="/flush" className="underline hover:text-blue-100">Flush</Link>{' '}pages.
        </div>

        {isLoading && <p className="text-zinc-500">Loading…</p>}
        {error && <p className="text-red-400">Failed to load history.</p>}

        {data && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-2">When</th>
                <th>Type</th>
                <th>Status</th>
                <th>Gas cost</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: GasTankTx) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-2 whitespace-nowrap">{new Date(r.submittedAt).toLocaleString()}</td>
                  <td>{opLabel[r.operationType] ?? r.operationType}</td>
                  <td>
                    <span className={r.status === 'confirmed' ? 'text-green-400' : r.status === 'failed' ? 'text-red-400' : 'text-zinc-400'}>
                      {r.status}
                    </span>
                  </td>
                  <td className="font-mono text-xs">
                    {r.gasCostWei ? `${formatNative(r.gasCostWei)} ${tank.nativeSymbol}` : '—'}
                  </td>
                  <td>
                    {tank.explorerUrl ? (
                      <a className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                         href={explorerTxUrl(tank.explorerUrl, r.txHash)} target="_blank" rel="noreferrer">
                        {r.txHash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="font-mono text-xs text-zinc-500">{r.txHash.slice(0, 10)}…</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">No gas spend yet.</td></tr>
              )}
            </tbody>
          </table>
        )}

        <div className="flex justify-end">
          <Link href={`/gas-tanks/${tank.chainId}/history`} className="text-sm text-blue-400 hover:underline">
            View full history →
          </Link>
        </div>
      </div>
    </div>
  );
}
