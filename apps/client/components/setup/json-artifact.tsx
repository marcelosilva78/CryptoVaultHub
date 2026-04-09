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

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "text-blue-400"; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "text-cyan-400"; // key
          match = match.replace(/:$/, "");
          return `<span class="${cls}">${match}</span>:`;
        } else {
          cls = "text-green-400"; // string
        }
      } else if (/true|false/.test(match)) {
        cls = "text-purple-400"; // boolean
      } else if (/null/.test(match)) {
        cls = "text-gray-500"; // null
      }
      return `<span class="${cls}">${match}</span>`;
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
        "border border-cvh-border-subtle rounded-cvh-lg overflow-hidden transition-all duration-300",
        expanded ? "bg-cvh-bg-secondary" : "bg-cvh-bg-tertiary",
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-cvh-bg-hover group"
      >
        {/* Expand icon */}
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
            "text-cvh-text-muted transition-transform duration-200",
            expanded && "rotate-90"
          )}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        {icon && <span className="text-cvh-accent">{icon}</span>}

        <span className="text-[12px] font-semibold text-cvh-text-primary flex-1">
          {title}
        </span>

        <span className="text-[10px] text-cvh-text-muted font-mono">
          {lines.length} lines
        </span>
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-cvh-border-subtle animate-fade-up">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-cvh-bg-tertiary border-b border-cvh-border-subtle">
            <button
              onClick={handleCopy}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all",
                copied
                  ? "bg-cvh-green/10 text-cvh-green"
                  : "bg-cvh-bg-elevated text-cvh-text-secondary hover:text-cvh-text-primary"
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
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-cvh-bg-elevated text-cvh-text-secondary hover:text-cvh-text-primary transition-all"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </button>
          </div>

          {/* JSON Display */}
          <div
            className="overflow-auto font-mono text-[11px] leading-[1.6]"
            style={{ maxHeight }}
          >
            <table className="w-full border-collapse">
              <tbody>
                {highlightedLines.map((line, i) => (
                  <tr key={i} className="hover:bg-cvh-bg-hover/50">
                    <td className="px-3 py-0 text-right text-cvh-text-muted/40 select-none w-[40px] text-[10px]">
                      {i + 1}
                    </td>
                    <td className="px-3 py-0 whitespace-pre">
                      <span dangerouslySetInnerHTML={{ __html: line }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
