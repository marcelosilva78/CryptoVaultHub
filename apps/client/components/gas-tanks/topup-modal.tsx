'use client';
import type { GasTank } from '@/lib/api';

export function TopupModal({ tank, onClose }: { tank: GasTank; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="rounded-xl bg-zinc-900 p-6">Top up {tank.chainName} — coming soon</div>
    </div>
  );
}
