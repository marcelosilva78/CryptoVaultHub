"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { clientFetch } from "@/lib/api";
import { useClientAuth } from "@/lib/auth-context";
import {
  Loader2,
  ChevronLeft,
  Download,
  KeyRound,
  FileJson,
  Globe,
  ShieldAlert,
  CheckCircle,
} from "lucide-react";

export default function ExportProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoading: authLoading } = useClientAuth();
  const projectId = params.id as string;

  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      setError(null);
      setSuccess(false);

      const res = await clientFetch<{ export: any }>(
        `/v1/projects/${projectId}/export`
      );

      const exportData = res.export;
      const projectName =
        exportData?.project?.slug ?? exportData?.project?.name ?? projectId;

      // Trigger browser download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectName}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to export project");
    } finally {
      setExporting(false);
    }
  }, [projectId]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading...</span>
      </div>
    );
  }

  const includedItems = [
    {
      icon: KeyRound,
      label: "Public Keys",
      description:
        "Platform, client, and backup public keys with addresses and derivation paths",
    },
    {
      icon: Globe,
      label: "Contract Addresses",
      description:
        "Wallet factory, forwarder factory, wallet impl, forwarder impl, and hot wallet addresses per chain",
    },
    {
      icon: FileJson,
      label: "ABIs",
      description:
        "Contract ABIs for CvhWalletSimple, CvhForwarder, CvhWalletFactory, and CvhForwarderFactory",
    },
    {
      icon: Download,
      label: "Deploy Traces",
      description:
        "Full deployment audit trail including tx hashes, gas costs, block numbers, and deployer addresses",
    },
    {
      icon: Globe,
      label: "Forwarder Addresses",
      description:
        "All deposit forwarder addresses created for this project across all chains",
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast cursor-pointer"
            title="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-heading font-display text-text-primary">
            Export Project
          </h1>
        </div>
        <p className="text-caption text-text-muted mt-0.5 font-display pl-9">
          Download a complete snapshot of your project for independent operation
        </p>
      </div>

      {/* Warning banner */}
      <div className="mb-6 p-4 bg-status-warning/10 border border-status-warning/20 rounded-card flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-body font-display font-semibold text-text-primary mb-1">
            Seed phrase not included
          </div>
          <div className="text-caption text-text-secondary font-display">
            This export contains all the information needed to interact with your
            contracts independently. Your seed phrase is NOT included — you
            should already have it from the initial setup. If you have lost your
            seed phrase, contact support immediately.
          </div>
        </div>
      </div>

      {/* What's included */}
      <div className="bg-surface-card border border-border-default rounded-card shadow-card p-6 mb-6">
        <h2 className="text-body font-display font-semibold text-text-primary mb-4">
          What is included in the export
        </h2>
        <div className="space-y-4">
          {includedItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-accent-subtle rounded-card flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-accent-primary" />
                </div>
                <div>
                  <div className="text-caption font-display font-semibold text-text-primary">
                    {item.label}
                  </div>
                  <div className="text-micro text-text-muted font-display">
                    {item.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 bg-status-error-subtle border border-status-error/20 rounded-card">
          <div className="text-caption text-status-error font-display">
            {error}
          </div>
        </div>
      )}

      {/* Success display */}
      {success && (
        <div className="mb-6 p-4 bg-status-success/10 border border-status-success/20 rounded-card flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-status-success flex-shrink-0" />
          <div className="text-caption text-status-success font-display font-semibold">
            Export downloaded successfully. Store the file securely.
          </div>
        </div>
      )}

      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-button bg-accent-primary text-accent-text font-display font-semibold text-body hover:bg-accent-hover transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating export...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Export Project
            </>
          )}
        </button>
      </div>
    </div>
  );
}
