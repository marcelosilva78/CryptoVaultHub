"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ScopePicker } from "./scope-picker";
import { IpChipInput } from "./ip-chip-input";

interface Project {
  id: number;
  name: string;
}

interface Props {
  projects: Project[];
  onCancel: () => void;
  onCreate: (input: {
    label: string;
    projectId: number;
    scopes: string[];
    ipAllowlist: string[];
    expiresAt?: string;
  }) => Promise<void>;
  submitting?: boolean;
  submitError?: string | null;
}

type ExpiryMode = "days" | "date" | "indefinite";

export function CreateKeyWizard({ projects, onCancel, onCreate, submitting, submitError }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [label, setLabel] = useState("");
  const [projectId, setProjectId] = useState<number | "">(
    projects.length === 1 ? projects[0].id : "",
  );
  const [scopes, setScopes] = useState<string[]>([]);
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("days");
  const [expiryDays, setExpiryDays] = useState<number>(90);
  const [expiryDate, setExpiryDate] = useState<string>("");

  const stepValid =
    (step === 1 && label.trim().length > 0 && projectId !== "") ||
    (step === 2 && scopes.length > 0) ||
    step === 3 ||
    step === 4;

  const computeExpiresAt = (): string | undefined => {
    if (expiryMode === "indefinite") return undefined;
    if (expiryMode === "date" && expiryDate) {
      return new Date(expiryDate + "T23:59:59Z").toISOString();
    }
    if (expiryMode === "days" && expiryDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + expiryDays);
      return d.toISOString();
    }
    return undefined;
  };

  const submit = async () => {
    if (projectId === "") return;
    await onCreate({
      label: label.trim(),
      projectId,
      scopes,
      ipAllowlist,
      expiresAt: computeExpiresAt(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40" role="dialog" aria-modal="true">
      <div className="bg-surface-card border border-border-default rounded-card max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-heading font-display text-text-primary">Create API Key</h2>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-micro font-display font-semibold ${
                  step === n
                    ? "bg-accent-primary text-accent-text"
                    : step > n
                      ? "bg-status-success-subtle text-status-success"
                      : "bg-surface-input text-text-muted"
                }`}
              >
                {n}
              </span>
            ))}
          </div>
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="grid gap-4">
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Production API"
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus"
                />
              </div>
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus"
                >
                  <option value="">— Select —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 2 && <ScopePicker selected={scopes} onChange={setScopes} />}

          {step === 3 && (
            <div className="grid gap-5">
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">IP allowlist</label>
                <IpChipInput value={ipAllowlist} onChange={setIpAllowlist} />
              </div>
              <div>
                <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">Expiration</label>
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="expmode" checked={expiryMode === "days"} onChange={() => setExpiryMode("days")} style={{ accentColor: "var(--accent-primary)" }} />
                    <span className="text-caption font-display">In</span>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(Math.max(1, Number(e.target.value) || 1))}
                      disabled={expiryMode !== "days"}
                      className="w-20 bg-surface-input border border-border-default rounded-input px-2 py-1 text-text-primary font-display text-body outline-none disabled:opacity-50"
                    />
                    <span className="text-caption font-display">days</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="expmode" checked={expiryMode === "date"} onChange={() => setExpiryMode("date")} style={{ accentColor: "var(--accent-primary)" }} />
                    <span className="text-caption font-display">On a specific date</span>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      disabled={expiryMode !== "date"}
                      className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-text-primary font-display text-body outline-none disabled:opacity-50"
                    />
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="expmode" checked={expiryMode === "indefinite"} onChange={() => setExpiryMode("indefinite")} style={{ accentColor: "var(--accent-primary)" }} />
                    <span className="text-caption font-display">Indefinite</span>
                    <span className="text-micro text-text-muted">(not recommended for production)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-2 text-caption font-display">
              <div><span className="text-text-muted">Label:</span> <strong className="text-text-primary">{label}</strong></div>
              <div><span className="text-text-muted">Project:</span> <strong className="text-text-primary">{projects.find((p) => p.id === projectId)?.name}</strong></div>
              <div><span className="text-text-muted">Scopes:</span> {scopes.map((s) => <code key={s} className="font-mono text-micro mr-1.5 px-1.5 py-0.5 rounded bg-surface-input">{s}</code>)}</div>
              <div><span className="text-text-muted">IPs:</span> {ipAllowlist.length === 0 ? <em className="text-text-muted">Any</em> : ipAllowlist.map((i) => <code key={i} className="font-mono text-micro mr-1.5 px-1.5 py-0.5 rounded bg-surface-input">{i}</code>)}</div>
              <div><span className="text-text-muted">Expiration:</span> <strong className="text-text-primary">{expiryMode === "indefinite" ? "Indefinite" : expiryMode === "date" ? expiryDate || "(no date)" : `In ${expiryDays} days`}</strong></div>
              {submitError && <div className="mt-2 p-2 rounded bg-status-error-subtle border border-status-error text-status-error">{submitError}</div>}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border-subtle flex justify-between">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep((s) => (s - 1) as any)} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
                Back
              </button>
            )}
            {step < 4 ? (
              <button type="button" disabled={!stepValid} onClick={() => setStep((s) => (s + 1) as any)} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50">
                Continue
              </button>
            ) : (
              <button type="button" disabled={submitting} onClick={submit} className="px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 inline-flex items-center gap-2">
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create Key
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
