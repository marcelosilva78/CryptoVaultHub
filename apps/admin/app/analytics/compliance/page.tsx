"use client";

import { KpiCard } from "@/components/analytics/kpi-card";
import { BarChartCard } from "@/components/analytics/bar-chart-card";
import { AreaChartCard } from "@/components/analytics/area-chart-card";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { AnalyticsFilterBar } from "@/components/analytics/filter-bar";
import {
  analyticsScreeningsPerDay,
  analyticsHitRateTrend,
  analyticsAlertsBySeverity,
  analyticsResolutionTime,
  complianceAlerts,
  sanctionsLists,
} from "@/lib/mock-data";

export default function ComplianceAnalyticsPage() {
  return (
    <div className="space-y-6">
      <AnalyticsFilterBar />

      {/* Resolution Time KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Avg Resolution Time"
          value={analyticsResolutionTime.avgResolution}
          change={analyticsResolutionTime.avgResolutionChange}
          format="number"
          subtitle="hours"
        />
        <KpiCard
          title="Pending Alerts"
          value={analyticsResolutionTime.pendingAlerts}
          change={-8.0}
          format="number"
        />
        <KpiCard
          title="Resolved Today"
          value={analyticsResolutionTime.resolvedToday}
          change={15.2}
          format="number"
        />
        <KpiCard
          title="Escalated"
          value={analyticsResolutionTime.escalated}
          change={-25.0}
          format="number"
        />
      </div>

      {/* Screenings per Day */}
      <BarChartCard
        title="Screenings per Day (Last 30 Days)"
        data={analyticsScreeningsPerDay}
        xKey="date"
        bars={[
          { key: "screenings", color: "#3b82f6", name: "Screenings" },
          { key: "hits", color: "#ef4444", name: "Hits" },
        ]}
        height={300}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hit Rate Trend */}
        <AreaChartCard
          title="Hit Rate Trend (%)"
          data={analyticsHitRateTrend}
          xKey="date"
          yKeys={[{ key: "hitRate", color: "#f59e0b", name: "Hit Rate %" }]}
          height={260}
          formatValue={(v) => `${v.toFixed(1)}%`}
        />

        {/* Alerts by Severity */}
        <BarChartCard
          title="Alerts by Severity"
          data={analyticsAlertsBySeverity.filter((_, i) => i % 2 === 0)}
          xKey="date"
          bars={[
            { key: "critical", color: "#ef4444", name: "Critical", stackId: "sev" },
            { key: "high", color: "#f59e0b", name: "High", stackId: "sev" },
            { key: "medium", color: "#3b82f6", name: "Medium", stackId: "sev" },
            { key: "low", color: "#64748b", name: "Low", stackId: "sev" },
          ]}
          height={260}
        />
      </div>

      {/* Active KYT Alerts */}
      <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-text-primary">Active KYT Alerts</h3>
        <div className="space-y-2">
          {complianceAlerts.map((alert, idx) => {
            const severityStyles: Record<string, string> = {
              Critical: "bg-red-dim text-red",
              High: "bg-orange-dim text-orange",
              Medium: "bg-blue-dim text-blue",
            };
            return (
              <div
                key={idx}
                className="flex items-center gap-4 rounded-[var(--radius)] border border-border-subtle bg-bg-tertiary p-3 hover:bg-bg-hover transition-colors"
              >
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityStyles[alert.severity] ?? "bg-bg-elevated text-text-muted"}`}>
                  {alert.severity}
                </span>
                <span className="text-xs text-text-primary font-mono">{alert.address}</span>
                <span className="text-xs text-text-secondary flex-1">{alert.match}</span>
                <span className="text-xs text-text-muted">{alert.client}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sanctions Lists Status */}
      <AnalyticsDataTable
        title="Sanctions Lists Status"
        columns={[
          { header: "List", accessor: "name" },
          { header: "Entries", accessor: "entries", align: "right" },
          { header: "Crypto Addrs", accessor: "cryptoAddrs", align: "right" },
          { header: "Last Sync", accessor: "lastSync" },
          { header: "Status", accessor: "status" },
        ]}
        data={sanctionsLists}
      />

      {/* Blocked Addresses Summary */}
      <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-text-primary">Blocked Address Summary</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-[var(--radius)] bg-bg-tertiary border border-border-subtle p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">Total Blocked</div>
            <div className="text-2xl font-bold text-red tracking-tight">18</div>
          </div>
          <div className="rounded-[var(--radius)] bg-bg-tertiary border border-border-subtle p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">OFAC Matches</div>
            <div className="text-2xl font-bold text-orange tracking-tight">7</div>
          </div>
          <div className="rounded-[var(--radius)] bg-bg-tertiary border border-border-subtle p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">EU Sanctions</div>
            <div className="text-2xl font-bold text-blue tracking-tight">5</div>
          </div>
          <div className="rounded-[var(--radius)] bg-bg-tertiary border border-border-subtle p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">Mixer/Tornado</div>
            <div className="text-2xl font-bold text-purple tracking-tight">6</div>
          </div>
        </div>
      </div>
    </div>
  );
}
