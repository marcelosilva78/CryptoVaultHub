"use client";

import { useState, useRef, useEffect } from "react";
import { Eye, ChevronDown, Search } from "lucide-react";
import { useImpersonation } from "@/lib/impersonation-context";
import { adminFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ClientOption {
  clientUid: string;
  clientName: string;
}

export function ImpersonationDropdown() {
  const { isImpersonating, target, startImpersonation, stopImpersonation } =
    useImpersonation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  /* Fetch clients list */
  useEffect(() => {
    adminFetch<any>("/clients")
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.clients ?? data?.data ?? [];
        setClients(
          list.map((c: any) => ({
            clientUid: c.slug || `cli_${c.id}`,
            clientName: c.name || `Client ${c.id}`,
          })),
        );
      })
      .catch(() => {});
  }, []);

  /* Close on outside click */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = clients.filter((c) =>
    c.clientName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-button text-caption font-semibold transition-all duration-fast font-display",
          isImpersonating
            ? "bg-status-warning-subtle text-status-warning border border-status-warning"
            : "text-text-muted hover:text-text-primary hover:bg-surface-hover border border-transparent",
        )}
        title="Impersonate client"
      >
        <Eye className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">
          {isImpersonating ? target?.clientName : "Impersonate"}
        </span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[260px] bg-surface-card border border-border-default rounded-card shadow-elevated z-50 overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
            <Search className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-caption text-text-primary placeholder:text-text-muted focus:outline-none font-display"
              autoFocus
            />
          </div>

          {/* Client list */}
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-caption text-text-muted text-center font-display">
                No clients found
              </div>
            )}
            {filtered.map((client) => {
              const isActive =
                isImpersonating && target?.clientUid === client.clientUid;
              return (
                <button
                  key={client.clientUid}
                  onClick={() => {
                    if (isActive) {
                      stopImpersonation();
                    } else {
                      startImpersonation(client);
                    }
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-caption font-display transition-colors duration-fast",
                    isActive
                      ? "bg-status-warning-subtle text-status-warning"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  <span className="flex-1 truncate">{client.clientName}</span>
                  <span className="font-mono text-micro text-text-muted">
                    {client.clientUid}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Stop button if impersonating */}
          {isImpersonating && (
            <div className="border-t border-border-subtle px-3 py-2">
              <button
                onClick={() => {
                  stopImpersonation();
                  setOpen(false);
                }}
                className="w-full text-center text-caption font-semibold text-status-error hover:bg-status-error-subtle rounded-button py-1.5 transition-colors duration-fast font-display"
              >
                Stop Impersonating
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
