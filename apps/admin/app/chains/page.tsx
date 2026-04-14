"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useChainsHealth } from "./hooks";
import { ChainStatCards } from "./components/chain-stat-cards";
import { ChainTable } from "./components/chain-table";
import { AddChainModal } from "./components/add-chain-modal";
import { EditChainModal } from "./components/edit-chain-modal";
import { LifecycleModal } from "./components/lifecycle-modal";
import type { ChainHealth, LifecycleAction } from "./types";

export default function ChainsPage() {
  const { data, isLoading, isRefetching, error } = useChainsHealth();
  const [addModal, setAddModal] = useState(false);
  const [editChain, setEditChain] = useState<ChainHealth | null>(null);
  const [lifecycleState, setLifecycleState] = useState<{
    chain: ChainHealth;
    action: LifecycleAction;
  } | null>(null);

  const chains = data?.chains ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-heading text-text-primary">Blockchain Networks</h1>
        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-all duration-fast"
        >
          <Plus className="w-4 h-4" /> Add Chain
        </button>
      </div>

      <ChainStatCards chains={chains} updatedAt={data?.updatedAt} isRefetching={isRefetching} />

      {error && (
        <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-card px-4 py-3 font-display">
          Failed to load chains: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      <ChainTable
        chains={chains}
        loading={isLoading}
        onEdit={setEditChain}
        onLifecycle={(chain, action) => setLifecycleState({ chain, action })}
      />

      {addModal && <AddChainModal onClose={() => setAddModal(false)} />}
      {editChain && <EditChainModal chain={editChain} onClose={() => setEditChain(null)} />}
      {lifecycleState && (
        <LifecycleModal
          chain={lifecycleState.chain}
          action={lifecycleState.action}
          onClose={() => setLifecycleState(null)}
        />
      )}
    </div>
  );
}
