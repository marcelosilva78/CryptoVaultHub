"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail, CheckCircle2, XCircle, Send, Save } from "lucide-react";
import { adminFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/* ─── Types ───────────────────────────────────────────────────────── */
interface SmtpSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_tls: string;
}

const DEFAULT_SMTP: SmtpSettings = {
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_password: "",
  smtp_from_email: "noreply@vaulthub.live",
  smtp_from_name: "CryptoVaultHub",
  smtp_tls: "true",
};

/* ─── Page ────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<SmtpSettings>(DEFAULT_SMTP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);

  /* Load current settings on mount */
  useEffect(() => {
    adminFetch("/settings/smtp")
      .then((data) => {
        const settings = data.settings || {};
        setForm({
          smtp_host: settings.smtp_host || "",
          smtp_port: settings.smtp_port || "587",
          smtp_user: settings.smtp_user || "",
          smtp_password: "",
          smtp_from_email: settings.smtp_from_email || "noreply@vaulthub.live",
          smtp_from_name: settings.smtp_from_name || "CryptoVaultHub",
          smtp_tls: settings.smtp_tls || "true",
        });
        setHasExistingPassword(!!settings.smtp_password && settings.smtp_password !== "");
      })
      .catch(() => {
        /* ignore — use defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  function set(field: keyof SmtpSettings, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveResult(null);
  }

  /* Save settings */
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    try {
      const payload: Record<string, string> = { ...form };
      // If the password field is empty and there's an existing one, don't overwrite
      if (!payload.smtp_password && hasExistingPassword) {
        payload.smtp_password = "****";
      }
      await adminFetch("/settings/smtp", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setSaveResult({ type: "success", message: "SMTP settings saved successfully." });
      if (form.smtp_password) {
        setHasExistingPassword(true);
        setForm((prev) => ({ ...prev, smtp_password: "" }));
      }
    } catch (err) {
      setSaveResult({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  /* Test connection */
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload: Record<string, string> = {
        recipientEmail: user?.email || "",
        ...form,
      };
      // If password field is empty and there's an existing password, don't send it
      if (!payload.smtp_password && hasExistingPassword) {
        delete payload.smtp_password;
      }
      const result = await adminFetch("/settings/smtp/test", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (result.success) {
        setTestResult({
          type: "success",
          message: `Test email sent successfully to ${user?.email || "your email"}.`,
        });
      } else {
        setTestResult({
          type: "error",
          message: result.error || "SMTP test failed.",
        });
      }
    } catch (err) {
      setTestResult({
        type: "error",
        message: err instanceof Error ? err.message : "Test request failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <>
      {/* Page Title */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-5 font-display">
        Settings
      </div>

      {/* SMTP Section */}
      <div className="bg-surface-card border border-border-default rounded-card shadow-card max-w-[720px]">
        {/* Card Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border-subtle">
          <div className="w-9 h-9 rounded-button bg-accent-subtle flex items-center justify-center">
            <Mail className="w-4.5 h-4.5 text-accent-primary" />
          </div>
          <div>
            <h2 className="font-display text-subheading text-text-primary">
              Email / SMTP Configuration
            </h2>
            <p className="text-caption text-text-muted mt-0.5 font-display">
              Configure the SMTP server used for sending invite emails and notifications.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave}>
          <div className="p-6 space-y-5">
            {/* Row: Host + Port */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-caption text-text-muted mb-1 font-display">
                  SMTP Host *
                </label>
                <input
                  type="text"
                  required
                  value={form.smtp_host}
                  onChange={(e) => set("smtp_host", e.target.value)}
                  placeholder="smtp.example.com"
                  className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
                />
              </div>
              <div>
                <label className="block text-caption text-text-muted mb-1 font-display">
                  Port *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={65535}
                  value={form.smtp_port}
                  onChange={(e) => set("smtp_port", e.target.value)}
                  placeholder="587"
                  className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
                />
              </div>
            </div>

            {/* Row: Username + Password */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-caption text-text-muted mb-1 font-display">
                  Username
                </label>
                <input
                  type="text"
                  value={form.smtp_user}
                  onChange={(e) => set("smtp_user", e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
                />
              </div>
              <div>
                <label className="block text-caption text-text-muted mb-1 font-display">
                  Password
                  {hasExistingPassword && (
                    <span className="ml-2 text-status-success font-normal">(saved)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={form.smtp_password}
                  onChange={(e) => set("smtp_password", e.target.value)}
                  placeholder={hasExistingPassword ? "Leave blank to keep current" : "Enter password"}
                  className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
                />
              </div>
            </div>

            {/* Row: From Email + From Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-caption text-text-muted mb-1 font-display">
                  From Email *
                </label>
                <input
                  type="email"
                  required
                  value={form.smtp_from_email}
                  onChange={(e) => set("smtp_from_email", e.target.value)}
                  placeholder="noreply@vaulthub.live"
                  className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
                />
              </div>
              <div>
                <label className="block text-caption text-text-muted mb-1 font-display">
                  From Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.smtp_from_name}
                  onChange={(e) => set("smtp_from_name", e.target.value)}
                  placeholder="CryptoVaultHub"
                  className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
                />
              </div>
            </div>

            {/* TLS Toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.smtp_tls === "true"}
                onClick={() =>
                  set("smtp_tls", form.smtp_tls === "true" ? "false" : "true")
                }
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-pill transition-colors duration-fast
                  ${form.smtp_tls === "true" ? "bg-accent-primary" : "bg-border-default"}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 rounded-pill bg-white shadow-sm transition-transform duration-fast
                    ${form.smtp_tls === "true" ? "translate-x-6" : "translate-x-1"}
                  `}
                />
              </button>
              <label className="text-body text-text-primary font-display cursor-pointer select-none">
                Use TLS / STARTTLS
              </label>
            </div>

            {/* Save Result */}
            {saveResult && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-input border text-caption font-display ${
                  saveResult.type === "success"
                    ? "text-status-success bg-status-success/10 border-status-success/30"
                    : "text-status-error bg-status-error/10 border-status-error/30"
                }`}
              >
                {saveResult.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                )}
                {saveResult.message}
              </div>
            )}

            {/* Test Result */}
            {testResult && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-input border text-caption font-display ${
                  testResult.type === "success"
                    ? "text-status-success bg-status-success/10 border-status-success/30"
                    : "text-status-error bg-status-error/10 border-status-error/30"
                }`}
              >
                {testResult.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                )}
                {testResult.message}
              </div>
            )}
          </div>

          {/* Card Footer: Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !form.smtp_host}
              className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast disabled:opacity-50 flex items-center gap-2"
            >
              {testing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {testing ? "Sending..." : "Test Connection"}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
