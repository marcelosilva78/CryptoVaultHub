"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import type { ChainHealth } from "../types";

interface ChainStatCardsProps {
  chains: ChainHealth[];
  updatedAt: string | undefined;
  isRefetching: boolean;
}

export function ChainStatCards({ chains, updatedAt, isRefetching }: ChainStatCardsProps) {
  const [agoText, setAgoText] = useState("");

  // Update "Xs ago" text every 5 seconds
  useEffect(() => {
    if (!updatedAt) return;

    function update() {
      const seconds = Math.round((Date.now() - new Date(updatedAt!).getTime()) / 1000);
      setAgoText(`Updated ${seconds}s ago`);
    }

    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [updatedAt]);

  const activeCount = chains.filter((c) => c.status === "active" || c.status === "draining").length;
  const healthyCount = chains.filter((c) => c.health?.overall === "healthy").length;
  const degradedCount = chains.filter((c) => c.health?.overall === "degraded").length;
  const criticalCount = chains.filter((c) => ["critical", "error"].includes(c.health?.overall)).length;

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-2">
        <StatCard label="Active Chains" value={String(activeCount)} color="accent" />
        <StatCard label="Healthy" value={String(healthyCount)} color="success" />
        <StatCard label="Degraded" value={String(degradedCount)} color="warning" />
        <StatCard label="Critical / Error" value={String(criticalCount)} color="error" />
      </div>
      {updatedAt && (
        <div className="flex items-center justify-end gap-1.5 text-caption text-text-muted font-display">
          <RefreshCw className={`w-3 h-3 ${isRefetching ? "animate-spin" : ""}`} />
          <span>{agoText}</span>
        </div>
      )}
    </div>
  );
}
