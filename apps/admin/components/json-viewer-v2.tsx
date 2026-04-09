"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check, Download, ChevronRight, ChevronDown, Search, X } from "lucide-react";

interface JsonViewerV2Props {
  data: unknown;
  title?: string;
  maxHeight?: string;
  showDownload?: boolean;
  showSearch?: boolean;
  collapsedDepth?: number;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/* ── Color tokens ── */
const COLORS = {
  key: "#E2A828",
  string: "#2EBD85",
  number: "#60A5FA",
  boolean: "#F5A623",
  null: "#4E5364",
  punctuation: "#4E5364",
};

/* ── Copy feedback hook ── */
function useCopyFeedback(duration = 1500) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const copy = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), duration);
    },
    [duration],
  );

  return { copied, copy };
}

/* ── Recursive JSON Node ── */
function JsonNode({
  keyName,
  value,
  depth,
  collapsedDepth,
  path,
  searchTerm,
  onHoverPath,
}: {
  keyName: string | null;
  value: unknown;
  depth: number;
  collapsedDepth: number;
  path: string;
  searchTerm: string;
  onHoverPath: (p: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < collapsedDepth);
  const { copied, copy } = useCopyFeedback();

  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;

  // Highlight matching search terms
  const matchesSearch = searchTerm
    ? JSON.stringify(value).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (keyName && keyName.toLowerCase().includes(searchTerm.toLowerCase()))
    : false;

  const renderValue = () => {
    if (value === null) {
      return <span style={{ color: COLORS.null, fontStyle: "italic" }}>null</span>;
    }
    if (typeof value === "string") {
      return (
        <span style={{ color: COLORS.string }}>
          &quot;{value}&quot;
        </span>
      );
    }
    if (typeof value === "number") {
      return <span style={{ color: COLORS.number }}>{value}</span>;
    }
    if (typeof value === "boolean") {
      return <span style={{ color: COLORS.boolean }}>{String(value)}</span>;
    }
    return null;
  };

  const handleCopyValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
    copy(text);
  };

  const indent = depth * 16;

  if (!isExpandable) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 group/node py-[1px] hover:bg-surface-hover rounded-sm transition-colors duration-fast cursor-pointer",
          matchesSearch && searchTerm && "bg-accent-subtle/20",
        )}
        style={{ paddingLeft: `${indent + 20}px` }}
        onMouseEnter={() => onHoverPath(path)}
        onClick={handleCopyValue}
        title="Click to copy value"
      >
        {keyName !== null && (
          <>
            <span style={{ color: COLORS.key }} className="font-mono text-code">
              &quot;{keyName}&quot;
            </span>
            <span style={{ color: COLORS.punctuation }} className="font-mono text-code">
              :&nbsp;
            </span>
          </>
        )}
        {renderValue()}
        {copied && (
          <Check className="w-3 h-3 text-status-success ml-1 flex-shrink-0" />
        )}
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <div
      className={cn(matchesSearch && searchTerm && "bg-accent-subtle/10 rounded-sm")}
      onMouseEnter={() => onHoverPath(path)}
    >
      <div
        className="flex items-center gap-1 py-[1px] hover:bg-surface-hover rounded-sm transition-colors duration-fast cursor-pointer select-none"
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => setExpanded((p) => !p)}
      >
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-text-muted">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        {keyName !== null && (
          <>
            <span style={{ color: COLORS.key }} className="font-mono text-code">
              &quot;{keyName}&quot;
            </span>
            <span style={{ color: COLORS.punctuation }} className="font-mono text-code">
              :&nbsp;
            </span>
          </>
        )}
        <span style={{ color: COLORS.punctuation }} className="font-mono text-code">
          {bracketOpen}
        </span>
        {!expanded && (
          <>
            <span className="text-text-muted font-mono text-code mx-0.5">
              {entries.length} {isArray ? "items" : "keys"}
            </span>
            <span style={{ color: COLORS.punctuation }} className="font-mono text-code">
              {bracketClose}
            </span>
          </>
        )}
      </div>

      {expanded && (
        <>
          {entries.map(([k, v], i) => (
            <JsonNode
              key={k}
              keyName={isArray ? null : k}
              value={v}
              depth={depth + 1}
              collapsedDepth={collapsedDepth}
              path={path ? `${path}.${k}` : k}
              searchTerm={searchTerm}
              onHoverPath={onHoverPath}
            />
          ))}
          <div
            style={{ paddingLeft: `${indent + 20}px` }}
            className="font-mono text-code py-[1px]"
          >
            <span style={{ color: COLORS.punctuation }}>{bracketClose}</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main JsonViewerV2 ── */
export function JsonViewerV2({
  data,
  title,
  maxHeight = "400px",
  showDownload = false,
  showSearch = false,
  collapsedDepth = 2,
}: JsonViewerV2Props) {
  const { copied, copy } = useCopyFeedback();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [hoveredPath, setHoveredPath] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const jsonString = useMemo(() => JSON.stringify(data, null, 2), [data]);

  // Handle Ctrl+F
  useEffect(() => {
    if (!showSearch) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchTerm("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearch]);

  const handleCopyAll = () => copy(jsonString);

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "data"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Count lines for line numbers
  const lines = useMemo(() => jsonString.split("\n"), [jsonString]);

  return (
    <div className="relative group">
      {/* Title bar */}
      {(title || showDownload || showSearch) && (
        <div className="flex items-center justify-between px-3 py-2 bg-surface-card border border-border-subtle rounded-t-card">
          <div className="flex items-center gap-2">
            {title && (
              <span className="font-display text-caption font-semibold text-text-secondary">
                {title}
              </span>
            )}
            {/* Breadcrumb path */}
            {hoveredPath && (
              <span className="font-mono text-[10px] text-text-muted truncate max-w-[300px]">
                {hoveredPath}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {showSearch && (
              <button
                onClick={() => {
                  setSearchOpen((p) => !p);
                  if (!searchOpen) {
                    setTimeout(() => searchRef.current?.focus(), 50);
                  } else {
                    setSearchTerm("");
                  }
                }}
                className="p-1.5 rounded-input text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
                title="Search (Ctrl+F)"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
            {showDownload && (
              <button
                onClick={handleDownload}
                className="p-1.5 rounded-input text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
                title="Download JSON"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleCopyAll}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-input text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast font-display text-micro",
                copied && "text-status-success",
              )}
              title="Copy all"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated border-x border-border-subtle">
          <Search className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search in JSON..."
            className="flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted font-mono"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="p-0.5 rounded text-text-muted hover:text-text-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* JSON tree */}
      <div
        className={cn(
          "bg-surface-page border border-border-subtle overflow-auto",
          title || showDownload || showSearch ? "rounded-b-card border-t-0" : "rounded-card",
        )}
        style={{ maxHeight, fontFamily: "'JetBrains Mono', monospace" }}
      >
        <div className="flex">
          {/* Line numbers gutter */}
          <div className="flex-shrink-0 py-3 pl-2 pr-1 select-none border-r border-border-subtle min-w-[36px]">
            {lines.map((_, i) => (
              <div
                key={i}
                className="text-[10px] leading-[20px] text-right pr-1"
                style={{ color: COLORS.null }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Tree content */}
          <div className="flex-1 py-2 px-1 overflow-x-auto">
            <JsonNode
              keyName={null}
              value={data}
              depth={0}
              collapsedDepth={collapsedDepth}
              path=""
              searchTerm={searchTerm}
              onHoverPath={setHoveredPath}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
