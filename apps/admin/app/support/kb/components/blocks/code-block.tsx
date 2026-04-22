"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CodeBlock({
  language,
  code,
  filename,
}: {
  language: string;
  code: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-4 rounded-card overflow-hidden border border-border-subtle">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-elevated border-b border-border-subtle">
        <span className="text-caption text-text-muted font-mono">
          {filename ?? language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-caption text-text-muted hover:text-text-primary transition-colors duration-fast"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-status-success" />
              <span className="text-status-success">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 bg-surface-card overflow-x-auto">
        <code className="text-code text-text-primary font-mono whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}
