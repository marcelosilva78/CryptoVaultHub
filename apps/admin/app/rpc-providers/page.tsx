"use client";

import { useState } from "react";
import { Radio, ChevronDown, ChevronRight, Plus, Activity } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// ─── Status mapping ───────────────────────────────────────────

const nodeStatusVariant: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  active: "success",
  draining: "warning",
  standby: "neutral",
  unhealthy: "error",
  disabled: "neutral",
};

const nodeStatusLabel: Record<string, string> = {
  active: "Active",
  draining: "Draining",
  standby: "Standby",
  unhealthy: "Unhealthy",
  disabled: "Disabled",
};

// ─── Mock data (used until API is connected) ─────────────────

const mockProviders = [
  {
    id: "1",
    name: "Alchemy",
    slug: "alchemy",
    authMethod: "api_key",
    isActive: true,
    website: "https://alchemy.com",
    nodes: [
      {
        id: "1",
        chainId: 1,
        chainName: "Ethereum",
        endpointUrl: "https://eth-mainnet.g.alchemy.com/v2/***",
        status: "active",
        priority: 10,
        healthScore: 99.5,
        consecutiveFailures: 0,
        maxRequestsPerSecond: 100,
        lastHealthCheckAt: "2026-04-09T14:30:00Z",
      },
      {
        id: "2",
        chainId: 56,
        chainName: "BSC",
        endpointUrl: "https://bnb-mainnet.g.alchemy.com/v2/***",
        status: "active",
        priority: 10,
        healthScore: 97.2,
        consecutiveFailures: 0,
        maxRequestsPerSecond: 100,
        lastHealthCheckAt: "2026-04-09T14:30:00Z",
      },
      {
        id: "3",
        chainId: 137,
        chainName: "Polygon",
        endpointUrl: "https://polygon-mainnet.g.alchemy.com/v2/***",
        status: "standby",
        priority: 50,
        healthScore: 100.0,
        consecutiveFailures: 0,
        maxRequestsPerSecond: 50,
        lastHealthCheckAt: "2026-04-09T14:29:30Z",
      },
    ],
  },
  {
    id: "2",
    name: "Infura",
    slug: "infura",
    authMethod: "api_key",
    isActive: true,
    website: "https://infura.io",
    nodes: [
      {
        id: "4",
        chainId: 1,
        chainName: "Ethereum",
        endpointUrl: "https://mainnet.infura.io/v3/***",
        status: "standby",
        priority: 20,
        healthScore: 95.0,
        consecutiveFailures: 0,
        maxRequestsPerSecond: 50,
        lastHealthCheckAt: "2026-04-09T14:30:00Z",
      },
      {
        id: "5",
        chainId: 137,
        chainName: "Polygon",
        endpointUrl: "https://polygon-mainnet.infura.io/v3/***",
        status: "active",
        priority: 10,
        healthScore: 98.1,
        consecutiveFailures: 0,
        maxRequestsPerSecond: 50,
        lastHealthCheckAt: "2026-04-09T14:29:45Z",
      },
    ],
  },
  {
    id: "3",
    name: "Tatum",
    slug: "tatum",
    authMethod: "api_key",
    isActive: true,
    website: "https://tatum.io",
    nodes: [
      {
        id: "6",
        chainId: 1,
        chainName: "Ethereum",
        endpointUrl: "https://api.tatum.io/v3/blockchain/node/ETH/***",
        status: "unhealthy",
        priority: 30,
        healthScore: 12.5,
        consecutiveFailures: 4,
        maxRequestsPerSecond: 30,
        lastHealthCheckAt: "2026-04-09T14:28:00Z",
      },
    ],
  },
  {
    id: "4",
    name: "QuickNode",
    slug: "quicknode",
    authMethod: "bearer",
    isActive: false,
    website: "https://quicknode.com",
    nodes: [],
  },
];

const mockStats = {
  totalProviders: 4,
  activeProviders: 3,
  totalNodes: 6,
  healthyNodes: 4,
  unhealthyNodes: 1,
  avgHealthScore: 83.7,
};

// ─── Health Score Bar ─────────────────────────────────────────

function HealthScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-status-success"
      : score >= 50
        ? "bg-status-warning"
        : "bg-status-error";

  const bgColor =
    score >= 80
      ? "bg-status-success-subtle"
      : score >= 50
        ? "bg-status-warning-subtle"
        : "bg-status-error-subtle";

  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-20 h-1.5 rounded-pill overflow-hidden", bgColor)}>
        <div
          className={cn("h-full rounded-pill transition-all duration-fast", color)}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <span
        className={cn(
          "text-caption font-mono font-semibold",
          score >= 80
            ? "text-status-success"
            : score >= 50
              ? "text-status-warning"
              : "text-status-error"
        )}
      >
        {score.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────

export default function RpcProvidersPage() {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedProvider((prev) => (prev === id ? null : id));
  };

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard label="Active Providers" value={String(mockStats.activeProviders)} color="accent" />
        <StatCard label="Total Nodes" value={String(mockStats.totalNodes)} />
        <StatCard label="Healthy Nodes" value={String(mockStats.healthyNodes)} color="success" />
        <StatCard label="Avg Health Score" value={`${mockStats.avgHealthScore}%`} color="success" />
      </div>

      {/* Providers Table */}
      <DataTable
        title="RPC Providers"
        headers={["", "Provider", "Slug", "Auth Method", "Nodes", "Status", "Actions"]}
        actions={
          <button className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast flex items-center gap-1.5 font-display">
            <Plus className="w-3.5 h-3.5" />
            New Provider
          </button>
        }
      >
        {mockProviders.map((provider) => {
          const isExpanded = expandedProvider === provider.id;
          const activeNodeCount = provider.nodes.filter(
            (n) => n.status === "active"
          ).length;
          const unhealthyNodeCount = provider.nodes.filter(
            (n) => n.status === "unhealthy"
          ).length;

          return (
            <>
              {/* Provider Row */}
              <TableRow key={provider.id}>
                <TableCell>
                  <button
                    onClick={() => toggleExpand(provider.id)}
                    className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
                    disabled={provider.nodes.length === 0}
                  >
                    {provider.nodes.length > 0 ? (
                      isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )
                    ) : (
                      <span className="w-4 h-4 inline-block" />
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-accent-primary" />
                    <div>
                      <div className="font-semibold font-display text-text-primary">
                        {provider.name}
                      </div>
                      {provider.website && (
                        <div className="text-text-muted text-caption font-display">
                          {provider.website}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-caption text-text-secondary">
                    {provider.slug}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="neutral">{provider.authMethod}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-text-primary">
                      {provider.nodes.length}
                    </span>
                    {activeNodeCount > 0 && (
                      <Badge variant="success">{activeNodeCount} active</Badge>
                    )}
                    {unhealthyNodeCount > 0 && (
                      <Badge variant="error">{unhealthyNodeCount} unhealthy</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={provider.isActive ? "success" : "neutral"} dot>
                    {provider.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display">
                      Edit
                    </button>
                    {provider.nodes.length === 0 && (
                      <button className="bg-accent-primary text-accent-text rounded-button px-3 py-1 text-caption font-semibold hover:bg-accent-hover transition-colors duration-fast font-display">
                        + Node
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>

              {/* Expanded Nodes */}
              {isExpanded &&
                provider.nodes.map((node) => (
                  <TableRow
                    key={`node-${node.id}`}
                    className="bg-surface-elevated/50"
                  >
                    <TableCell>
                      <span className="w-4 h-4 inline-block" />
                    </TableCell>
                    <TableCell>
                      <div className="pl-4 flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-text-muted" />
                        <div>
                          <div className="text-caption font-display text-text-primary font-medium">
                            Chain {node.chainId}{" "}
                            <span className="text-text-muted">
                              ({node.chainName})
                            </span>
                          </div>
                          <div className="text-caption text-text-muted font-mono truncate max-w-[280px]">
                            {node.endpointUrl}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-caption text-text-muted font-mono">
                        P{node.priority}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-caption text-text-muted font-mono">
                        {node.maxRequestsPerSecond} rps
                      </span>
                    </TableCell>
                    <TableCell>
                      <HealthScoreBar score={node.healthScore} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={nodeStatusVariant[node.status] ?? "neutral"}
                        dot
                      >
                        {nodeStatusLabel[node.status] ?? node.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-2.5 py-0.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display">
                          Edit
                        </button>
                        {node.status !== "active" && (
                          <button className="bg-status-success-subtle text-status-success rounded-button px-2.5 py-0.5 text-caption font-semibold hover:bg-status-success hover:text-white transition-all duration-fast font-display">
                            Activate
                          </button>
                        )}
                        {node.status === "active" && (
                          <button className="bg-status-warning-subtle text-status-warning rounded-button px-2.5 py-0.5 text-caption font-semibold hover:bg-status-warning hover:text-white transition-all duration-fast font-display">
                            Drain
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </>
          );
        })}
      </DataTable>
    </>
  );
}
