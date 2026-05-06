'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { GasTank, gasTanksApi } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';
import { QrCode } from '@/components/qr-code';

interface Props { tank: GasTank; onClose: () => void; }

function formatNative(wei: string) {
  try { return (Number(BigInt(wei)) / 1e18).toFixed(6); }
  catch { return '0'; }
}

export function TopupModal({ tank, onClose }: Props) {
  const { data: uri } = useQuery({
    queryKey: ['topup-uri', tank.chainId],
    queryFn: () => gasTanksApi.topupUri(tank.chainId),
  });
  const startBalance = useRef(BigInt(tank.balanceWei));
  const [funded, setFunded] = useState(false);

  const { data: live } = useQuery({
    queryKey: ['gas-tanks-poll', tank.chainId],
    queryFn: () => gasTanksApi.list(),
    refetchInterval: 15_000,
    enabled: !funded,
  });
  const current = live?.gasTanks.find((t) => t.chainId === tank.chainId);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    try {
      if (BigInt(current.balanceWei) > startBalance.current) {
        setFunded(true);
        const t = setTimeout(() => { if (!cancelled) onClose(); }, 60_000);
        return () => { cancelled = true; clearTimeout(t); };
      }
    } catch { /* ignore parse errors */ }
  }, [current, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top Up Gas Tank — {tank.chainName}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-zinc-400" /></button>
        </header>

        {uri && (
          <div className="flex justify-center bg-white p-4 rounded-lg">
            <QrCode value={uri.eip681Uri} size={200} />
          </div>
        )}

        <div>
          <p className="text-xs text-zinc-500 mb-1">Address</p>
          <div className="font-mono text-sm break-all flex items-center gap-2">
            <span>{tank.address}</span>
            <CopyButton value={tank.address} />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-800 p-3">
          <p className="text-xs text-zinc-500">Live balance ({tank.nativeSymbol})</p>
          <p className="text-2xl font-semibold">{current ? formatNative(current.balanceWei) : '…'}</p>
          {funded && <p className="mt-2 text-sm text-green-400">✓ Funded! Closing automatically.</p>}
        </div>
      </div>
    </div>
  );
}
