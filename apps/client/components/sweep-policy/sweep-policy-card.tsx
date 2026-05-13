"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/api";

export type SweepMode =
  | "auto"
  | "manual"
  | "threshold_count"
  | "threshold_value"
  | "schedule";

interface Policy {
  projectId: number;
  chainId: number;
  mode: SweepMode;
  thresholdCount: number | null;
  thresholdUsd: string | null;
  scheduleCron: string | null;
  scheduleTz: string | null;
  isPaused: boolean;
  lastRunAt: string | null;
  isDefault?: boolean;
}

interface Props {
  projectId: number;
  chainId: number;
  chainName: string;
}

const SCHEDULE_PRESETS = [
  { label: "Cada 1 hora", cron: "0 * * * *" },
  { label: "Cada 2 horas", cron: "0 */2 * * *" },
  { label: "Cada 6 horas", cron: "0 */6 * * *" },
  { label: "Cada 12 horas", cron: "0 */12 * * *" },
  { label: "Uma vez por dia (00:00)", cron: "0 0 * * *" },
  { label: "Uma vez por dia (06:00)", cron: "0 6 * * *" },
];

const MODE_LABELS: Record<SweepMode, string> = {
  auto: "Automático (imediato)",
  manual: "Manual (apenas via botão)",
  threshold_count: "Por contagem de depósitos",
  threshold_value: "Por valor acumulado (USD)",
  schedule: "Agendado",
};

const TZ_PRESETS = [
  "UTC",
  "America/Sao_Paulo",
  "America/New_York",
  "Europe/London",
  "Asia/Singapore",
];

/**
 * Per-chain policy editor. Reads the active policy via
 * GET /v1/projects/:id/chains/:chainId/sweep-policy and persists with PATCH.
 *
 * "Sweep agora" (POST /v1/sweep/now?chainId=N) is rendered as a primary
 * action — works regardless of the policy mode, useful for emptying a
 * backlog when in manual or threshold modes.
 */
export function SweepPolicyCard({ projectId, chainId, chainName }: Props) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const [mode, setMode] = useState<SweepMode>("auto");
  const [thresholdCount, setThresholdCount] = useState(3);
  const [thresholdUsd, setThresholdUsd] = useState("10.00");
  const [scheduleCron, setScheduleCron] = useState(SCHEDULE_PRESETS[2].cron);
  const [scheduleTz, setScheduleTz] = useState("America/Sao_Paulo");
  const [isPaused, setIsPaused] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await clientFetch<{ success: boolean; policy: Policy }>(
          `/v1/projects/${projectId}/chains/${chainId}/sweep-policy`,
        );
        if (cancelled) return;
        const p = res.policy;
        setPolicy(p);
        setMode(p.mode);
        if (p.thresholdCount != null) setThresholdCount(p.thresholdCount);
        if (p.thresholdUsd) setThresholdUsd(p.thresholdUsd);
        if (p.scheduleCron) setScheduleCron(p.scheduleCron);
        if (p.scheduleTz) setScheduleTz(p.scheduleTz);
        setIsPaused(p.isPaused);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load policy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, chainId]);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setSaveOk(false);
      const body: Record<string, unknown> = { mode, isPaused };
      if (mode === "threshold_count") body.thresholdCount = thresholdCount;
      if (mode === "threshold_value") body.thresholdUsd = thresholdUsd;
      if (mode === "schedule") {
        body.scheduleCron = scheduleCron;
        body.scheduleTz = scheduleTz;
      }
      const res = await clientFetch<{ success: boolean; policy: Policy }>(
        `/v1/projects/${projectId}/chains/${chainId}/sweep-policy`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      setPolicy(res.policy);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (err: any) {
      setError(err?.message || "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  async function triggerSweep() {
    try {
      setTriggering(true);
      setTriggerMsg(null);
      const res = await clientFetch<{ success: boolean; message: string }>(
        `/v1/sweep/now?chainId=${chainId}`,
        { method: "POST" },
      );
      setTriggerMsg(res.message ?? "Sweep enfileirado");
      setTimeout(() => setTriggerMsg(null), 6000);
    } catch (err: any) {
      setError(err?.message || "Failed to trigger sweep");
    } finally {
      setTriggering(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
        <div className="text-caption text-text-muted font-display">
          Carregando política de {chainName}…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-subheading font-display text-text-primary">
            Política de Sweep — {chainName} <span className="text-text-muted text-caption">(chain {chainId})</span>
          </div>
          <div className="text-caption text-text-muted font-display mt-0.5">
            Define quando o sweep cron move fundos do forwarder para a hot wallet.
            Modo atual: <strong>{MODE_LABELS[policy?.mode ?? "auto"]}</strong>
            {policy?.isDefault && (
              <span className="ml-1 text-[10px] uppercase tracking-[0.08em] text-text-muted/70">(default — não personalizada)</span>
            )}
          </div>
          {policy?.lastRunAt && (
            <div className="text-[10px] text-text-muted font-display mt-1">
              Última execução automática: {new Date(policy.lastRunAt).toLocaleString()}
            </div>
          )}
        </div>
        <button
          onClick={triggerSweep}
          disabled={triggering}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50"
        >
          {triggering ? "Enfileirando…" : "Sweep agora"}
        </button>
      </div>

      {triggerMsg && (
        <div className="mb-3 text-caption text-status-success font-display bg-status-success/10 border border-status-success/30 rounded-input px-3 py-2">
          {triggerMsg}
        </div>
      )}

      <div className="space-y-3">
        <div className="grid gap-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
            Modo
          </div>
          {(Object.keys(MODE_LABELS) as SweepMode[]).map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`mode-${chainId}`}
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="accent-accent-primary"
              />
              <span className="text-caption font-display text-text-secondary">
                {MODE_LABELS[m]}
                {m === "threshold_value" && (
                  <span className="ml-1 text-[10px] text-text-muted">(requer USD pricing — em breve)</span>
                )}
              </span>
            </label>
          ))}
        </div>

        {mode === "threshold_count" && (
          <div className="grid gap-1.5 max-w-xs">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
              Mínimo de depósitos por forwarder antes de sweep
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              value={thresholdCount}
              onChange={(e) => setThresholdCount(parseInt(e.target.value, 10) || 1)}
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1.5 text-caption text-text-primary font-mono outline-none focus:border-border-focus"
            />
            <div className="text-[10px] text-text-muted/70 font-display">
              Ex.: 3 = espera acumular 3 depósitos no mesmo endereço antes de varrer juntos.
              Reduz o custo de gas por agregação.
            </div>
          </div>
        )}

        {mode === "threshold_value" && (
          <div className="grid gap-1.5 max-w-xs">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
              Valor mínimo acumulado (USD) antes de sweep
            </label>
            <input
              type="text"
              value={thresholdUsd}
              onChange={(e) => setThresholdUsd(e.target.value)}
              placeholder="10.00"
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1.5 text-caption text-text-primary font-mono outline-none focus:border-border-focus"
            />
            <div className="text-[10px] text-status-warning font-display">
              ⚠️ Modo aceito mas ainda não acionado no backend (requer integração de preços por token). Use threshold por contagem ou agenda enquanto isso.
            </div>
          </div>
        )}

        {mode === "schedule" && (
          <div className="grid gap-2 max-w-md">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
              Periodicidade
            </label>
            <select
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus"
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.cron} value={p.cron}>
                  {p.label}
                </option>
              ))}
            </select>
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display mt-1">
              Fuso horário
            </label>
            <select
              value={scheduleTz}
              onChange={(e) => setScheduleTz(e.target.value)}
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus"
            >
              {TZ_PRESETS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-text-muted/70 font-display">
              Cron resultante: <code className="font-mono">{scheduleCron}</code> · TZ {scheduleTz}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPaused}
            onChange={(e) => setIsPaused(e.target.checked)}
            className="accent-accent-primary"
          />
          <span className="text-caption font-display text-text-secondary">
            Pausar sweep nesta chain (suspende qualquer modo escolhido até despausar)
          </span>
        </label>

        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-surface-elevated text-text-primary border border-border-default hover:border-accent-primary disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar política"}
          </button>
          {saveOk && (
            <span className="text-caption text-status-success font-display">
              Política salva
            </span>
          )}
          {error && (
            <span className="text-caption text-status-error font-display">
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
