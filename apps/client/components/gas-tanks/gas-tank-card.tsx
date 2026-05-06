'use client';
import { useState } from 'react';
import { Fuel, Bell, Download, History as HistoryIcon } from 'lucide-react';
import { GasTank } from '@/lib/api';
import { CopyButton } from '@/components/copy-button';

interface Props {
  tank: GasTank;
  onTopUp: () => void;
  onExport: () => void;
  onConfigureAlerts: () => void;
  onViewHistory: () => void;
}

const statusColor: Record<GasTank['status'], string> = {
  ok: 'bg-green-500/10 text-green-400 border-green-500/30',
  low: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function formatBalance(wei: string, decimals = 18) {
  try {
    const n = Number(BigInt(wei)) / 10 ** decimals;
    return n < 0.0001 && n > 0 ? n.toExponential(2) : n.toFixed(6);
  } catch {
    return '0';
  }
}

export function GasTankCard({ tank, onTopUp, onExport, onConfigureAlerts, onViewHistory }: Props) {
  const [showPath, setShowPath] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2"><Fuel className="h-5 w-5 text-blue-400" /></div>
          <div>
            <h3 className="text-lg font-semibold">{tank.chainName}</h3>
            <p className="text-sm text-zinc-400">Chain ID {tank.chainId}</p>
          </div>
        </div>
        <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusColor[tank.status]}`}>
          {tank.status.toUpperCase()}
        </span>
      </div>

      <div className="font-mono text-sm break-all flex items-center gap-2">
        <span className="text-zinc-300">{tank.address}</span>
        <CopyButton value={tank.address} />
      </div>

      <button onClick={() => setShowPath(s => !s)} className="text-xs text-zinc-500 hover:text-zinc-300">
        {showPath ? '▼' : '▶'} Derivation: <code>{showPath ? tank.derivationPath : '(hidden)'}</code>
      </button>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <p className="text-xs text-zinc-500">Balance</p>
          <p className="text-2xl font-semibold">
            {formatBalance(tank.balanceWei)} <span className="text-sm text-zinc-400">{tank.nativeSymbol}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Est. operations remaining</p>
          <p className="text-2xl font-semibold">{tank.estimatedOpsRemaining.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button onClick={onTopUp} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500">
          Top Up
        </button>
        <button onClick={onConfigureAlerts} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
          <Bell className="h-4 w-4" /> Alerts
        </button>
        <button onClick={onExport} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
          <Download className="h-4 w-4" /> Keystore
        </button>
        <button onClick={onViewHistory} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
          <HistoryIcon className="h-4 w-4" /> History
        </button>
      </div>
    </div>
  );
}
