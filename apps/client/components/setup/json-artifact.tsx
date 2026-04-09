"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface JsonArtifactProps {
  title: string;
  data: unknown;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  maxHeight?: number;
  filename?: string;
  className?: string;
}

/**
 * JSON Artifact:
 * - Same syntax highlighting as admin (gold keys, green strings, blue numbers, amber booleans)
 * - Collapsible with smooth height animation
 * - Line numbers in text-muted
 * - Copy JSON + Download as .json buttons
 * - Title header: Outfit 600, with document icon
 */
function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      // Key (string followed by colon)
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          return `<span style="color:#E2A828">${match}</span>`;
        }
        // String value
        return `<span style="color:#2EBD85">${match}</span>`;
      }
      // Boolean
      if (/true|false/.test(match)) {
        return `<span style="color:#F5A623">${match}</span>`;
      }
      // Null
      if (/null/.test(match)) {
        return `<span style="color:var(--text-muted)">${match}</span>`;
      }
      // Number
      return `<span style="color:#60A5FA">${match}</span>`;
    }
  );
}

export function JsonArtifact({
  title,
  data,
  icon,
  defaultExpanded = false,
  maxHeight = 400,
  filename,
  className,
}: JsonArtifactProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const jsonStr = useMemo(
    () => JSON.stringify(data, null, 2),
    [data]
  );

  const highlighted = useMemo(() => syntaxHighlight(jsonStr), [jsonStr]);

  const lines = useMemo(() => jsonStr.split("\n"), [jsonStr]);
  const highlightedLines = useMemo(
    () => highlighted.split("\n"),
    [highlighted]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `${title.toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={cn(
        "border border-border-default rounded-card overflow-hidden transition-all duration-normal",
        expanded ? "bg-surface-card" : "bg-surface-elevated",
        className
      )}
    >
      {/* Header -- Outfit 600, with document icon */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer transition-colors duration-fast hover:bg-surface-hover group"
      >
        {/* Expand chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "text-text-muted transition-transform duration-normal flex-shrink-0",
            expanded && "rotate-90"
          )}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        {/* Document icon */}
        {icon ? (
          <span className="text-accent-primary flex-shrink-0">{icon}</span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary flex-shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}

        <span className="text-[12px] font-display font-semibold text-text-primary flex-1">
          {title}
        </span>

        <span className="text-[10px] text-text-muted font-mono">
          {lines.length} lines
        </span>
      </button>

      {/* Content -- smooth reveal */}
      {expanded && (
        <div className="border-t border-border-subtle animate-fade-in">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-elevated border-b border-border-subtle">
            <button
              onClick={handleCopy}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-input text-[10px] font-display font-semibold transition-all duration-fast cursor-pointer",
                copied
                  ? "bg-status-success-subtle text-status-success"
                  : "bg-surface-card text-text-secondary hover:text-text-primary border border-border-default"
              )}
            >
              {copied ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy JSON
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-input text-[10px] font-display font-semibold bg-surface-card text-text-secondary hover:text-text-primary transition-all duration-fast cursor-pointer border border-border-default"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download .json
            </button>
          </div>

          {/* JSON Display with line numbers */}
          <div
            className="bg-surface-page overflow-auto"
            style={{ maxHeight }}
          >
            <div className="flex">
              {/* Line numbers */}
              <div className="flex-shrink-0 py-3 pl-3 pr-2 select-none border-r border-border-subtle">
                {lines.map((_, i) => (
                  <div
                    key={i}
                    className="text-text-muted font-mono text-[10px] leading-[1.6] text-right pr-1"
                    style={{ minWidth: "24px" }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Code */}
              <div className="flex-1 p-3 overflow-x-auto">
                <pre className="font-mono text-code leading-[1.6]">
                  {highlightedLines.map((line, i) => (
                    <div
                      key={i}
                      className="hover:bg-surface-hover/30"
                      dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                    />
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
