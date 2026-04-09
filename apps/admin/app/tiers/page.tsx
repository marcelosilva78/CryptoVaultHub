"use client";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { useTiers } from "@cvh/api-client/hooks";
import { presetTiers, customTiers } from "@/lib/mock-data";

const tierNameColors: Record<string, string> = {
  Business: "text-accent",
  Enterprise: "text-purple",
};

export default function TiersPage() {
  // API hook with mock data fallback
  const { data: apiTiers } = useTiers();
  void apiTiers; // Falls back to mock presetTiers / customTiers below

  return (
    <>
      {/* Preset Tiers */}
      <div className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-5">
        Preset Tiers
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {presetTiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "bg-bg-secondary border border-border-subtle rounded-lg p-6 text-center transition-all cursor-pointer hover:border-accent",
              tier.selected &&
                "border-accent shadow-[0_0_20px_var(--accent-glow)]"
            )}
          >
            <div
              className={cn(
                "text-lg font-bold mb-1",
                tierNameColors[tier.name]
              )}
            >
              {tier.name}
            </div>
            <div className="text-[11px] text-text-muted mb-4">
              {tier.description}
            </div>
            {tier.features.map((feat) => (
              <div
                key={feat.label}
                className="text-[11px] text-text-secondary py-1 border-b border-border-subtle last:border-b-0"
              >
                <strong className="text-text-primary">{feat.value}</strong>{" "}
                {feat.label}
              </div>
            ))}
            <div className="mt-3">
              <Badge variant={tier.badgeColor}>
                {tier.clients} clients
              </Badge>
            </div>
          </div>
        ))}

        {/* Custom Tier Card */}
        <div className="bg-bg-secondary border border-border-subtle border-dashed rounded-lg p-6 text-center transition-all cursor-pointer hover:border-accent">
          <div className="text-lg font-bold text-text-muted mb-1">
            + Custom
          </div>
          <div className="text-[11px] text-text-muted mb-4">
            Create from any base tier
          </div>
          <div className="py-[30px]">
            <div className="text-4xl text-text-muted opacity-50">+</div>
          </div>
          <div className="text-[11px] text-text-muted">
            Select base {"\u2192"} customize {"\u2192"} save
          </div>
        </div>
      </div>

      {/* Custom Tiers Table */}
      <div className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
        Custom Tiers
      </div>
      <DataTable
        headers={[
          "Custom Tier Name",
          "Based On",
          "Key Overrides",
          "Assigned To",
          "Actions",
        ]}
      >
        {customTiers.map((tier) => (
          <TableRow key={tier.name}>
            <TableCell className="font-semibold">{tier.name}</TableCell>
            <TableCell>
              <Badge variant={tier.basedOnColor}>{tier.basedOn}</Badge>
            </TableCell>
            <TableCell className="text-[11px]">{tier.overrides}</TableCell>
            <TableCell>{tier.assignedTo}</TableCell>
            <TableCell>
              <button className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-3 py-1 text-[11px] font-semibold hover:border-text-secondary hover:text-text-primary transition-all">
                Edit
              </button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </>
  );
}
