"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { clientFetch } from "@/lib/api";

/* ── Types ──────────────────────────────────────────────────── */
interface NotificationRule {
  id: string;
  name: string;
  eventType: string;
  condition: string | null;
  threshold: string | null;
  deliveryMethod: "email" | "webhook";
  deliveryTarget: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type RuleFormData = {
  name: string;
  eventType: string;
  condition: string;
  threshold: string;
  deliveryMethod: "email" | "webhook";
  deliveryTarget: string;
  isEnabled: boolean;
};

/* ── Constants ──────────────────────────────────────────────── */
const EVENT_TYPES = [
  { value: "deposit.confirmed", label: "Deposit Confirmed" },
  { value: "deposit.threshold", label: "Deposit Threshold" },
  { value: "withdrawal.confirmed", label: "Withdrawal Confirmed" },
  { value: "withdrawal.threshold", label: "Withdrawal Threshold" },
  { value: "daily_summary", label: "Daily Summary" },
  { value: "weekly_report", label: "Weekly Report" },
  { value: "gas_tank.low", label: "Gas Tank Low" },
  { value: "compliance.alert", label: "Compliance Alert" },
];

const CONDITIONS = [
  { value: "any", label: "Any event" },
  { value: "amount_gt", label: "Amount greater than" },
  { value: "amount_lt", label: "Amount less than" },
  { value: "token_eq", label: "Specific token" },
  { value: "chain_eq", label: "Specific chain" },
];

const emptyForm: RuleFormData = {
  name: "",
  eventType: "deposit.confirmed",
  condition: "any",
  threshold: "",
  deliveryMethod: "email",
  deliveryTarget: "",
  isEnabled: true,
};

/* ── RuleModal ──────────────────────────────────────────────── */
function RuleModal({
  open,
  editRule,
  onClose,
  onSave,
}: {
  open: boolean;
  editRule: NotificationRule | null;
  onClose: () => void;
  onSave: (data: RuleFormData, id?: string) => Promise<void>;
}) {
  const [form, setForm] = useState<RuleFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      if (editRule) {
        setForm({
          name: editRule.name,
          eventType: editRule.eventType,
          condition: editRule.condition ?? "any",
          threshold: editRule.threshold ?? "",
          deliveryMethod: editRule.deliveryMethod,
          deliveryTarget: editRule.deliveryTarget ?? "",
          isEnabled: editRule.isEnabled,
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, editRule]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(form, editRule?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const showThreshold = form.condition === "amount_gt" || form.condition === "amount_lt" || form.condition === "token_eq" || form.condition === "chain_eq";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[520px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h3 className="font-display text-subheading text-text-primary">
            {editRule ? "Edit Notification Rule" : "New Notification Rule"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Rule Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Large Deposit Alert"
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display placeholder:text-text-muted"
            />
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Event Type</label>
            <select
              value={form.eventType}
              onChange={(e) => setForm({ ...form, eventType: e.target.value })}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display"
            >
              {EVENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Condition</label>
            <select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display"
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Threshold (conditional) */}
          {showThreshold && (
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">
                {form.condition === "token_eq" ? "Token Symbol" : form.condition === "chain_eq" ? "Chain Name" : "Amount Threshold"}
              </label>
              <input
                type="text"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                placeholder={form.condition === "token_eq" ? "USDT" : form.condition === "chain_eq" ? "ethereum" : "1000.00"}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
          )}

          {/* Delivery Method */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Delivery Method</label>
            <select
              value={form.deliveryMethod}
              onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value as "email" | "webhook" })}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display"
            >
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          {/* Delivery Target */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">
              {form.deliveryMethod === "email" ? "Email Address" : "Webhook URL"}
            </label>
            <input
              type={form.deliveryMethod === "email" ? "email" : "url"}
              value={form.deliveryTarget}
              onChange={(e) => setForm({ ...form, deliveryTarget: e.target.value })}
              placeholder={form.deliveryMethod === "email" ? "alerts@company.com" : "https://hooks.company.com/notify"}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display placeholder:text-text-muted"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setForm({ ...form, isEnabled: !form.isEnabled })}
              className={`relative w-9 h-5 rounded-pill transition-colors duration-fast ${form.isEnabled ? "bg-accent-primary" : "bg-surface-elevated border border-border-default"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-pill bg-white shadow transition-transform duration-fast ${form.isEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <span className="text-caption font-display text-text-primary">{form.isEnabled ? "Enabled" : "Disabled"}</span>
          </div>

          {error && <div className="px-3 py-2 bg-status-error-subtle rounded-card text-caption text-status-error font-display">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
              {saving && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              {editRule ? "Save Changes" : "Create Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────── */
export default function NotificationsPage() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<NotificationRule | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await clientFetch<{ rules: NotificationRule[] }>("/v1/notifications/rules");
      setRules(res.rules ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load notification rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSave = async (data: RuleFormData, id?: string) => {
    if (id) {
      await clientFetch(`/v1/notifications/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    } else {
      await clientFetch("/v1/notifications/rules", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    setLoading(true);
    await fetchRules();
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this notification rule?")) return;
    try {
      await clientFetch(`/v1/notifications/rules/${ruleId}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      // silently handle
    }
  };

  const handleToggle = async (rule: NotificationRule) => {
    setTogglingId(rule.id);
    try {
      await clientFetch(`/v1/notifications/rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: !rule.isEnabled }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isEnabled: !r.isEnabled } : r))
      );
    } catch {
      // silently handle
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading notification rules...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchRules(); }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary flex items-center gap-2">
            <Bell className="w-5 h-5 text-accent-primary" />
            Notifications
          </h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Configure alert rules for deposits, withdrawals, and platform events
          </p>
        </div>
        <button
          onClick={() => { setEditRule(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          <Plus className="w-3.5 h-3.5" />
          New Rule
        </button>
      </div>

      {/* Rules */}
      {rules.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card text-center py-12">
          <Bell className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-text-muted font-display text-body mb-2">
            No notification rules yet
          </p>
          <p className="text-text-muted font-display text-caption">
            Create a rule to start receiving alerts for deposits, withdrawals, and other events.
          </p>
        </div>
      ) : (
        <DataTable
          title="Notification Rules"
          headers={["Name", "Event", "Condition", "Delivery", "Status", "Actions"]}
          actions={
            <span className="text-caption text-text-muted font-display">
              {rules.length} rule{rules.length !== 1 ? "s" : ""}
            </span>
          }
        >
          {rules.map((rule) => (
            <tr key={rule.id} className="hover:bg-surface-hover transition-colors duration-fast">
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <span className="font-display text-body font-semibold text-text-primary">{rule.name}</span>
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <Badge variant={rule.eventType.includes("deposit") ? "success" : rule.eventType.includes("withdrawal") ? "warning" : "accent"}>
                  {rule.eventType}
                </Badge>
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <span className="font-display text-caption text-text-secondary">
                  {rule.condition === "any" || !rule.condition
                    ? "Any"
                    : `${rule.condition} ${rule.threshold ?? ""}`}
                </span>
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <div className="flex items-center gap-1.5">
                  <Badge variant="neutral">{rule.deliveryMethod}</Badge>
                  {rule.deliveryTarget && (
                    <span className="font-mono text-micro text-text-muted truncate max-w-[140px]">
                      {rule.deliveryTarget}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <button
                  onClick={() => handleToggle(rule)}
                  disabled={togglingId === rule.id}
                  className={`relative w-9 h-5 rounded-pill transition-colors duration-fast ${rule.isEnabled ? "bg-accent-primary" : "bg-surface-elevated border border-border-default"}`}
                >
                  {togglingId === rule.id ? (
                    <Loader2 className="w-3 h-3 animate-spin absolute top-1 left-3 text-white" />
                  ) : (
                    <span className={`absolute top-0.5 w-4 h-4 rounded-pill bg-white shadow transition-transform duration-fast ${rule.isEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  )}
                </button>
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setEditRule(rule); setModalOpen(true); }}
                    className="p-1.5 rounded-button text-text-muted hover:text-accent-primary hover:bg-accent-subtle transition-all duration-fast"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1.5 rounded-button text-text-muted hover:text-status-error hover:bg-status-error-subtle transition-all duration-fast"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <RuleModal
        open={modalOpen}
        editRule={editRule}
        onClose={() => { setModalOpen(false); setEditRule(null); }}
        onSave={handleSave}
      />
    </div>
  );
}
