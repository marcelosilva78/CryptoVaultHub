"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  className?: string;
  maxHeight?: string;
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-orange"; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "text-blue"; // key
        } else {
          cls = "text-green"; // string
        }
      } else if (/true|false/.test(match)) {
        cls = "text-purple"; // boolean
      } else if (/null/.test(match)) {
        cls = "text-red"; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function JsonViewer({ data, className, maxHeight = "400px" }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);
  const highlighted = syntaxHighlight(jsonString);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative group", className)}>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 bg-bg-elevated border border-border rounded-[var(--radius)] p-1.5 text-text-muted hover:text-text-primary hover:border-text-secondary transition-all opacity-0 group-hover:opacity-100"
        title="Copy JSON"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <div
        className="bg-bg-primary border border-border-subtle rounded-[var(--radius)] overflow-auto font-mono text-[11px] leading-[1.6] p-4"
        style={{ maxHeight }}
      >
        <pre
          className="whitespace-pre"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </div>
    </div>
  );
}
