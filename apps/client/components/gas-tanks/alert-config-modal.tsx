'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { GasTank, gasTanksApi } from '@/lib/api';

interface Props { tank: GasTank; onClose: () => void; }
type Unit = 'wei' | 'gwei' | 'ether';

function fromWei(wei: string, unit: Unit) {
  try {
    const n = BigInt(wei);
    if (unit === 'wei') return n.toString();
    if (unit === 'gwei') return (Number(n) / 1e9).toString();
    return (Number(n) / 1e18).toString();
  } catch { return '0'; }
}
function toWei(value: string, unit: Unit) {
  if (unit === 'wei') return value.replace(/\D/g, '') || '0';
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '0';
  if (unit === 'gwei') return BigInt(Math.floor(n * 1e9)).toString();
  return BigInt(Math.floor(n * 1e18)).toString();
}

export function AlertConfigModal({ tank, onClose }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['alert-config', tank.chainId],
    queryFn: () => gasTanksApi.getAlertConfig(tank.chainId),
  });

  const [unit, setUnit] = useState<Unit>('ether');
  const [thresholdInput, setThresholdInput] = useState<string>('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(true);

  // Sync state from server when data arrives
  useEffect(() => {
    if (data?.config) {
      setThresholdInput(fromWei(data.config.thresholdWei, unit));
      setEmailEnabled(data.config.emailEnabled);
      setWebhookEnabled(data.config.webhookEnabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.config]);

  const mut = useMutation({
    mutationFn: () => gasTanksApi.updateAlertConfig(tank.chainId, {
      thresholdWei: toWei(thresholdInput, unit),
      emailEnabled, webhookEnabled,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gas-tanks'] });
      qc.invalidateQueries({ queryKey: ['alert-config', tank.chainId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configure Alerts — {tank.chainName}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-zinc-400" /></button>
        </header>

        <div>
          <label className="text-xs text-zinc-500">Low-balance threshold</label>
          <div className="flex gap-2 mt-1">
            <input value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)}
                   className="flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm text-white" />
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}
                    className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-white">
              <option value="ether">{tank.nativeSymbol}</option>
              <option value="gwei">gwei</option>
              <option value="wei">wei</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={webhookEnabled} onChange={(e) => setWebhookEnabled(e.target.checked)} />
          Send <code className="bg-zinc-800 px-1 rounded">gas_tank.low_balance</code> webhook events
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
          Email notification <span className="text-xs">(coming soon)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-white/5">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
