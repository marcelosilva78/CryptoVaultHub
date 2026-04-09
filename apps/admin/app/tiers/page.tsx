"use client";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { useTiers } from "@cvh/api-client/hooks";
import { presetTiers, customTiers } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  blue: "accent",
  purple: "accent",
  neutral: "neutral",
};

export default function TiersPage() {
  // API hook with mock data fallback
  const { data: apiTiers } = useTiers();
  void apiTiers; // Falls back to mock presetTiers / customTiers below

  return (
    <>
      {/* Preset Tiers */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-5 font-display">
        Preset Tiers
      </div>
      <div className="grid grid-cols-4 gap-4 mb-section-gap">
        {presetTiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "bg-surface-card border border-border-default rounded-card p-6 text-center transition-all duration-fast cursor-pointer hover:border-accent-primary shadow-card",
              tier.selected &&
                "border-accent-primary shadow-glow"
            )}
          >
            <div className="text-heading font-bold mb-1 text-accent-primary font-display">
              {tier.name}
            </div>
            <div className="text-caption text-text-muted mb-4 font-display">
              {tier.description}
            </div>
            {tier.features.map((feat) => (
              <div
                key={feat.label}
                className="text-caption text-text-secondary py-1 border-b border-border-subtle last:border-b-0 font-display"
              >
                <strong className="text-text-primary">{feat.value}</strong>{" "}
                {feat.label}
              </div>
            ))}
            <div className="mt-3">
              <Badge variant={badgeMap[tier.badgeColor] ?? "neutral"}>
                {tier.clients} clients
              </Badge>
            </div>
          </div>
        ))}

        {/* Custom Tier Card */}
        <div className="bg-surface-card border border-border-default border-dashed rounded-card p-6 text-center transition-all duration-fast cursor-pointer hover:border-accent-primary shadow-card">
          <div className="text-heading font-bold text-text-muted mb-1 font-display">
            + Custom
          </div>
          <div className="text-caption text-text-muted mb-4 font-display">
            Create from any base tier
          </div>
          <div className="py-[30px]">
            <div className="text-4xl text-text-muted opacity-50 font-display">+</div>
          </div>
          <div className="text-caption text-text-muted font-display">
            Select base {"\u2192"} customize {"\u2192"} save
          </div>
        </div>
      </div>

      {/* Custom Tiers Table */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
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
            <TableCell>
              <span className="font-semibold font-display text-text-primary">
                {tier.name}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={badgeMap[tier.basedOnColor] ?? "neutral"}>
                {tier.basedOn}
              </Badge>
            </TableCell>
            <TableCell className="text-caption">{tier.overrides}</TableCell>
            <TableCell>{tier.assignedTo}</TableCell>
            <TableCell>
              <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display">
                Edit
              </button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </>
  );
}
