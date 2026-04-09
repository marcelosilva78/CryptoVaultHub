"use client";

import { KpiCard } from "@/components/kpi-card";
import { BarChartCard } from "@/components/bar-chart-card";
import { AreaChartCard } from "@/components/area-chart-card";
import {
  screeningsPerDay,
  hitRateTrend,
  alertsBySeverity,
  resolutionTime,
} from "@/lib/mock-data";

export default function CompliancePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Compliance</h1>

      {/* Resolution time KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Avg Resolution Time"
          value={resolutionTime.avgResolution}
          change={resolutionTime.avgResolutionChange}
          format="number"
          subtitle="hours"
        />
        <KpiCard
          title="Pending Alerts"
          value={resolutionTime.pendingAlerts}
          change={-8.0}
          format="number"
        />
        <KpiCard
          title="Resolved Today"
          value={resolutionTime.resolvedToday}
          change={15.2}
          format="number"
        />
        <KpiCard
          title="Escalated"
          value={resolutionTime.escalated}
          change={-25.0}
          format="number"
        />
      </div>

      {/* Screenings per day */}
      <BarChartCard
        title="Screenings per Day (Last 30 Days)"
        data={screeningsPerDay}
        xKey="date"
        bars={[
          { key: "screenings", color: "#3b82f6", name: "Screenings" },
          { key: "hits", color: "#ef4444", name: "Hits" },
        ]}
        height={300}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hit rate trend */}
        <AreaChartCard
          title="Hit Rate Trend (%)"
          data={hitRateTrend}
          xKey="date"
          yKeys={[{ key: "hitRate", color: "#f59e0b", name: "Hit Rate %" }]}
          height={260}
          formatValue={(v) => `${v.toFixed(1)}%`}
        />

        {/* Alerts by severity stacked bar */}
        <BarChartCard
          title="Alerts by Severity"
          data={alertsBySeverity.filter((_, i) => i % 2 === 0)}
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
    </div>
  );
}
