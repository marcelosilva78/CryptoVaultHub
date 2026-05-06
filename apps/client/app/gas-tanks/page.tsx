'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gasTanksApi, GasTank } from '@/lib/api';
import { LayoutShell } from '@/components/layout-shell';
import { GasTankCard } from '@/components/gas-tanks/gas-tank-card';
import { TopupModal } from '@/components/gas-tanks/topup-modal';
import { AlertConfigModal } from '@/components/gas-tanks/alert-config-modal';
import { ExportKeystoreModal } from '@/components/gas-tanks/export-keystore-modal';
import { GasTankHistoryTable } from '@/components/gas-tanks/gas-tank-history-table';

type ModalKind = 'topup' | 'alerts' | 'keystore' | 'history' | null;

export default function GasTanksPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['gas-tanks'],
    queryFn: () => gasTanksApi.list(),
    refetchInterval: 30_000,
  });
  const [active, setActive] = useState<{ tank: GasTank; modal: ModalKind } | null>(null);
  const open = (tank: GasTank, modal: ModalKind) => setActive({ tank, modal });
  const close = () => setActive(null);

  return (
    <LayoutShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-bold">Gas Tanks</h1>
          <p className="text-sm text-zinc-400">Wallets that fund deploys, sweeps, flushes, and forwarder operations.</p>
        </header>

        {isLoading && <p className="text-zinc-500">Loading…</p>}
        {error && <p className="text-red-400">Failed to load gas tanks.</p>}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {data?.gasTanks.map((tank) => (
            <GasTankCard
              key={tank.chainId}
              tank={tank}
              onTopUp={() => open(tank, 'topup')}
              onConfigureAlerts={() => open(tank, 'alerts')}
              onExport={() => open(tank, 'keystore')}
              onViewHistory={() => open(tank, 'history')}
            />
          ))}
        </div>

        {active?.modal === 'topup' && <TopupModal tank={active.tank} onClose={close} />}
        {active?.modal === 'alerts' && <AlertConfigModal tank={active.tank} onClose={close} />}
        {active?.modal === 'keystore' && <ExportKeystoreModal tank={active.tank} onClose={close} />}
        {active?.modal === 'history' && <GasTankHistoryTable tank={active.tank} onClose={close} />}
      </div>
    </LayoutShell>
  );
}
