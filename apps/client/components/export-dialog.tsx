"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, FileSpreadsheet, FileJson, FileText, Download } from "lucide-react";

type ExportFormat = "csv" | "xlsx" | "json";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
  filterSummary?: string[];
  title?: string;
  loading?: boolean;
}

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "csv", label: "CSV",
    description: "Comma-separated values. Compatible with Excel, Google Sheets, and most data tools.",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    value: "xlsx", label: "XLSX",
    description: "Microsoft Excel format with styled headers and auto-width columns.",
    icon: <FileSpreadsheet className="w-5 h-5" />,
  },
  {
    value: "json", label: "JSON",
    description: "Structured JSON array. Ideal for API integrations and programmatic processing.",
    icon: <FileJson className="w-5 h-5" />,
  },
];

export function ExportDialog({
  open, onClose, onExport, filterSummary = [],
  title = "Export Data", loading = false,
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 pb-0">
          <div className="flex items-center gap-2">
            <Download className="w-4.5 h-4.5 text-accent-primary" />
            <h3 className="font-display text-subheading text-text-primary">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast">
            <X className="w-4 h-4" />
          </button>
        </div>
        {filterSummary.length > 0 && (
          <div className="px-5 pt-3">
            <p className="text-caption text-text-muted font-display mb-1.5">Applied filters:</p>
            <div className="flex flex-wrap gap-1.5">
              {filterSummary.map((filter, i) => (
                <span key={i} className="px-2 py-0.5 bg-surface-elevated rounded-badge text-caption text-text-secondary font-display">{filter}</span>
              ))}
            </div>
          </div>
        )}
        <div className="px-5 pt-4 pb-2">
          <p className="text-caption text-text-muted font-display mb-2">Select format:</p>
          <div className="space-y-2">
            {FORMAT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-card border cursor-pointer transition-all duration-fast",
                  selectedFormat === option.value
                    ? "border-accent-primary bg-accent-subtle/10"
                    : "border-border-subtle hover:border-text-muted hover:bg-surface-hover",
                )}
              >
                <input type="radio" name="exportFormat" value={option.value}
                  checked={selectedFormat === option.value}
                  onChange={() => setSelectedFormat(option.value)} className="sr-only" />
                <div className={cn("flex-shrink-0 mt-0.5", selectedFormat === option.value ? "text-accent-primary" : "text-text-muted")}>
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-body font-semibold text-text-primary">{option.label}</span>
                    {selectedFormat === option.value && <span className="w-1.5 h-1.5 rounded-pill bg-accent-primary" />}
                  </div>
                  <p className="text-caption text-text-muted mt-0.5 leading-relaxed">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle mt-2">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast"
          >Cancel</button>
          <button onClick={() => onExport(selectedFormat)} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-all duration-fast disabled:opacity-50"
          >
            {loading ? (
              <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Exporting...</>
            ) : (
              <><Download className="w-3.5 h-3.5" />Export as {selectedFormat.toUpperCase()}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
