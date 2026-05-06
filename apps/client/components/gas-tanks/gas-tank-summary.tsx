'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Fuel, AlertTriangle } from 'lucide-react';
import { GasTank, gasTanksApi } from '@/lib/api';
import { TopupModal } from './topup-modal';

const dot: Record<GasTank['status'], string> = {
  ok: 'bg-green-400',
  low: 'bg-yellow-400',
  critical: 'bg-red-400',
};

function formatNative(wei: string) {
  try { return (Number(BigInt(wei)) / 1e18).toFixed(4); }
  catch { return '0'; }
}

export function GasTankSummary() {
  const { data } = useQuery({
    queryKey: ['gas-tanks'],
    queryFn: () => gasTanksApi.list(),
    refetchInterval: 30_000,
  });
  const [topup, setTopup] = useState<GasTank | null>(null);
  const tanks = data?.gasTanks ?? [];
  const critical = tanks.filter((t) => t.status === 'critical');

  return (
    <section className="space-y-3">
      {critical.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span>
            <strong>{critical.length}</strong> gas tank{critical.length > 1 ? 's' : ''} below threshold.
            Top up to keep operations running.
          </span>
          <Link href="/gas-tanks" className="ml-auto text-red-300 hover:underline whitespace-nowrap">Manage →</Link>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <header className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <Fuel className="h-4 w-4" /> Gas Tanks
          </h3>
          <Link href="/gas-tanks" className="text-xs text-blue-400 hover:underline">View all</Link>
        </header>
        <ul className="divide-y divide-white/5">
          {tanks.map((t) => (
            <li key={t.chainId} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${dot[t.status]}`} aria-label={t.status} />
                <span className="text-sm">{t.chainName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs">{formatNative(t.balanceWei)} {t.nativeSymbol}</span>
                <button onClick={() => setTopup(t)} className="text-xs text-blue-400 hover:underline">Top up</button>
              </div>
            </li>
          ))}
          {tanks.length === 0 && <li className="py-3 text-center text-xs text-zinc-500">No gas tanks yet.</li>}
        </ul>
      </div>

      {topup && <TopupModal tank={topup} onClose={() => setTopup(null)} />}
    </section>
  );
}
