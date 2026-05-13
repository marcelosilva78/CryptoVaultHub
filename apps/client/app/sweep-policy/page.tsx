"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { clientFetch } from "@/lib/api";
import { SweepPolicyCard } from "@/components/sweep-policy/sweep-policy-card";

interface ApiWallet {
  chainId: number;
  walletType: string;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Smart Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
  11155111: "Sepolia",
  97: "BSC Testnet",
};

/**
 * Sweep Policy page — one card per chain that the active project operates on.
 * The active project comes from the project picker in the sidebar; chains are
 * discovered by listing the project's wallets and de-duplicating chainId.
 */
export default function SweepPolicyPage() {
  const { activeProject, isLoading: projectLoading } = useProject();
  const [chainIds, setChainIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await clientFetch<{ success: boolean; wallets: ApiWallet[] }>(
          "/v1/wallets",
        );
        if (cancelled) return;
        const ids = Array.from(
          new Set(
            (res.wallets ?? [])
              .filter((w) => w.walletType === "hot")
              .map((w) => w.chainId),
          ),
        ).sort((a, b) => a - b);
        setChainIds(ids);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load chains");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (projectLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Carregando…</span>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card text-center">
        <div className="text-body text-text-muted font-display">
          Selecione um projeto na sidebar para configurar a política de sweep.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-section-gap">
      <div>
        <h1 className="text-heading text-text-primary font-display tracking-tight">
          Política de Sweep
        </h1>
        <p className="text-caption text-text-muted mt-1 font-display">
          Defina quando o sweep cron move fundos do forwarder para a hot
          wallet. Por padrão, todos os depósitos são varridos imediatamente
          após confirmação (modo automático). Mude para reduzir custo de gas
          com agregação ou para tomar controle manual.
        </p>
        <p className="text-caption text-text-muted mt-1 font-display">
          Projeto:{" "}
          <strong className="text-text-secondary">{activeProject.name}</strong>{" "}
          <span className="text-text-muted/70">(id {activeProject.id})</span>
        </p>
      </div>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 rounded-card p-3 text-caption text-status-error font-display">
          {error}
        </div>
      )}

      {chainIds.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card text-center">
          <div className="text-body text-text-muted font-display mb-1">
            Nenhuma chain provisionada para este projeto
          </div>
          <div className="text-caption text-text-muted/70 font-display">
            Rode o Setup Wizard antes de configurar políticas.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {chainIds.map((cid) => (
            <SweepPolicyCard
              key={cid}
              projectId={Number(activeProject.id)}
              chainId={cid}
              chainName={CHAIN_NAMES[cid] ?? `Chain ${cid}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
