"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useImpersonation, ImpersonationMode } from "@/lib/impersonation-context";
import { Eye, ChevronDown, Users, Search } from "lucide-react";

interface Client {
  id: number;
  name: string;
  slug: string;
  status: string;
}

const MODE_OPTIONS: {
  value: ImpersonationMode;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    value: "read_only",
    label: "Read Only",
    description: "View data without making changes",
    color: "text-[#E2A828]",
  },
  {
    value: "support",
    label: "Support",
    description: "View and create data",
    color: "text-[#F5A623]",
  },
  {
    value: "full_operational",
    label: "Full Operational",
    description: "Full access (use with caution)",
    color: "text-[#F6465D]",
  },
];

// Mock client data -- will be replaced with API call
const MOCK_CLIENTS: Client[] = [
  { id: 1, name: "Acme Exchange", slug: "acme-exchange", status: "active" },
  { id: 2, name: "BlockPay Inc", slug: "blockpay", status: "active" },
  { id: 3, name: "CryptoGate", slug: "cryptogate", status: "active" },
  { id: 4, name: "DeFi Bridge", slug: "defi-bridge", status: "onboarding" },
];

export function ImpersonationDropdown() {
  const { isImpersonating, startImpersonation } = useImpersonation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"client" | "mode">("client");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        resetState();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const resetState = () => {
    setStep("client");
    setSelectedClient(null);
    setSearchQuery("");
  };

  const handleToggle = () => {
    if (open) {
      resetState();
    }
    setOpen((p) => !p);
  };

  const handleClientSelect = (client: Client) => {
    setSelectedClient(client);
    setStep("mode");
  };

  const handleModeSelect = async (mode: ImpersonationMode) => {
    if (!selectedClient) return;

    setLoading(true);
    try {
      await startImpersonation({
        targetClientId: selectedClient.id,
        targetClientName: selectedClient.name,
        mode,
      });
      setOpen(false);
      resetState();
    } catch (error) {
      console.error("Failed to start impersonation:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = MOCK_CLIENTS.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isImpersonating) return null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-button text-text-muted hover:text-accent-primary hover:bg-surface-hover transition-all duration-fast font-display text-caption",
          open && "text-accent-primary bg-surface-hover",
        )}
        title="Impersonate client"
      >
        <Eye className="w-3.5 h-3.5" />
        <span className="hidden lg:inline font-semibold">Impersonate</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform duration-fast",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[320px] bg-surface-card border border-border-subtle rounded-card shadow-float z-[150] overflow-hidden animate-fade-in">
          {/* Step 1: Select client */}
          {step === "client" && (
            <>
              <div className="px-3 py-2.5 border-b border-border-subtle">
                <div className="flex items-center gap-2 text-caption text-text-muted font-display font-semibold">
                  <Users className="w-3.5 h-3.5" />
                  Select Client
                </div>
              </div>

              {/* Search */}
              <div className="px-3 py-2 border-b border-border-subtle">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-surface-input rounded-input border border-border-subtle">
                  <Search className="w-3 h-3 text-text-muted flex-shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search clients..."
                    className="flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
                    autoFocus
                  />
                </div>
              </div>

              {/* Client list */}
              <div className="max-h-[240px] overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <div className="px-3 py-6 text-center text-caption text-text-muted">
                    No clients found
                  </div>
                ) : (
                  filteredClients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => handleClientSelect(client)}
                      className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-surface-hover transition-colors duration-fast text-left"
                    >
                      <div>
                        <div className="text-body text-text-primary font-display font-semibold">
                          {client.name}
                        </div>
                        <div className="text-caption text-text-muted font-mono">
                          {client.slug}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-micro font-display font-semibold px-1.5 py-0.5 rounded-badge",
                          client.status === "active"
                            ? "text-[#2EBD85] bg-[#2EBD85]/10"
                            : "text-[#E2A828] bg-[#E2A828]/10",
                        )}
                      >
                        {client.status}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* Step 2: Select mode */}
          {step === "mode" && selectedClient && (
            <>
              <div className="px-3 py-2.5 border-b border-border-subtle">
                <div className="flex items-center justify-between">
                  <div className="text-caption text-text-muted font-display font-semibold">
                    Select Mode
                  </div>
                  <button
                    onClick={() => setStep("client")}
                    className="text-caption text-accent-primary font-display font-semibold hover:underline"
                  >
                    Back
                  </button>
                </div>
                <div className="text-body text-text-primary font-display font-semibold mt-1">
                  {selectedClient.name}
                </div>
              </div>

              <div className="p-2">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleModeSelect(option.value)}
                    disabled={loading}
                    className="w-full px-3 py-2.5 rounded-card hover:bg-surface-hover transition-colors duration-fast text-left disabled:opacity-50"
                  >
                    <div className={cn("text-body font-display font-semibold", option.color)}>
                      {option.label}
                    </div>
                    <div className="text-caption text-text-muted mt-0.5">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>

              {loading && (
                <div className="px-3 py-2 text-center text-caption text-text-muted border-t border-border-subtle">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                    Starting session...
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
