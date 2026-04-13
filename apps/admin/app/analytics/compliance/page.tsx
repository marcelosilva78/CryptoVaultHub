"use client";

import { useState, useEffect } from "react";
import { KpiCard } from "@/components/analytics/kpi-card";
import { BarChartCard } from "@/components/analytics/bar-chart-card";
import { AreaChartCard } from "@/components/analytics/area-chart-card";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { AnalyticsFilterBar } from "@/components/analytics/filter-bar";

const ADMIN_API =
  process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001/admin";

function getToken() {
  return typeof window !== "undefined"
    ? (localStorage.getItem("cvh_admin_token") ?? "")
    : "";
}

async function adminFetch(path: string) {
  const res = await fetch(`${ADMIN_API}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function ComplianceAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/analytics/compliance")
      .then(setData)
      .catch((e) => console.error("Analytics compliance failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const resolution = data?.resolution ?? {
    avgResolution: 0,
    avgResolutionChange: 0,
    pendingAlerts: 0,
    resolvedToday: 0,
    escalated: 0,
  };
  const screeningsPerDay = data?.screeningsPerDay ?? [];
  const hitRateTrend = data?.hitRateTrend ?? [];
  const alertsBySeverity = data?.alertsBySeverity ?? [];
  const activeAlerts = data?.activeAlerts ?? [];
  const sanctionsLists = data?.sanctionsLists ?? [];
  const blockedSummary = data?.blockedSummary ?? {
    total: 0,
    ofac: 0,
    eu: 0,
    mixer: 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="font-display text-text-muted">
          Loading compliance analytics…
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-section-gap">
      <AnalyticsFilterBar />

      {/* Resolution Time KPIs */}
      <div className="grid grid-cols-2 gap-stat-grid-gap lg:grid-cols-4">
        <KpiCard
          title="Avg Resolution Time"
          value={resolution.avgResolution}
          change={resolution.avgResolutionChange}
          format="number"
          subtitle="hours"
        />
        <KpiCard
          title="Pending Alerts"
          value={resolution.pendingAlerts}
          change={-8.0}
          format="number"
        />
        <KpiCard
          title="Resolved Today"
          value={resolution.resolvedToday}
          change={15.2}
          format="number"
        />
        <KpiCard
          title="Escalated"
          value={resolution.escalated}
          change={-25.0}
          format="number"
        />
      </div>

      {/* Screenings per Day — gold for screenings, red for hits (flagged = negative) */}
      <BarChartCard
        title="Screenings per Day (Last 30 Days)"
        data={screeningsPerDay}
        xKey="date"
        bars={[
          { key: "screenings", color: "var(--chart-primary)", name: "Screenings" },
          { key: "hits", color: "var(--chart-down)", name: "Hits" },
        ]}
        height={300}
      />

      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
        {/* Hit Rate Trend — gold monochromatic */}
        <AreaChartCard
          title="Hit Rate Trend (%)"
          data={hitRateTrend}
          xKey="date"
          yKeys={[
            { key: "hitRate", color: "var(--chart-primary)", name: "Hit Rate %" },
          ]}
          height={260}
          formatValue={(v) => `${v.toFixed(1)}%`}
        />

        {/* Alerts by Severity — gold tones for stacked severity levels */}
        <BarChartCard
          title="Alerts by Severity"
          data={alertsBySeverity.filter((_: any, i: number) => i % 2 === 0)}
          xKey="date"
          bars={[
            { key: "critical", color: "var(--chart-down)", name: "Critical", stackId: "sev" },
            { key: "high", color: "var(--chart-primary)", name: "High", stackId: "sev" },
            { key: "medium", color: "var(--chart-secondary)", name: "Medium", stackId: "sev" },
            { key: "low", color: "var(--chart-tertiary)", name: "Low", stackId: "sev" },
          ]}
          height={260}
        />
      </div>

      {/* Active KYT Alerts */}
      <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
        <h3 className="mb-4 font-display text-subheading text-text-primary">
          Active KYT Alerts
        </h3>
        <div className="space-y-2">
          {activeAlerts.length === 0 ? (
            <p className="font-display text-sm text-text-muted">No active alerts.</p>
          ) : (
            activeAlerts.map((alert: any, idx: number) => {
              const severityStyles: Record<string, string> = {
                critical: "bg-status-error-subtle text-status-error",
                Critical: "bg-status-error-subtle text-status-error",
                high: "bg-status-warning-subtle text-status-warning",
                High: "bg-status-warning-subtle text-status-warning",
                medium: "bg-accent-subtle text-accent-primary",
                Medium: "bg-accent-subtle text-accent-primary",
              };
              return (
                <div
                  key={idx}
                  className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-elevated p-3 transition-colors duration-fast hover:bg-surface-hover"
                >
                  <span
                    className={`inline-flex items-center rounded-badge px-2 py-0.5 font-display text-micro font-semibold ${
                      severityStyles[alert.severity] ??
                      "bg-surface-elevated text-text-muted"
                    }`}
                  >
                    {alert.severity}
                  </span>
                  <span className="font-mono text-xs text-text-primary">
                    {alert.address}
                  </span>
                  <span className="flex-1 font-display text-xs text-text-secondary">
                    {alert.match}
                  </span>
                  <span className="font-display text-xs text-text-muted">
                    {alert.client}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sanctions Lists Status */}
      <AnalyticsDataTable
        title="Sanctions Lists Status"
        columns={[
          { header: "List", accessor: "name" },
          { header: "Entries", accessor: "entries", align: "right" },
          { header: "Crypto Addrs", accessor: "cryptoAddrs", align: "right", mono: true },
          { header: "Last Sync", accessor: "lastSync" },
          { header: "Status", accessor: "status" },
        ]}
        data={sanctionsLists}
      />

      {/* Blocked Addresses Summary */}
      <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
        <h3 className="mb-4 font-display text-subheading text-text-primary">
          Blocked Address Summary
        </h3>
        <div className="grid grid-cols-2 gap-stat-grid-gap lg:grid-cols-4">
          <div className="rounded-card border border-border-subtle bg-surface-elevated p-4">
            <div className="mb-1 font-display text-micro uppercase tracking-widest text-text-muted">
              Total Blocked
            </div>
            <div className="font-display text-[24px] font-bold tracking-tight text-status-error">
              {blockedSummary.total}
            </div>
          </div>
          <div className="rounded-card border border-border-subtle bg-surface-elevated p-4">
            <div className="mb-1 font-display text-micro uppercase tracking-widest text-text-muted">
              OFAC Matches
            </div>
            <div className="font-display text-[24px] font-bold tracking-tight text-status-warning">
              {blockedSummary.ofac}
            </div>
          </div>
          <div className="rounded-card border border-border-subtle bg-surface-elevated p-4">
            <div className="mb-1 font-display text-micro uppercase tracking-widest text-text-muted">
              EU Sanctions
            </div>
            <div className="font-display text-[24px] font-bold tracking-tight text-accent-primary">
              {blockedSummary.eu}
            </div>
          </div>
          <div className="rounded-card border border-border-subtle bg-surface-elevated p-4">
            <div className="mb-1 font-display text-micro uppercase tracking-widest text-text-muted">
              Mixer/Tornado
            </div>
            <div className="font-display text-[24px] font-bold tracking-tight text-accent-hover">
              {blockedSummary.mixer}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
