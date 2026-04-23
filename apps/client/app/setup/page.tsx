"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { StepIndicator } from "@/components/setup/step-indicator";
import { QRCodeDisplay } from "@/components/setup/qr-code-display";
import {
  ContractDeploymentStatus,
  type DeploymentStep,
} from "@/components/setup/contract-deployment-status";
import { clientFetch } from "@/lib/api";
import { useClientAuth } from "@/lib/auth-context";
import {
  Loader2,
  Wallet,
  Shield,
  Key,
  Rocket,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Lock,
  Users,
  Crown,
  Eye,
  EyeOff,
  Fuel,
} from "lucide-react";
import { ethers } from "ethers";

// ─── Types ──────────────────────────────────────────────────────

interface AvailableChain {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  explorerUrl: string;
  isActive: boolean;
  rpcConfigured: boolean;
  activeNodeCount: number;
}

type CustodyMode = "full_custody" | "co_sign" | "client_only";

interface KeyCeremonyResult {
  mnemonic: string[];
  publicKeys: Array<{
    keyType: string;
    publicKey: string;
    address?: string;
  }>;
}

interface GasCheckChain {
  chainId: number;
  chainName: string;
  gasTankAddress: string;
  balanceFormatted: string;
  requiredFormatted: string;
  sufficient: boolean;
}

interface DeployStatusChain {
  chainId: number;
  status: string;
  deployStartedAt?: string | null;
  deployCompletedAt?: string | null;
  deployError?: string | null;
  contracts?: Record<string, string | null>;
}

// ─── Constants ──────────────────────────────────────────────────

const CHAIN_UI_META: Record<number, { icon: string; gasEstimateLabel: string }> = {
  1:     { icon: "\u039E", gasEstimateLabel: "~0.05 ETH ($162)" },
  56:    { icon: "\u25C6", gasEstimateLabel: "~0.02 BNB ($12)" },
  137:   { icon: "\u2B21", gasEstimateLabel: "~5.0 POL ($4.50)" },
  42161: { icon: "\u25B2", gasEstimateLabel: "~0.001 ETH ($3.24)" },
  10:    { icon: "\u2B24", gasEstimateLabel: "~0.001 ETH ($3.24)" },
  43114: { icon: "\u25B3", gasEstimateLabel: "~0.1 AVAX ($3.50)" },
  8453:  { icon: "B",      gasEstimateLabel: "~0.0005 ETH ($1.62)" },
};

const CUSTODY_OPTIONS: {
  id: CustodyMode;
  title: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    id: "full_custody",
    title: "Full Custody",
    description:
      "CryptoVaultHub operates automatically. Best for payment gateways wanting full automation.",
    icon: Crown,
  },
  {
    id: "co_sign",
    title: "Co-Sign",
    description:
      "Both parties must sign. Best for exchanges wanting co-custody security.",
    icon: Users,
  },
  {
    id: "client_only",
    title: "Client Only",
    description:
      "You control everything. Best for full sovereignty over your funds.",
    icon: Lock,
  },
];

const STEP_LABELS = [
  "Project",
  "Chains",
  "Custody",
  "Keys",
  "Gas",
  "Deploy",
  "Complete",
];

// ─── Component ──────────────────────────────────────────────────

export default function SetupWizardPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useClientAuth();

  // Step state
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 - Project Details
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  // Step 2 - Chain Selection
  const [availableChains, setAvailableChains] = useState<AvailableChain[]>([]);
  const [chainsLoading, setChainsLoading] = useState(true);
  const [selectedChains, setSelectedChains] = useState<number[]>([]);

  // Step 3 - Custody Mode
  const [custodyMode, setCustodyMode] = useState<CustodyMode>("full_custody");

  // Step 4 - Key Ceremony
  const [projectId, setProjectId] = useState<string | null>(null);
  const [keyCeremony, setKeyCeremony] = useState<KeyCeremonyResult | null>(null);
  const [keyCeremonyLoading, setKeyCeremonyLoading] = useState(false);
  const [keyCeremonyError, setKeyCeremonyError] = useState<string | null>(null);
  const [mnemonicAcknowledged, setMnemonicAcknowledged] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  // Step 5 - Gas Deposit
  const [gasChains, setGasChains] = useState<GasCheckChain[]>([]);
  const [gasLoading, setGasLoading] = useState(false);
  const [gasError, setGasError] = useState<string | null>(null);
  const gasPollingRef = useRef<NodeJS.Timeout | null>(null);
  const [gasTankKeys, setGasTankKeys] = useState<Record<number, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});

  // Step 6 - Contract Deployment
  const [deployChains, setDeployChains] = useState<DeployStatusChain[]>([]);
  const [deployStarted, setDeployStarted] = useState(false);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const deployPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Step 7 - Complete (use deployChains for summary)

  // ─── API Calls ──────────────────────────────────────────────

  // Steps 1-3: Create project + initialize keys
  const createProjectAndKeys = useCallback(async () => {
    setKeyCeremonyLoading(true);
    setKeyCeremonyError(null);

    try {
      // selectedChains is already number[] of chain IDs
      const numericChainIds = selectedChains;

      // Create project (skip if already created on a previous attempt)
      let currentProjectId = projectId;
      if (!currentProjectId) {
        const projectRes = await clientFetch<{ project?: { id: number }; id?: number }>("/v1/projects/setup", {
          method: "POST",
          body: JSON.stringify({
            name: projectName,
            description: projectDescription,
            chains: numericChainIds,
            custodyMode,
          }),
        });

        const newProjectId = projectRes.project?.id ?? projectRes.id;
        if (!newProjectId) throw new Error("No project ID returned");
        currentProjectId = String(newProjectId);
        setProjectId(currentProjectId);
      }

      // Initialize keys (pass chains so backend creates gas tank wallets)
      const keysRes = await clientFetch<{
        mnemonic: string[] | string;
        publicKeys: Array<{ keyType: string; publicKey: string; address?: string }>;
        gasTanks?: Array<{ chainId: number; address: string }>;
      }>(`/v1/projects/${currentProjectId}/keys`, {
        method: "POST",
        body: JSON.stringify({ chains: numericChainIds }),
      });

      const mnemonic = Array.isArray(keysRes.mnemonic)
        ? keysRes.mnemonic
        : keysRes.mnemonic.split(" ");

      // Derive gas tank private keys client-side from the mnemonic
      // Path: m/44'/60'/1000'/{chainId}/0 (same as backend derivation)
      if (mnemonic.length >= 12 && !mnemonic[0].startsWith("(")) {
        try {
          const phrase = mnemonic.join(" ");
          const mnemonicObj = ethers.Mnemonic.fromPhrase(phrase);
          const seed = mnemonicObj.computeSeed();
          const masterNode = ethers.HDNodeWallet.fromSeed(seed);
          const derivedKeys: Record<number, string> = {};

          for (const chainId of numericChainIds) {
            const path = `m/44'/60'/1000'/${chainId}/0`;
            const child = masterNode.derivePath(path);
            derivedKeys[chainId] = child.privateKey;
          }

          setGasTankKeys(derivedKeys);
        } catch (err) {
          console.warn("Failed to derive gas tank keys client-side:", err);
        }
      }

      setKeyCeremony({
        mnemonic,
        publicKeys: keysRes.publicKeys,
      });
    } catch (err: any) {
      setKeyCeremonyError(err.message || "Failed to create project or initialize keys");
    } finally {
      setKeyCeremonyLoading(false);
    }
  }, [projectName, projectDescription, selectedChains, custodyMode, projectId]);

  // Step 5: Fetch gas check
  const fetchGasCheck = useCallback(async () => {
    if (!projectId) return;
    setGasLoading(true);
    setGasError(null);

    try {
      const res = await clientFetch<{ chains: GasCheckChain[] }>(
        `/v1/projects/${projectId}/gas-check`,
        { cache: 'no-store' }
      );
      setGasChains(res.chains || []);
    } catch (err: any) {
      setGasError(err.message || "Failed to fetch gas balances");
    } finally {
      setGasLoading(false);
    }
  }, [projectId]);

  // Step 6: Start deployment
  const startDeployment = useCallback(async () => {
    if (!projectId) return;
    setDeployLoading(true);
    setDeployError(null);

    try {
      await clientFetch(`/v1/projects/${projectId}/deploy`, {
        method: "POST",
      });
      setDeployStarted(true);
    } catch (err: any) {
      setDeployError(err.message || "Failed to start deployment");
    } finally {
      setDeployLoading(false);
    }
  }, [projectId]);

  // Step 6: Poll deploy status
  const fetchDeployStatus = useCallback(async () => {
    if (!projectId) return;

    try {
      const res = await clientFetch<{ chains: DeployStatusChain[] }>(
        `/v1/projects/${projectId}/deploy/status`
      );
      setDeployChains(res.chains || []);

      // Auto-advance if all chains are deployed/ready
      const allReady = (res.chains || []).every((c: DeployStatusChain) => c.status === "ready" || c.status === "deployed");
      if (allReady && (res.chains || []).length > 0) {
        setCurrentStep(7);
      }
    } catch {
      // Silently fail on poll - don't disrupt the UI
    }
  }, [projectId]);

  // ─── Fetch Available Chains on Mount ─────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await clientFetch<{ success: boolean; chains: AvailableChain[] }>("/v1/chains");
        if (!cancelled) {
          setAvailableChains(res.chains || []);
        }
      } catch (err) {
        console.error("Failed to fetch available chains:", err);
      } finally {
        if (!cancelled) setChainsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Step Transition Effects ────────────────────────────────

  // Step 4: Trigger key ceremony on entry
  const keyCeremonyTriggered = useRef(false);
  useEffect(() => {
    if (currentStep === 4 && !keyCeremony && !keyCeremonyLoading && !keyCeremonyTriggered.current) {
      keyCeremonyTriggered.current = true;
      createProjectAndKeys();
    }
  }, [currentStep, keyCeremony, keyCeremonyLoading, createProjectAndKeys]);

  // Step 5: Fetch gas check on entry + start polling
  useEffect(() => {
    if (currentStep === 5 && projectId) {
      fetchGasCheck();

      gasPollingRef.current = setInterval(fetchGasCheck, 15000);
      return () => {
        if (gasPollingRef.current) clearInterval(gasPollingRef.current);
      };
    }
    return () => {
      if (gasPollingRef.current) clearInterval(gasPollingRef.current);
    };
  }, [currentStep, projectId, fetchGasCheck]);

  // Step 6: Poll deploy status when deployment starts
  useEffect(() => {
    if (currentStep === 6 && deployStarted && projectId) {
      fetchDeployStatus();

      deployPollingRef.current = setInterval(fetchDeployStatus, 10000);
      return () => {
        if (deployPollingRef.current) clearInterval(deployPollingRef.current);
      };
    }
    return () => {
      if (deployPollingRef.current) clearInterval(deployPollingRef.current);
    };
  }, [currentStep, deployStarted, projectId, fetchDeployStatus]);

  // ─── Navigation ─────────────────────────────────────────────

  const nextStep = async () => {
    // Confirm seed when advancing from step 4 (Key Ceremony) to step 5
    if (currentStep === 4 && projectId && mnemonicAcknowledged) {
      try {
        await clientFetch(`/v1/projects/${projectId}/confirm-seed`, { method: "POST" });
      } catch {
        // Non-blocking — seed confirmation is an audit record
      }
      // Clear mnemonic from memory — it has been confirmed as saved
      setKeyCeremony((prev) =>
        prev ? { ...prev, mnemonic: [] } : null,
      );
    }
    // Clear gas tank private keys from memory when leaving step 5
    if (currentStep === 5) {
      setGasTankKeys({});
      setVisibleKeys({});
    }
    setCurrentStep((s) => Math.min(s + 1, 7));
  };
  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const toggleChain = (chainId: number) => {
    const chain = availableChains.find((c) => c.chainId === chainId);
    if (!chain?.rpcConfigured) return;
    setSelectedChains((prev) =>
      prev.includes(chainId)
        ? prev.filter((c) => c !== chainId)
        : [...prev, chainId]
    );
  };

  const allGasSufficient = gasChains.length > 0 && gasChains.every((c) => c.sufficient);
  const anyDeployFailed = deployChains.some((c) => c.status === "failed");

  // ─── Copy Mnemonic ──────────────────────────────────────────

  const copyMnemonic = useCallback(async () => {
    if (!keyCeremony) return;
    const text = keyCeremony.mnemonic.join(" ");
    await navigator.clipboard.writeText(text);
    setMnemonicCopied(true);
    setTimeout(() => setMnemonicCopied(false), 2000);
  }, [keyCeremony]);

  // ─── Loading Gate ───────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading...</span>
      </div>
    );
  }

  // ─── Render Steps ───────────────────────────────────────────

  const renderStep = () => {
    switch (currentStep) {
      // ========== STEP 1: Project Details ==========
      case 1:
        return (
          <div className="space-y-6">
            {/* Welcome */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <polygon
                    points="32,4 58,18 58,46 32,60 6,46 6,18"
                    fill="var(--accent-subtle)"
                    stroke="var(--accent-primary)"
                    strokeWidth="2"
                  />
                  <circle cx="32" cy="26" r="5" fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
                  <line x1="32" y1="31" x2="32" y2="44" stroke="var(--accent-primary)" strokeWidth="2" />
                  <line x1="32" y1="38" x2="36" y2="36" stroke="var(--accent-primary)" strokeWidth="2" />
                  <line x1="32" y1="42" x2="36" y2="40" stroke="var(--accent-primary)" strokeWidth="2" />
                </svg>
              </div>
              <h1 className="text-display font-display tracking-[-0.02em] mb-2">
                Create New Project
              </h1>
              <p className="text-body text-text-secondary max-w-[520px] mx-auto leading-relaxed font-display">
                Set up an isolated wallet infrastructure with smart contracts for
                automated deposit sweeping. Each project operates independently with
                its own keys and contracts.
              </p>
            </div>

            {/* Project Name */}
            <div>
              <label className="block text-micro font-display font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5">
                Project Name <span className="text-status-error">*</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Payment Gateway Production"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary font-display outline-none focus:border-border-focus transition-colors duration-fast"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-micro font-display font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5">
                Description <span className="text-text-muted">(optional)</span>
              </label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe the purpose of this project..."
                rows={3}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2.5 text-body text-text-primary font-display outline-none focus:border-border-focus transition-colors duration-fast resize-none"
              />
            </div>

            {/* Navigation */}
            <div className="flex justify-end pt-2">
              <NavButton
                onClick={nextStep}
                disabled={!projectName.trim()}
                direction="next"
              >
                Continue
              </NavButton>
            </div>
          </div>
        );

      // ========== STEP 2: Select Chains ==========
      case 2:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Select Blockchain Networks"
              subtitle="Choose the networks you want to deploy smart contracts on. Each chain will get its own set of contracts."
            />

            {chainsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                <span className="ml-2 text-text-muted font-display">Loading available chains...</span>
              </div>
            )}

            {!chainsLoading && availableChains.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <AlertTriangle className="w-6 h-6 text-status-warning" />
                <div className="text-body font-display font-semibold text-text-primary">No chains available</div>
                <div className="text-caption text-text-muted font-display text-center max-w-[400px]">
                  No blockchain networks have been configured yet. Please ask the administrator to add chains and RPC nodes.
                </div>
              </div>
            )}

            {!chainsLoading && availableChains.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {availableChains.map((chain) => {
                  const isSelected = selectedChains.includes(chain.chainId);
                  const meta = CHAIN_UI_META[chain.chainId];
                  const disabled = !chain.rpcConfigured;

                  return (
                    <button
                      key={chain.chainId}
                      onClick={() => toggleChain(chain.chainId)}
                      disabled={disabled}
                      title={disabled ? "No RPC nodes configured for this chain" : undefined}
                      className={cn(
                        "relative p-4 rounded-card border-2 text-left transition-all duration-fast group",
                        disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "cursor-pointer",
                        isSelected
                          ? "bg-accent-subtle border-accent-primary/30"
                          : !disabled
                            ? "bg-surface-elevated border-border-default hover:border-border-focus hover:bg-surface-hover"
                            : "bg-surface-elevated border-border-default"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Hexagonal chain icon */}
                        <div
                          className="w-10 h-10 flex items-center justify-center text-[18px] font-bold text-accent-primary bg-accent-subtle"
                          style={{
                            clipPath:
                              "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                          }}
                        >
                          {meta?.icon ?? chain.shortName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="text-body font-display font-semibold text-text-primary">
                            {chain.name}
                          </div>
                          <div className="text-micro text-text-muted font-display">
                            {chain.nativeCurrencySymbol}
                            {meta && <> &middot; {meta.gasEstimateLabel}</>}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            {disabled ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-badge text-[9px] font-display font-semibold bg-status-error-subtle text-status-error border border-status-error/15">
                                <Lock className="w-2.5 h-2.5" />
                                No RPC nodes configured
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-badge text-[9px] font-display font-semibold bg-status-success-subtle text-status-success border border-status-success/15">
                                {chain.activeNodeCount} RPC node{chain.activeNodeCount !== 1 ? "s" : ""} active
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Checkbox or Lock */}
                        {disabled ? (
                          <Lock className="w-5 h-5 text-text-muted" />
                        ) : (
                          <div
                            className={cn(
                              "w-5 h-5 rounded-input border-2 flex items-center justify-center transition-all duration-fast",
                              isSelected
                                ? "bg-accent-primary border-accent-primary"
                                : "border-border-default group-hover:border-text-muted"
                            )}
                          >
                            {isSelected && (
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedChains.length > 0 && (
              <div className="bg-surface-elevated border border-border-default rounded-card p-3">
                <div className="text-micro font-display font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Estimated Total Gas (~5.65M gas per chain)
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedChains.map((chainId) => {
                    const chain = availableChains.find((c) => c.chainId === chainId);
                    const meta = CHAIN_UI_META[chainId];
                    if (!chain) return null;
                    return (
                      <span
                        key={chainId}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge text-[10px] font-display font-semibold bg-accent-subtle text-accent-primary border border-accent-primary/15"
                      >
                        {chain.name}: {meta?.gasEstimateLabel ?? `~${chain.nativeCurrencySymbol}`}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <StepNav onPrev={prevStep}>
              <NavButton
                onClick={nextStep}
                disabled={selectedChains.length === 0}
                direction="next"
              >
                Continue
              </NavButton>
            </StepNav>
          </div>
        );

      // ========== STEP 3: Custody Mode ==========
      case 3:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Choose Custody Mode"
              subtitle="Select how keys will be managed for this project. This affects how transactions are signed."
            />

            <div className="space-y-3">
              {CUSTODY_OPTIONS.map((option) => {
                const isSelected = custodyMode === option.id;
                const Icon = option.icon;

                return (
                  <button
                    key={option.id}
                    onClick={() => setCustodyMode(option.id)}
                    className={cn(
                      "w-full p-5 rounded-card border-2 text-left transition-all duration-fast cursor-pointer",
                      isSelected
                        ? "border-accent-primary bg-accent-subtle"
                        : "border-border-default bg-surface-elevated hover:border-border-focus hover:bg-surface-hover"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          "w-10 h-10 flex items-center justify-center flex-shrink-0 border-2 transition-all duration-fast",
                          isSelected
                            ? "border-accent-primary bg-accent-primary text-white"
                            : "border-border-default text-text-muted"
                        )}
                        style={{
                          clipPath:
                            "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                        }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div
                          className={cn(
                            "text-body font-display font-bold mb-1",
                            isSelected
                              ? "text-accent-primary"
                              : "text-text-primary"
                          )}
                        >
                          {option.title}
                        </div>
                        <div className="text-caption text-text-secondary font-display leading-relaxed">
                          {option.description}
                        </div>
                      </div>

                      {/* Radio indicator */}
                      <div
                        className={cn(
                          "w-5 h-5 rounded-pill border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-fast",
                          isSelected
                            ? "border-accent-primary"
                            : "border-border-default"
                        )}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-pill bg-accent-primary" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <StepNav onPrev={prevStep}>
              <NavButton onClick={nextStep} direction="next">
                Continue
              </NavButton>
            </StepNav>
          </div>
        );

      // ========== STEP 4: Key Ceremony ==========
      case 4:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Key Ceremony"
              subtitle="Your project keys are being generated. Securely record your recovery phrase."
            />

            {keyCeremonyLoading && (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="relative w-20 h-20">
                  <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0">
                    <polygon
                      points="40,4 74,22 74,58 40,76 6,58 6,22"
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="2"
                      strokeDasharray="30 15"
                      className="animate-hex-spin"
                      style={{ transformOrigin: "center" }}
                    />
                    <polygon
                      points="40,16 62,28 62,52 40,64 18,52 18,28"
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="1"
                      opacity="0.3"
                      className="animate-pulse-gold"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Key className="w-6 h-6 text-accent-primary" />
                  </div>
                </div>
                <div className="text-body text-accent-primary font-display font-semibold animate-pulse-gold">
                  Generating cryptographic keys...
                </div>
                <div className="text-caption text-text-muted font-display">
                  Creating project and initializing key infrastructure
                </div>
              </div>
            )}

            {keyCeremonyError && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-16 h-16 flex items-center justify-center">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <polygon
                      points="32,4 58,18 58,46 32,60 6,46 6,18"
                      fill="var(--status-error)"
                    />
                    <line x1="22" y1="22" x2="42" y2="42" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    <line x1="42" y1="22" x2="22" y2="42" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="text-status-error text-body font-display font-semibold">
                  Key Generation Failed
                </div>
                <div className="text-caption text-text-muted font-display text-center max-w-[400px]">
                  {keyCeremonyError}
                </div>
                <button
                  onClick={() => {
                    setKeyCeremonyError(null);
                    setKeyCeremony(null);
                    keyCeremonyTriggered.current = false;
                    createProjectAndKeys();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-button text-caption font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-all duration-fast cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            )}

            {keyCeremony && (
              <div className="space-y-5 animate-fade-in">
                {/* WARNING Banner */}
                <div className="flex items-start gap-3 p-4 bg-status-error-subtle border border-status-error/20 rounded-card">
                  <AlertTriangle className="w-5 h-5 text-status-error flex-shrink-0 mt-0.5" />
                  <div className="text-caption text-status-error font-display leading-relaxed">
                    <strong>Write down these words in order. This is the ONLY time they will be shown.</strong>{" "}
                    Anyone with these words can access your funds. Store them securely offline.
                    CryptoVaultHub does not store your recovery phrase.
                  </div>
                </div>

                {/* Mnemonic Grid: 4 columns x 6 rows */}
                <div className="bg-surface-page border border-status-warning/20 rounded-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-micro font-display font-bold uppercase tracking-wider text-status-warning">
                      24-Word Recovery Phrase
                    </span>
                    <button
                      onClick={copyMnemonic}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button text-[10px] font-display font-semibold transition-all duration-fast cursor-pointer",
                        mnemonicCopied
                          ? "bg-status-success-subtle text-status-success border border-status-success/30"
                          : "bg-surface-card text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                      )}
                    >
                      {mnemonicCopied ? (
                        <>
                          <Check className="w-3 h-3" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy to Clipboard
                        </>
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {keyCeremony.mnemonic.map((word, i) => (
                      <div
                        key={i}
                        className="bg-surface-card border border-border-subtle rounded-input px-3 py-2 text-center"
                      >
                        <span className="text-[9px] text-text-muted mr-1.5 font-display font-semibold">
                          {i + 1}.
                        </span>
                        <span className="text-caption font-mono text-text-primary font-medium">
                          {word}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Public Keys */}
                <div className="bg-surface-elevated border border-border-default rounded-card p-4 space-y-3">
                  <div className="text-micro font-display font-bold uppercase tracking-wider text-text-muted">
                    Generated Public Keys
                  </div>
                  {(keyCeremony.publicKeys || []).map((key) => (
                    <div key={key.keyType} className="flex items-center gap-3">
                      <span className="text-[10px] font-display font-bold uppercase tracking-wider text-text-muted w-[100px] flex-shrink-0">
                        {key.keyType} Key
                      </span>
                      <code className="text-[10px] font-mono text-accent-primary flex-1 truncate">
                        {key.publicKey}
                      </code>
                      <CopyIconButton value={key.publicKey} />
                    </div>
                  ))}
                </div>

                {/* Acknowledgment Checkbox */}
                <label className="flex items-start gap-3 p-4 bg-surface-elevated border border-border-default rounded-card cursor-pointer group hover:border-accent-primary/30 transition-all duration-fast">
                  <input
                    type="checkbox"
                    checked={mnemonicAcknowledged}
                    onChange={(e) => setMnemonicAcknowledged(e.target.checked)}
                    className="mt-0.5 accent-accent-primary w-4 h-4 cursor-pointer flex-shrink-0"
                  />
                  <span className="text-caption text-text-secondary font-display group-hover:text-text-primary transition-colors duration-fast leading-relaxed">
                    I have securely recorded my recovery phrase. I understand that if I lose these words,
                    I will lose access to my funds and CryptoVaultHub cannot recover them.
                  </span>
                </label>

                {/* Navigation - Back disabled */}
                <div className="flex justify-between pt-2">
                  <button
                    disabled
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-button text-caption font-display font-semibold text-text-muted border border-border-default cursor-not-allowed opacity-50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <NavButton
                    onClick={nextStep}
                    disabled={!mnemonicAcknowledged}
                    direction="next"
                  >
                    Continue
                  </NavButton>
                </div>
              </div>
            )}
          </div>
        );

      // ========== STEP 5: Gas Deposit ==========
      case 5: {
        const toggleKeyVisibility = (chainId: number) => {
          setVisibleKeys((prev) => ({ ...prev, [chainId]: !prev[chainId] }));
        };

        // Find chain config for gas estimate labels and symbols
        const getChainMeta = (chainId: number) => {
          const chain = availableChains.find((c) => c.chainId === chainId);
          const ui = CHAIN_UI_META[chainId];
          if (!chain) return undefined;
          return {
            icon: ui?.icon ?? chain.shortName.charAt(0).toUpperCase(),
            symbol: chain.nativeCurrencySymbol,
            gasEstimateLabel: ui?.gasEstimateLabel ?? `~${chain.nativeCurrencySymbol}`,
          };
        };

        // Confirmations guidance per chain
        const confirmationsMap: Record<number, { count: number; time: string }> = {
          1: { count: 12, time: "~3 min" },
          56: { count: 15, time: "~45 sec" },
          137: { count: 128, time: "~5 min" },
          42161: { count: 1, time: "~15 sec" },
          10: { count: 1, time: "~2 sec" },
          43114: { count: 1, time: "~2 sec" },
          8453: { count: 1, time: "~2 sec" },
        };

        return (
          <div className="space-y-6">
            <StepHeader
              title="Fund Gas Tanks"
              subtitle="Deposit native tokens to each chain's gas tank. These funds cover the 5 smart contract deployments per chain."
            />

            {gasError && (
              <div className="flex items-center gap-2 p-3 bg-status-error-subtle border border-status-error/20 rounded-card">
                <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
                <span className="text-caption text-status-error font-display">{gasError}</span>
              </div>
            )}

            {gasLoading && gasChains.length === 0 && !gasError && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
                <span className="ml-2 text-text-muted font-display">Loading gas tank details...</span>
              </div>
            )}

            {!gasLoading && gasChains.length === 0 && !gasError && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
                <div className="text-body font-display font-semibold text-text-primary">Creating gas tanks...</div>
                <div className="text-caption text-text-muted font-display text-center max-w-[400px]">
                  Gas tank wallets are being derived for each selected chain. This will only take a moment.
                </div>
              </div>
            )}

            <div className="space-y-4">
              {gasChains.map((chain) => {
                const meta = getChainMeta(chain.chainId);
                const confirmInfo = confirmationsMap[chain.chainId] ?? { count: 6, time: "~2 min" };
                const privateKey = gasTankKeys[chain.chainId];
                const keyVisible = visibleKeys[chain.chainId] ?? false;

                return (
                  <div
                    key={chain.chainId}
                    className={cn(
                      "bg-surface-elevated border rounded-card overflow-hidden",
                      chain.sufficient
                        ? "border-status-success/30"
                        : "border-border-default"
                    )}
                  >
                    {/* Chain Header */}
                    <div className={cn(
                      "flex items-center justify-between px-5 py-3",
                      chain.sufficient
                        ? "bg-status-success/5"
                        : "bg-surface-card"
                    )}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 flex items-center justify-center text-[14px] font-bold text-accent-primary bg-accent-subtle"
                          style={{
                            clipPath:
                              "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                          }}
                        >
                          {meta?.icon ?? "?"}
                        </div>
                        <div>
                          <span className="text-body font-display font-bold text-text-primary">
                            {chain.chainName}
                          </span>
                          {meta && (
                            <span className="ml-2 text-micro text-text-muted font-display">
                              {meta.symbol}
                            </span>
                          )}
                        </div>
                      </div>
                      {chain.sufficient ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge bg-status-success-subtle text-status-success text-[11px] font-display font-bold">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Funded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge bg-status-warning-subtle text-status-warning text-[11px] font-display font-bold">
                          <Fuel className="w-3.5 h-3.5" />
                          Awaiting Deposit
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="px-5 py-4">
                      <div className="flex gap-5">
                        {/* QR Code */}
                        <div className="flex-shrink-0">
                          <QRCodeDisplay
                            address={chain.gasTankAddress}
                            network={chain.chainName}
                            size="md"
                          />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Gas Tank Address */}
                          <div>
                            <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1 font-display font-semibold">
                              Deposit Address
                            </div>
                            <div className="flex items-center gap-2 bg-surface-input rounded-input px-2.5 py-1.5 border border-border-default">
                              <code className="text-[11px] font-mono text-accent-primary truncate flex-1">
                                {chain.gasTankAddress}
                              </code>
                              <CopyIconButton value={chain.gasTankAddress} />
                            </div>
                          </div>

                          {/* Private Key */}
                          {privateKey && (
                            <div>
                              <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1 font-display font-semibold">
                                Private Key <span className="text-status-warning">(keep secret)</span>
                              </div>
                              <div className="flex items-center gap-2 bg-surface-input rounded-input px-2.5 py-1.5 border border-border-default">
                                <code className="text-[11px] font-mono text-text-secondary truncate flex-1">
                                  {keyVisible
                                    ? privateKey
                                    : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                                </code>
                                <button
                                  onClick={() => toggleKeyVisibility(chain.chainId)}
                                  className="flex-shrink-0 p-1 rounded-input text-text-muted hover:text-accent-primary transition-all duration-fast cursor-pointer"
                                  title={keyVisible ? "Hide" : "Show"}
                                >
                                  {keyVisible ? (
                                    <EyeOff className="w-3 h-3" />
                                  ) : (
                                    <Eye className="w-3 h-3" />
                                  )}
                                </button>
                                <CopyIconButton value={privateKey} />
                              </div>
                            </div>
                          )}

                          {/* Balance Bar */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex gap-4">
                                <div>
                                  <div className="text-[9px] text-text-muted uppercase tracking-wider font-display font-semibold">
                                    Balance
                                  </div>
                                  <div className={cn(
                                    "text-[15px] font-mono font-bold",
                                    chain.sufficient ? "text-status-success" : "text-text-primary"
                                  )}>
                                    {chain.balanceFormatted} {meta?.symbol}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-text-muted uppercase tracking-wider font-display font-semibold">
                                    Required
                                  </div>
                                  <div className="text-[15px] font-mono font-bold text-text-secondary">
                                    {chain.requiredFormatted} {meta?.symbol}
                                  </div>
                                </div>
                              </div>
                              {meta && (
                                <div className="text-right">
                                  <div className="text-[9px] text-text-muted uppercase tracking-wider font-display font-semibold">
                                    Estimate
                                  </div>
                                  <div className="text-[11px] font-display text-text-muted">
                                    {meta.gasEstimateLabel}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-1.5 bg-surface-input rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-normal",
                                  chain.sufficient
                                    ? "bg-status-success"
                                    : "bg-accent-primary"
                                )}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    chain.requiredFormatted === "0.0000"
                                      ? 100
                                      : (parseFloat(chain.balanceFormatted) /
                                          parseFloat(chain.requiredFormatted)) *
                                        100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Confirmation guidance */}
                      {!chain.sufficient && (
                        <div className="mt-3 flex items-start gap-2 p-2.5 bg-accent-subtle/30 rounded-input border border-accent-primary/10">
                          <AlertTriangle className="w-3.5 h-3.5 text-accent-primary flex-shrink-0 mt-0.5" />
                          <div className="text-[11px] text-text-secondary font-display leading-relaxed">
                            Send <strong>{meta?.symbol ?? "native tokens"}</strong> to
                            the address above. Wait for{" "}
                            <strong>{confirmInfo.count} confirmation{confirmInfo.count > 1 ? "s" : ""}</strong> ({confirmInfo.time}) before
                            the balance updates. Auto-polling every 15s.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {gasChains.length > 0 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={fetchGasCheck}
                  disabled={gasLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-button text-caption font-display font-semibold text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary transition-all duration-fast cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", gasLoading && "animate-spin")} />
                  Refresh Balances
                </button>
                {!allGasSufficient && (
                  <span className="text-micro text-text-muted font-display">
                    Auto-checking every 15s
                  </span>
                )}
              </div>
            )}

            <StepNav onPrev={prevStep}>
              <NavButton
                onClick={nextStep}
                disabled={!allGasSufficient}
                direction="next"
              >
                Continue to Deployment
              </NavButton>
            </StepNav>
          </div>
        );
      }

      // ========== STEP 6: Contract Deployment ==========
      case 6:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Smart Contract Deployment"
              subtitle="Deploy your isolated wallet infrastructure across all selected chains."
            />

            {deployError && (
              <div className="flex items-center gap-2 p-3 bg-status-error-subtle border border-status-error/20 rounded-card">
                <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
                <span className="text-caption text-status-error font-display">{deployError}</span>
              </div>
            )}

            {/* Deploy button */}
            {!deployStarted && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="w-16 h-16 flex items-center justify-center">
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <polygon
                      points="32,4 58,18 58,46 32,60 6,46 6,18"
                      fill="var(--accent-subtle)"
                      stroke="var(--accent-primary)"
                      strokeWidth="2"
                    />
                    <Rocket x="18" y="18" width="28" height="28" className="text-accent-primary" />
                  </svg>
                </div>
                <div className="text-body text-text-secondary font-display text-center max-w-[400px]">
                  Ready to deploy {selectedChains.length} chain{selectedChains.length > 1 ? "s" : ""}.
                  Each chain will deploy 5 contracts: WalletImpl, ForwarderImpl, WalletFactory, ForwarderFactory, and Hot Wallet.
                </div>
                <button
                  onClick={startDeployment}
                  disabled={deployLoading}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-card text-body font-display font-bold bg-accent-primary text-accent-text hover:bg-accent-hover shadow-glow transition-all duration-fast cursor-pointer disabled:opacity-50"
                >
                  {deployLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Rocket className="w-4 h-4" />
                  )}
                  Deploy Contracts
                </button>
              </div>
            )}

            {/* Deployment Progress per chain */}
            {deployStarted && (
              <div className="space-y-5">
                {deployChains.map((chain) => {
                  const chainConfig = availableChains.find((c) => c.chainId === chain.chainId);
                  const uiMeta = CHAIN_UI_META[chain.chainId];
                  const explorerBase = chainConfig?.explorerUrl || "https://etherscan.io";

                  // Build steps from contracts object returned by backend
                  const contractNames = ["walletImpl", "forwarderImpl", "walletFactory", "forwarderFactory", "hotWallet"];
                  const contractLabels: Record<string, string> = {
                    walletImpl: "Wallet Implementation",
                    forwarderImpl: "Forwarder Implementation",
                    walletFactory: "Wallet Factory",
                    forwarderFactory: "Forwarder Factory",
                    hotWallet: "Hot Wallet",
                  };
                  const deploymentSteps: DeploymentStep[] = contractNames.map((name) => {
                    const addr = chain.contracts?.[name] ?? null;
                    const deployed = chain.status === "ready" || chain.status === "deployed";
                    return {
                      name: contractLabels[name] || name,
                      status: addr ? "confirmed" : deployed ? "confirmed" : chain.status === "failed" ? "failed" : chain.status === "deploying" ? "deploying" : "pending",
                      contractAddress: addr ?? undefined,
                      explorerUrl: addr ? `${explorerBase}/address/${addr}` : undefined,
                      error: chain.status === "failed" ? chain.deployError ?? undefined : undefined,
                    };
                  });

                  return (
                    <div
                      key={chain.chainId}
                      className="bg-surface-elevated border border-border-default rounded-card p-5"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 flex items-center justify-center text-[14px] font-bold text-accent-primary bg-accent-subtle"
                            style={{
                              clipPath:
                                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                            }}
                          >
                            {uiMeta?.icon || chainConfig?.shortName?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <span className="text-body font-display font-semibold text-text-primary">
                            {chainConfig?.name || `Chain ${chain.chainId}`}
                          </span>
                        </div>
                        {(chain.status === "ready" || chain.status === "deployed") && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-badge bg-status-success-subtle text-status-success text-[10px] font-display font-semibold">
                            <CheckCircle className="w-3 h-3" />
                            Ready
                          </span>
                        )}
                        {chain.status === "failed" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-badge bg-status-error-subtle text-status-error text-[10px] font-display font-semibold">
                            <AlertCircle className="w-3 h-3" />
                            Failed
                          </span>
                        )}
                        {(chain.status === "deploying" || chain.status === "pending" || chain.status === "not_started") && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-badge bg-accent-subtle text-accent-primary text-[10px] font-display font-semibold">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Deploying
                          </span>
                        )}
                      </div>

                      <ContractDeploymentStatus steps={deploymentSteps} />

                      {chain.status === "failed" && chain.deployError && (
                        <div className="mt-3 p-3 bg-status-error-subtle border border-status-error/15 rounded-input text-caption text-status-error font-display">
                          {chain.deployError}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Retry button for failed deployments */}
                {anyDeployFailed && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        setDeployStarted(false);
                        setDeployError(null);
                        setDeployChains([]);
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-button text-caption font-display font-semibold bg-status-error text-white hover:bg-status-error/90 transition-all duration-fast cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry Failed Deployments
                    </button>
                  </div>
                )}

                {!anyDeployFailed && deployChains.length > 0 && (
                  <div className="text-center text-micro text-text-muted font-display">
                    Auto-checking status every 10 seconds. Will advance automatically when all chains are ready.
                  </div>
                )}
              </div>
            )}

            <StepNav onPrev={prevStep}>
              {deployChains.every((c) => c.status === "ready") &&
                deployChains.length > 0 && (
                  <NavButton onClick={nextStep} variant="success">
                    View Summary
                  </NavButton>
                )}
            </StepNav>
          </div>
        );

      // ========== STEP 7: Complete ==========
      case 7:
        return (
          <div className="space-y-6">
            {/* Success header */}
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 animate-fade-up">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <polygon
                    points="32,4 58,18 58,46 32,60 6,46 6,18"
                    fill="var(--status-success)"
                  />
                  <polyline
                    points="22,32 28,38 42,24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h2 className="text-display font-display mb-1">
                Your Project is Ready!
              </h2>
              <p className="text-body text-text-secondary font-display max-w-[500px] mx-auto">
                {projectName} has been set up with smart contracts deployed on{" "}
                {deployChains.length} chain{deployChains.length !== 1 ? "s" : ""}.
                Your wallet infrastructure is live.
              </p>
            </div>

            {/* Project Summary */}
            <div className="bg-surface-elevated border border-border-default rounded-card p-5">
              <div className="text-micro font-display font-bold uppercase tracking-wider text-text-muted mb-3">
                Project Summary
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">
                    Project Name
                  </div>
                  <div className="text-body font-display font-semibold text-text-primary">
                    {projectName}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">
                    Custody Mode
                  </div>
                  <div className="text-body font-display font-semibold text-accent-primary">
                    {CUSTODY_OPTIONS.find((c) => c.id === custodyMode)?.title}
                  </div>
                </div>
              </div>
            </div>

            {/* Chains & Hot Wallets */}
            <div className="bg-surface-elevated border border-border-default rounded-card p-5">
              <div className="text-micro font-display font-bold uppercase tracking-wider text-text-muted mb-3">
                Deployed Chains & Hot Wallets
              </div>
              <div className="space-y-3">
                {deployChains.map((chain) => {
                  const chainConfig = availableChains.find((c) => c.chainId === chain.chainId);
                  const uiMeta = CHAIN_UI_META[chain.chainId];

                  return (
                    <div
                      key={chain.chainId}
                      className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-b-0"
                    >
                      <div
                        className="w-8 h-8 flex items-center justify-center text-[14px] font-bold text-accent-primary bg-accent-subtle flex-shrink-0"
                        style={{
                          clipPath:
                            "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                        }}
                      >
                        {uiMeta?.icon || chainConfig?.shortName?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1">
                        <div className="text-body font-display font-semibold text-text-primary">
                          {chainConfig?.name || `Chain ${chain.chainId}`}
                        </div>
                        {chain.contracts?.hotWallet && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-text-muted uppercase tracking-wider font-display">
                              Hot Wallet:
                            </span>
                            <code className="text-[10px] font-mono text-accent-primary truncate">
                              {chain.contracts!.hotWallet}
                            </code>
                            <CopyIconButton value={chain.contracts!.hotWallet!} />
                          </div>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge bg-status-success-subtle text-status-success text-[10px] font-display font-semibold">
                        <CheckCircle className="w-3 h-3" />
                        Live
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-3 pt-2">
              {projectId && (
                <button
                  onClick={() => router.push(`/projects/${projectId}/deploys`)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-button text-caption font-display font-semibold text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary transition-all duration-fast cursor-pointer"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  View Deploy History
                </button>
              )}
              <button
                onClick={() => router.push("/")}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-button text-caption font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover shadow-glow transition-all duration-fast cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                Go to Dashboard
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-[820px] mx-auto">
      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator steps={STEP_LABELS} currentStep={currentStep} />
      </div>

      {/* Step content */}
      <div className="bg-surface-card border border-border-default rounded-card p-6 shadow-card overflow-hidden">
        <div key={currentStep} className="animate-fade-in">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}

// ─── Utility Components ───────────────────────────────────────

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center">
      <h2 className="text-[18px] font-display font-bold mb-1 text-text-primary">
        {title}
      </h2>
      <p className="text-body text-text-secondary font-display max-w-[480px] mx-auto">
        {subtitle}
      </p>
    </div>
  );
}

function StepNav({
  onPrev,
  children,
}: {
  onPrev: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between pt-2">
      <button
        onClick={onPrev}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-button text-caption font-display font-semibold text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary transition-all duration-fast cursor-pointer"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back
      </button>
      {children}
    </div>
  );
}

function NavButton({
  onClick,
  disabled = false,
  direction = "next",
  variant = "primary",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  direction?: "next" | "none";
  variant?: "primary" | "success";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 px-5 py-2.5 rounded-button text-caption font-display font-semibold transition-all duration-fast cursor-pointer",
        disabled &&
          "!bg-surface-hover !text-text-muted !cursor-not-allowed !shadow-none",
        !disabled &&
          variant === "primary" &&
          "bg-accent-primary text-accent-text hover:bg-accent-hover shadow-glow",
        !disabled &&
          variant === "success" &&
          "bg-status-success text-white hover:bg-status-success/90 shadow-glow"
      )}
    >
      {children}
      {direction === "next" && <ChevronRight className="w-3.5 h-3.5" />}
    </button>
  );
}

function CopyIconButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex-shrink-0 p-1 rounded-input transition-all duration-fast cursor-pointer",
        copied
          ? "text-status-success"
          : "text-text-muted hover:text-accent-primary"
      )}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? (
        <Check className="w-3 h-3" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}
