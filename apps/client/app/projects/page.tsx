"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { clientFetch } from "@/lib/api";
import { Loader2, FolderKanban } from "lucide-react";

interface Project {
  id: number;
  name: string;
  slug: string;
  status: string;
  chainsCount: number;
  walletsCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await clientFetch<{ projects: Project[] }>("/v1/projects");
      setProjects(res.projects ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">
          Loading projects...
        </span>
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchProjects();
          }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  const activeCount = projects.filter((p) => p.status === "active").length;
  const totalChains = projects.reduce((sum, p) => sum + (p.chainsCount ?? 0), 0);
  const totalWallets = projects.reduce((sum, p) => sum + (p.walletsCount ?? 0), 0);

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">
          Projects
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Manage your blockchain projects and their deployments
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-4 text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">
            Dismiss
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Total Projects"
          value={projects.length.toString()}
          sub="All projects"
          valueColor="text-accent-primary"
        />
        <StatCard
          label="Active"
          value={activeCount.toString()}
          sub="Currently deployed"
          valueColor="text-status-success"
        />
        <StatCard
          label="Total Chains"
          value={totalChains.toString()}
          sub="Across all projects"
        />
        <StatCard
          label="Total Wallets"
          value={totalWallets.toString()}
          sub="Across all projects"
        />
      </div>

      {/* Projects Table */}
      <DataTable
        title="All Projects"
        actions={
          <button
            onClick={() => router.push("/setup")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
          >
            New Project
          </button>
        }
        headers={["Name", "Slug", "Chains", "Wallets", "Created", "Status"]}
      >
        {projects.length === 0 ? (
          <tr>
            <td
              colSpan={6}
              className="px-[14px] py-6 text-center text-text-muted font-display"
            >
              <div className="flex flex-col items-center gap-2">
                <FolderKanban className="w-8 h-8 text-text-muted/50" />
                No projects yet. Create one using the Setup Wizard.
              </div>
            </td>
          </tr>
        ) : (
          projects.map((project) => (
            <tr
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}/export`)}
              className="hover:bg-surface-hover transition-colors duration-fast cursor-pointer"
            >
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display font-semibold text-text-primary">
                {project.name}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-text-secondary">
                {project.slug}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                {project.chainsCount ?? 0}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                {project.walletsCount ?? 0}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
                {project.createdAt
                  ? new Date(project.createdAt).toLocaleDateString()
                  : "--"}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <StatusBadge status={project.status} />
              </td>
            </tr>
          ))
        )}
      </DataTable>
    </div>
  );
}
