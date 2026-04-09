"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check, Download } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  className?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
  showDownload?: boolean;
}

/**
 * Syntax highlighting with identity-spec colors:
 * - Gold (#E2A828) for keys
 * - Green (#2EBD85) for strings
 * - Blue (#60A5FA) for numbers
 * - Amber (#F5A623) for booleans
 * - text-muted for null and punctuation
 */
function syntaxHighlight(json: string): string {
  // Escape HTML entities first to prevent XSS via dangerouslySetInnerHTML
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // First, wrap punctuation (braces, brackets, colons, commas) in muted spans
  let result = json.replace(
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

  return result;
}

export function JsonViewer({
  data,
  className,
  maxHeight = "400px",
  showLineNumbers = true,
  showDownload = false,
}: JsonViewerProps) {
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

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("relative group", className)}>
      {/* Action buttons - float top-right */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
        {showDownload && (
          <button
            onClick={handleDownload}
            className="bg-surface-elevated border border-border-default rounded-input p-1.5 text-text-muted hover:text-text-primary hover:border-text-secondary transition-all duration-fast"
            title="Download JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 bg-surface-elevated border border-border-default rounded-input px-2 py-1.5 text-text-muted hover:text-text-primary hover:border-text-secondary transition-all duration-fast font-display text-micro",
            copied && "border-status-success text-status-success"
          )}
          title="Copy JSON"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              <span className="font-display text-[10px] font-semibold">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="font-display text-[10px] font-semibold">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* JSON content */}
      <div
        className="bg-surface-page border border-border-subtle rounded-card overflow-auto"
        style={{ maxHeight }}
      >
        <div className="flex">
          {/* Line numbers */}
          {showLineNumbers && (
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
          )}

          {/* Code */}
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
