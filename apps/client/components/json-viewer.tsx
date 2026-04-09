"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
  className?: string;
}

/**
 * Forensic terminal style JSON viewer.
 * Syntax highlighting per identity spec:
 *   Gold (#E2A828) for keys
 *   Green (#2EBD85) for strings
 *   Blue (#60A5FA) for numbers
 *   Amber (#F5A623) for booleans
 *   text-muted for null / punctuation
 */
function syntaxHighlight(json: string): string {
  // Escape HTML entities first to prevent XSS via dangerouslySetInnerHTML
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          return `<span style="color:#E2A828">${match}</span>`;
        }
        return `<span style="color:#2EBD85">${match}</span>`;
      }
      if (/true|false/.test(match)) {
        return `<span style="color:#F5A623">${match}</span>`;
      }
      if (/null/.test(match)) {
        return `<span style="color:var(--text-muted)">${match}</span>`;
      }
      return `<span style="color:#60A5FA">${match}</span>`;
    }
  );
}

export function JsonViewer({ data, maxHeight = "400px", className }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);
  const highlighted = useMemo(() => syntaxHighlight(jsonString), [jsonString]);
  const lines = useMemo(() => jsonString.split("\n"), [jsonString]);
  const highlightedLines = useMemo(() => highlighted.split("\n"), [highlighted]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative group", className)}>
      {/* Copy button floating top-right */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 bg-surface-elevated border border-border-default rounded-input px-2 py-1.5 font-display text-[10px] font-semibold transition-all duration-fast cursor-pointer",
            copied
              ? "border-status-success text-status-success"
              : "text-text-muted hover:text-text-primary hover:border-text-secondary"
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
              Copy
            </>
          )}
        </button>
      </div>

      <div
        className="bg-surface-page border border-border-subtle rounded-card overflow-auto"
        style={{ maxHeight }}
      >
        <div className="flex">
          {/* Line numbers */}
          <div className="flex-shrink-0 py-4 pl-3 pr-2 select-none border-r border-border-subtle">
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

          {/* Code content */}
          <div className="flex-1 p-4 overflow-x-auto">
            <pre className="font-mono text-code leading-[1.6]">
              {highlightedLines.map((line, i) => (
                <div
                  key={i}
                  dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                />
              ))}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
