"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { StepIndicator } from "@/components/setup/step-indicator";
import { QRCodeDisplay } from "@/components/setup/qr-code-display";
import { JsonArtifact } from "@/components/setup/json-artifact";
import { PrivateKeyReveal } from "@/components/setup/private-key-reveal";
import { LiveBalance } from "@/components/setup/live-balance";
import {
  ContractDeploymentStatus,
  type DeploymentStep,
} from "@/components/setup/contract-deployment-status";
import { AddressInput } from "@/components/setup/address-input";

// ─── Mock Data ──────────────────────────────────────────────────

const CHAINS = [
  {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    icon: "\u039E",
    gasEstimate: "~0.05 ETH ($162)",
    explorerBase: "https://etherscan.io",
  },
  {
    id: "bsc",
    name: "BNB Smart Chain",
    symbol: "BNB",
    icon: "\u25C6",
    gasEstimate: "~0.02 BNB ($12)",
    explorerBase: "https://bscscan.com",
  },
  {
    id: "polygon",
    name: "Polygon",
    symbol: "MATIC",
    icon: "\u2B21",
    gasEstimate: "~5.0 MATIC ($4.50)",
    explorerBase: "https://polygonscan.com",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    symbol: "ETH",
    icon: "\u25B2",
    gasEstimate: "~0.001 ETH ($3.24)",
    explorerBase: "https://arbiscan.io",
  },
  {
    id: "optimism",
    name: "Optimism",
    symbol: "ETH",
    icon: "\u2B24",
    gasEstimate: "~0.001 ETH ($3.24)",
    explorerBase: "https://optimistic.etherscan.io",
  },
  {
    id: "avalanche",
    name: "Avalanche",
    symbol: "AVAX",
    icon: "\u25B3",
    gasEstimate: "~0.1 AVAX ($3.50)",
    explorerBase: "https://snowtrace.io",
  },
  {
    id: "base",
    name: "Base",
    symbol: "ETH",
    icon: "\u0042",
    gasEstimate: "~0.0005 ETH ($1.62)",
    explorerBase: "https://basescan.org",
  },
];

const MOCK_OPERATIONS_WALLET = {
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
  privateKey:
    "0x4c0883a69102937d6231471b5dbb6204fe512961708279f23efb3a7b43df27b6",
  mnemonic:
    "abandon ability able about above absent absorb abstract absurd abuse access accident",
  creationJson: {
    jsonrpc: "2.0",
    id: 1,
    result: {
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
      publicKey:
        "0x04b9d1d2e8f87a4b6e3c2a1f5d7e8c9b0a3f6d2e1c8b7a4f5e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4",
      chainId: 1,
      derivationPath: "m/44'/60'/0'/0/0",
      createdAt: "2026-04-09T10:23:45.123Z",
      version: "1.0.0",
    },
  },
  callbackJson: {
    event: "wallet.created",
    timestamp: "2026-04-09T10:23:45.456Z",
    data: {
      walletId: "wal_2xK8mN4pQ7rT1vW3",
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
      chain: "ethereum",
      chainId: 1,
      type: "hot_wallet",
      status: "active",
      transactionHash:
        "0x4e3a3754e0b1e0c7a5d2f8b6c9e1d3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7",
      blockNumber: 19847623,
      blockTimestamp: "2026-04-09T10:23:42.000Z",
      gasUsed: "21000",
      effectiveGasPrice: "12500000000",
    },
    signature:
      "sha256=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  },
};

const MOCK_WITHDRAWAL_WALLET = {
  address: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
  privateKey:
    "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  mnemonic:
    "census boring connect decline obvious gather repair drift ocean copper gentle motion",
  creationJson: {
    jsonrpc: "2.0",
    id: 2,
    result: {
      address: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
      publicKey:
        "0x04f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0",
      chainId: 1,
      derivationPath: "m/44'/60'/0'/0/1",
      createdAt: "2026-04-09T10:28:12.789Z",
      version: "1.0.0",
    },
  },
};

const MOCK_DEPOSIT_TX = {
  transactionHash:
    "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  blockNumber: 19847680,
  from: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
  to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
  value: "50000000000000000",
  valueEth: "0.05",
  gasUsed: "21000",
  effectiveGasPrice: "11200000000",
  status: 1,
  confirmations: 0,
  blockTimestamp: "2026-04-09T10:35:22.000Z",
};

const MOCK_FACTORY_DEPLOYMENT = {
  contractAddress: "0x1234567890AbCdEf1234567890aBcDeF12345678",
  transactionHash:
    "0xae2c1f7d8e4b5a6c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  blockNumber: 19847712,
  gasUsed: "2847563",
  effectiveGasPrice: "11800000000",
  deployerAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
  constructorArgs: {
    owner: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
    withdrawalAddress: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
    feeRecipient: "0x0000000000000000000000000000000000000000",
    feeBasisPoints: 0,
  },
  abi: [
    {
      inputs: [
        { name: "owner", type: "address" },
        { name: "withdrawalAddress", type: "address" },
        { name: "feeRecipient", type: "address" },
        { name: "feeBasisPoints", type: "uint256" },
      ],
      stateMutability: "nonpayable",
      type: "constructor",
    },
    {
      inputs: [{ name: "salt", type: "bytes32" }],
      name: "createForwarder",
      outputs: [{ name: "", type: "address" }],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ name: "salt", type: "bytes32" }],
      name: "computeAddress",
      outputs: [{ name: "", type: "address" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "implementation",
      outputs: [{ name: "", type: "address" }],
      stateMutability: "view",
      type: "function",
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, name: "forwarder", type: "address" },
        { indexed: false, name: "salt", type: "bytes32" },
      ],
      name: "ForwarderCreated",
      type: "event",
    },
  ],
  deploymentJson: {
    event: "contract.deployed",
    timestamp: "2026-04-09T10:42:18.234Z",
    data: {
      contractType: "CvhWalletFactory",
      address: "0x1234567890AbCdEf1234567890aBcDeF12345678",
      chain: "ethereum",
      chainId: 1,
      deployer: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
      transactionHash:
        "0xae2c1f7d8e4b5a6c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
      blockNumber: 19847712,
      gasUsed: "2847563",
      status: "confirmed",
      verified: false,
    },
  },
};

const MOCK_IMPL_DEPLOYMENT = {
  contractAddress: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  transactionHash:
    "0xb5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
  blockNumber: 19847715,
  gasUsed: "1523847",
  effectiveGasPrice: "11650000000",
  deploymentJson: {
    event: "contract.deployed",
    timestamp: "2026-04-09T10:42:45.678Z",
    data: {
      contractType: "CvhForwarderImplementation",
      address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
      chain: "ethereum",
      chainId: 1,
      deployer: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68",
      transactionHash:
        "0xb5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
      blockNumber: 19847715,
      gasUsed: "1523847",
      status: "confirmed",
    },
  },
};

const MOCK_FORWARDER = {
  address: "0xFe4c8A9B3D2E1f0C5b6A7d8E9F0a1B2c3D4e5F6",
  salt: "0x0000000000000000000000000000000000000000000000000000000000000001",
  creationJson: {
    event: "forwarder.created",
    timestamp: "2026-04-09T10:48:33.901Z",
    data: {
      forwarderAddress: "0xFe4c8A9B3D2E1f0C5b6A7d8E9F0a1B2c3D4e5F6",
      factoryAddress: "0x1234567890AbCdEf1234567890aBcDeF12345678",
      salt: "0x0000000000000000000000000000000000000000000000000000000000000001",
      chain: "ethereum",
      chainId: 1,
      externalId: "customer-001",
      label: "First Deposit Address",
      createdAt: "2026-04-09T10:48:33.901Z",
      sweepDestination: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
      status: "computed",
    },
  },
  callbackJson: {
    event: "forwarder.callback",
    timestamp: "2026-04-09T10:48:34.123Z",
    data: {
      forwarderAddress: "0xFe4c8A9B3D2E1f0C5b6A7d8E9F0a1B2c3D4e5F6",
      status: "ready",
      deploymentMode: "CREATE2",
      note: "Contract will be deployed automatically upon first deposit",
    },
  },
};

const STEP_LABELS = [
  "Chain",
  "Wallet",
  "Deposit",
  "Withdrawal",
  "Deploy",
  "Test",
  "Complete",
];

// ─── Component ──────────────────────────────────────────────────

export default function SetupWizardPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedChains, setSelectedChains] = useState<string[]>([]);
  const [primaryChain, setPrimaryChain] = useState<string>("");
  const [balance, setBalance] = useState(0);
  const [depositDetected, setDepositDetected] = useState(false);
  const [depositConfirmations, setDepositConfirmations] = useState(0);
  const [withdrawalMode, setWithdrawalMode] = useState<"generate" | "existing">(
    "generate"
  );
  const [existingAddress, setExistingAddress] = useState("");
  const [whitelistAddresses, setWhitelistAddresses] = useState<
    { label: string; address: string; chain: string }[]
  >([]);
  const [wlLabel, setWlLabel] = useState("");
  const [wlAddress, setWlAddress] = useState("");
  const [wlChain, setWlChain] = useState("ethereum");
  const [deploymentSteps, setDeploymentSteps] = useState<DeploymentStep[]>([
    {
      name: "Wallet Factory",
      description: "Manages forwarder creation and address computation",
      status: "pending",
    },
    {
      name: "Forwarder Implementation",
      description: "Template contract for deposit addresses",
      status: "pending",
    },
  ]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [forwarderGenerated, setForwarderGenerated] = useState(false);

  const selectedChainObj = CHAINS.find((c) => c.id === primaryChain);

  // Simulate deposit detection
  const simulateDeposit = useCallback(() => {
    setTimeout(() => {
      setDepositDetected(true);
      setBalance(0.05);
      let count = 0;
      const confInterval = setInterval(() => {
        count++;
        setDepositConfirmations(count);
        if (count >= 12) clearInterval(confInterval);
      }, 600);
    }, 3000);
  }, []);

  // Simulate contract deployment
  const simulateDeployment = useCallback(() => {
    setIsDeploying(true);

    setDeploymentSteps((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, status: "deploying" as const } : s))
    );

    setTimeout(() => {
      setDeploymentSteps((prev) =>
        prev.map((s, i) =>
          i === 0
            ? {
                ...s,
                status: "confirmed" as const,
                txHash: MOCK_FACTORY_DEPLOYMENT.transactionHash,
                contractAddress: MOCK_FACTORY_DEPLOYMENT.contractAddress,
                explorerUrl: `${selectedChainObj?.explorerBase || "https://etherscan.io"}/address/${MOCK_FACTORY_DEPLOYMENT.contractAddress}`,
              }
            : i === 1
            ? { ...s, status: "deploying" as const }
            : s
        )
      );

      setTimeout(() => {
        setDeploymentSteps((prev) =>
          prev.map((s, i) =>
            i === 1
              ? {
                  ...s,
                  status: "confirmed" as const,
                  txHash: MOCK_IMPL_DEPLOYMENT.transactionHash,
                  contractAddress: MOCK_IMPL_DEPLOYMENT.contractAddress,
                  explorerUrl: `${selectedChainObj?.explorerBase || "https://etherscan.io"}/address/${MOCK_IMPL_DEPLOYMENT.contractAddress}`,
                }
              : s
          )
        );
        setIsDeploying(false);
      }, 2500);
    }, 3000);
  }, [selectedChainObj]);

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  const nextStep = () => goToStep(currentStep + 1);
  const prevStep = () => goToStep(currentStep - 1);

  const toggleChain = (chainId: string) => {
    setSelectedChains((prev) => {
      const next = prev.includes(chainId)
        ? prev.filter((c) => c !== chainId)
        : [...prev, chainId];
      if (next.length > 0 && !next.includes(primaryChain)) {
        setPrimaryChain(next[0]);
      }
      if (next.length === 0) setPrimaryChain("");
      return next;
    });
  };

  const handleAddWhitelist = () => {
    if (wlLabel && wlAddress && wlAddress.length === 42) {
      setWhitelistAddresses((prev) => [
        ...prev,
        { label: wlLabel, address: wlAddress, chain: wlChain },
      ]);
      setWlLabel("");
      setWlAddress("");
    }
  };

  const allDeployed = deploymentSteps.every((s) => s.status === "confirmed");

  // ─── Render Steps ───────────────────────────────────────────

  const renderStep = () => {
    switch (currentStep) {
      // ========== STEP 1: Welcome & Chain Selection ==========
      case 1:
        return (
          <div className="space-y-6">
            {/* Welcome with hexagonal logo mark */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <polygon
                    points="32,4 58,18 58,46 32,60 6,46 6,18"
                    fill="var(--accent-subtle)"
                    stroke="var(--accent-primary)"
                    strokeWidth="2"
                  />
                  {/* Key icon inside hex */}
                  <circle cx="32" cy="26" r="5" fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
                  <line x1="32" y1="31" x2="32" y2="44" stroke="var(--accent-primary)" strokeWidth="2" />
                  <line x1="32" y1="38" x2="36" y2="36" stroke="var(--accent-primary)" strokeWidth="2" />
                  <line x1="32" y1="42" x2="36" y2="40" stroke="var(--accent-primary)" strokeWidth="2" />
                </svg>
              </div>
              <h1 className="text-display font-display tracking-[-0.02em] mb-2">
                Welcome to CryptoVaultHub
              </h1>
              <p className="text-body text-text-secondary max-w-[520px] mx-auto leading-relaxed font-display">
                Let&apos;s set up your self-hosted wallet infrastructure. You&apos;ll get
                a hot wallet, deploy smart contracts for automated deposit
                sweeping, and generate your first customer deposit address.
              </p>
            </div>

            {/* Chain Selection */}
            <div>
              <h2 className="text-subheading font-display mb-1">
                Select Blockchain Networks
              </h2>
              <p className="text-caption text-text-muted mb-4 font-display">
                Choose the networks you want to operate on. You can add more later.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {CHAINS.map((chain) => {
                  const isSelected = selectedChains.includes(chain.id);
                  const isPrimary = primaryChain === chain.id;

                  return (
                    <button
                      key={chain.id}
                      onClick={() => toggleChain(chain.id)}
                      className={cn(
                        "relative p-4 rounded-card border-2 text-left transition-all duration-fast cursor-pointer group",
                        isSelected
                          ? "bg-accent-subtle border-accent-primary/30"
                          : "bg-surface-elevated border-border-default hover:border-border-focus hover:bg-surface-hover"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Hexagonal chain icon */}
                        <div
                          className="w-10 h-10 flex items-center justify-center text-[18px] font-bold text-accent-primary bg-accent-subtle"
                          style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
                        >
                          {chain.icon}
                        </div>
                        <div className="flex-1">
                          <div className="text-body font-display font-semibold flex items-center gap-2">
                            {chain.name}
                            {isPrimary && (
                              <span className="text-[8px] bg-accent-subtle text-accent-primary px-1.5 py-0.5 rounded-pill font-display font-bold uppercase">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="text-micro text-text-muted font-display">
                            {chain.symbol} &middot; {chain.gasEstimate}
                          </div>
                        </div>

                        {/* Checkbox */}
                        <div
                          className={cn(
                            "w-5 h-5 rounded-input border-2 flex items-center justify-center transition-all duration-fast",
                            isSelected
                              ? "bg-accent-primary border-accent-primary"
                              : "border-border-default group-hover:border-text-muted"
                          )}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {isSelected && !isPrimary && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrimaryChain(chain.id);
                          }}
                          className="mt-2 text-[9px] text-text-muted hover:text-accent-primary transition-colors duration-fast cursor-pointer font-display"
                        >
                          Set as primary
                        </button>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Continue */}
            <div className="flex justify-end pt-2">
              <NavButton onClick={nextStep} disabled={selectedChains.length === 0} direction="next">
                Continue
              </NavButton>
            </div>
          </div>
        );

      // ========== STEP 2: Operations Wallet Created ==========
      case 2:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Your Operations Wallet"
              subtitle="This hot wallet manages your smart contract ecosystem. Fund it to enable contract deployments."
            />

            <div className="grid grid-cols-2 gap-6">
              {/* Left: QR + Address */}
              <div className="flex flex-col items-center gap-4">
                <QRCodeDisplay
                  address={MOCK_OPERATIONS_WALLET.address}
                  network={selectedChainObj?.name || "Ethereum"}
                  size="lg"
                />
              </div>

              {/* Right: Wallet Details */}
              <div className="space-y-4">
                <div className="bg-surface-elevated border border-border-default rounded-card p-4 space-y-3">
                  <div className="text-caption font-display font-bold uppercase tracking-wider text-text-muted mb-2">
                    Wallet Details
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">
                        Address
                      </div>
                      <CopyableText text={MOCK_OPERATIONS_WALLET.address} mono />
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">
                          Chain
                        </div>
                        <div className="text-[12px] font-display font-semibold text-text-primary">
                          {selectedChainObj?.name || "Ethereum"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">
                          Status
                        </div>
                        <span className="inline-flex items-center gap-1 text-caption font-display font-semibold text-status-warning">
                          <span className="w-1.5 h-1.5 rounded-pill bg-status-warning animate-pulse-gold" />
                          Awaiting Deposit
                        </span>
                      </div>
                    </div>

                    <LiveBalance
                      balance={balance}
                      symbol={selectedChainObj?.symbol || "ETH"}
                      polling
                    />
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-accent-subtle border border-accent-primary/15 rounded-card p-4">
                  <div className="text-caption font-display font-bold text-accent-primary mb-2">
                    Fund Your Wallet
                  </div>
                  <ul className="space-y-1.5 text-caption text-text-secondary font-display">
                    <li className="flex items-start gap-2">
                      <span className="text-accent-primary mt-0.5 font-semibold">1.</span>
                      Send at least{" "}
                      <strong className="text-text-primary">
                        {selectedChainObj?.gasEstimate?.split(" ")[0] || "0.05"}{" "}
                        {selectedChainObj?.symbol || "ETH"}
                      </strong>{" "}
                      to this address
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-primary mt-0.5 font-semibold">2.</span>
                      This funds smart contract deployment gas costs
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent-primary mt-0.5 font-semibold">3.</span>
                      <span>
                        Estimated cost breakdown:
                        <ul className="ml-4 text-[10px] text-text-muted mt-1 space-y-0.5">
                          <li>Factory deploy: ~0.025 {selectedChainObj?.symbol || "ETH"}</li>
                          <li>Implementation: ~0.015 {selectedChainObj?.symbol || "ETH"}</li>
                          <li>First forwarder: ~0.005 {selectedChainObj?.symbol || "ETH"}</li>
                        </ul>
                      </span>
                    </li>
                  </ul>

                  <div className="mt-3 p-2 bg-status-warning-subtle border border-status-warning/15 rounded-input text-[10px] text-status-warning/80 font-display flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Only send {selectedChainObj?.symbol || "ETH"} on the{" "}
                    {selectedChainObj?.name || "Ethereum"} network
                  </div>
                </div>
              </div>
            </div>

            {/* Private Key Section */}
            <div>
              <div className="text-caption font-display font-bold uppercase tracking-wider text-text-muted mb-2">
                Private Key &amp; Recovery
              </div>
              <PrivateKeyReveal
                privateKey={MOCK_OPERATIONS_WALLET.privateKey}
                mnemonic={MOCK_OPERATIONS_WALLET.mnemonic}
              />
            </div>

            {/* Wallet Creation JSON */}
            <JsonArtifact
              title="Wallet Creation Payload"
              data={MOCK_OPERATIONS_WALLET.creationJson}
              filename="operations-wallet-creation.json"
            />

            <JsonArtifact
              title="Creation Callback"
              data={MOCK_OPERATIONS_WALLET.callbackJson}
              filename="operations-wallet-callback.json"
            />

            {/* Navigation */}
            <StepNav onPrev={prevStep}>
              <NavButton onClick={() => { simulateDeposit(); nextStep(); }} direction="next">
                I&apos;ve Sent the Deposit
              </NavButton>
            </StepNav>
          </div>
        );

      // ========== STEP 3: Deposit Confirmation ==========
      case 3:
        return (
          <div className="space-y-6">
            <StepHeader
              title={depositDetected ? "Deposit Detected!" : "Scanning for Your Deposit"}
              subtitle={depositDetected
                ? "Your deposit has been received and is being confirmed."
                : "Monitoring the blockchain for your incoming transaction..."}
            />

            {!depositDetected ? (
              <div className="flex flex-col items-center gap-6 py-8">
                {/* Hexagonal scanning animation */}
                <div className="relative w-24 h-24">
                  <svg width="96" height="96" viewBox="0 0 96 96" className="absolute inset-0">
                    <polygon
                      points="48,4 88,24 88,72 48,92 8,72 8,24"
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="1.5"
                      opacity="0.2"
                    />
                    <polygon
                      points="48,4 88,24 88,72 48,92 8,72 8,24"
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="2"
                      strokeDasharray="30 15"
                      className="animate-hex-spin"
                      style={{ transformOrigin: "center" }}
                    />
                    <polygon
                      points="48,16 76,30 76,66 48,80 20,66 20,30"
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="1"
                      opacity="0.3"
                      className="animate-pulse-gold"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                </div>

                <div className="text-body text-accent-primary font-display font-semibold animate-pulse-gold">
                  Scanning blockchain for your deposit...
                </div>

                <div className="w-64 h-[2px] bg-surface-elevated rounded-pill overflow-hidden">
                  <div className="h-full bg-accent-primary rounded-pill animate-scan-progress" />
                </div>

                <div className="text-caption text-text-muted font-display">
                  Checking every 5 seconds &middot; Listening for pending transactions
                </div>

                {/* Manual entry */}
                <div className="mt-4 p-4 bg-surface-elevated border border-border-default rounded-card w-full max-w-md">
                  <div className="text-caption text-text-muted font-display mb-2">
                    Already sent? Enter your transaction hash:
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="0x..."
                      className="flex-1 bg-surface-input border border-border-default rounded-input px-3 py-2 font-mono text-caption text-text-primary outline-none focus:border-border-focus transition-colors duration-fast"
                    />
                    <button className="px-3 py-2 rounded-input text-caption font-display font-semibold bg-surface-card text-text-secondary border border-border-default hover:text-text-primary transition-colors duration-fast cursor-pointer">
                      Check
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Success -- hexagonal checkmark */}
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-16 h-16 flex items-center justify-center animate-fade-up">
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
                  <div className="text-status-success text-subheading font-display font-bold">
                    Deposit Received!
                  </div>
                </div>

                {/* Deposit details */}
                <div className="bg-surface-elevated border border-status-success/20 rounded-card p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Amount</div>
                      <div className="text-[18px] font-display font-bold text-status-success">
                        {MOCK_DEPOSIT_TX.valueEth} {selectedChainObj?.symbol || "ETH"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Confirmations</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[18px] font-display font-bold text-text-primary">
                          {depositConfirmations}
                        </span>
                        <span className="text-caption text-text-muted font-display">/ 12</span>
                        {depositConfirmations < 12 && (
                          <span className="w-[5px] h-[5px] rounded-pill bg-accent-primary animate-pulse-gold" />
                        )}
                        {depositConfirmations >= 12 && (
                          <span className="text-micro text-status-success font-display font-semibold">Finalized</span>
                        )}
                      </div>
                      <div className="w-full h-[2px] bg-surface-hover rounded-pill mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-status-success rounded-pill transition-all duration-slow"
                          style={{ width: `${Math.min((depositConfirmations / 12) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border-subtle space-y-2">
                    <div>
                      <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Transaction Hash</div>
                      <CopyableText text={MOCK_DEPOSIT_TX.transactionHash} mono />
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Block</div>
                        <div className="text-[12px] font-mono text-text-primary">{MOCK_DEPOSIT_TX.blockNumber.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">From</div>
                        <code className="text-caption font-mono text-text-secondary">
                          {MOCK_DEPOSIT_TX.from.slice(0, 10)}...{MOCK_DEPOSIT_TX.from.slice(-6)}
                        </code>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Gas Used</div>
                        <div className="text-[12px] font-mono text-text-primary">{Number(MOCK_DEPOSIT_TX.gasUsed).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-elevated border border-border-default rounded-card p-4">
                  <div className="text-micro font-display font-bold uppercase tracking-wider text-text-muted mb-2">Updated Balance</div>
                  <LiveBalance balance={balance} symbol={selectedChainObj?.symbol || "ETH"} />
                </div>

                <StepNav onPrev={prevStep}>
                  <NavButton onClick={nextStep} direction="next">Continue to Withdrawal Setup</NavButton>
                </StepNav>
              </div>
            )}
          </div>
        );

      // ========== STEP 4: Withdrawal Address Setup ==========
      case 4:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Withdrawal Address"
              subtitle="This is the destination address where swept funds from your forwarder contracts will be sent."
            />

            {/* Mode selection */}
            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                selected={withdrawalMode === "generate"}
                onClick={() => setWithdrawalMode("generate")}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                }
                title="Generate New Address"
                subtitle="System creates a fresh wallet"
              />
              <ModeCard
                selected={withdrawalMode === "existing"}
                onClick={() => setWithdrawalMode("existing")}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                }
                title="Use Existing Address"
                subtitle="Enter your own wallet address"
              />
            </div>

            {/* Generated wallet details */}
            {withdrawalMode === "generate" && (
              <div className="space-y-5 animate-fade-in">
                <div className="grid grid-cols-2 gap-6">
                  <QRCodeDisplay
                    address={MOCK_WITHDRAWAL_WALLET.address}
                    network={selectedChainObj?.name || "Ethereum"}
                    size="md"
                  />
                  <div className="space-y-3">
                    <div className="bg-surface-elevated border border-border-default rounded-card p-4 space-y-2.5">
                      <div className="text-caption font-display font-bold uppercase tracking-wider text-text-muted">
                        Withdrawal Wallet
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Address</div>
                        <CopyableText text={MOCK_WITHDRAWAL_WALLET.address} mono />
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Type</div>
                        <div className="text-[12px] font-display font-semibold text-accent-primary">Sweep Destination</div>
                      </div>
                    </div>
                  </div>
                </div>

                <PrivateKeyReveal
                  privateKey={MOCK_WITHDRAWAL_WALLET.privateKey}
                  mnemonic={MOCK_WITHDRAWAL_WALLET.mnemonic}
                />

                <JsonArtifact
                  title="Withdrawal Wallet Creation Payload"
                  data={MOCK_WITHDRAWAL_WALLET.creationJson}
                  filename="withdrawal-wallet-creation.json"
                />
              </div>
            )}

            {/* Existing address input */}
            {withdrawalMode === "existing" && (
              <div className="space-y-4 animate-fade-in">
                <AddressInput
                  value={existingAddress}
                  onChange={setExistingAddress}
                  label="Withdrawal Address"
                  placeholder="0x..."
                />
              </div>
            )}

            {/* Whitelist Management */}
            <div className="border border-border-default rounded-card overflow-hidden">
              <div className="px-4 py-3 bg-surface-elevated border-b border-border-subtle">
                <div className="text-[12px] font-display font-semibold text-text-primary">Withdrawal Whitelist</div>
                <div className="text-micro text-text-muted mt-0.5 font-display">
                  Addresses added here must pass a 24-hour cooldown before becoming active.
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">
                  <div>
                    <label className="block text-[9px] font-display font-semibold text-text-muted uppercase tracking-wider mb-1">Label</label>
                    <input
                      type="text"
                      value={wlLabel}
                      onChange={(e) => setWlLabel(e.target.value)}
                      placeholder="Main treasury"
                      className="w-full bg-surface-input border border-border-default rounded-input px-2.5 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus transition-colors duration-fast"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-display font-semibold text-text-muted uppercase tracking-wider mb-1">Address</label>
                    <input
                      type="text"
                      value={wlAddress}
                      onChange={(e) => setWlAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full bg-surface-input border border-border-default rounded-input px-2.5 py-1.5 text-caption text-text-primary font-mono outline-none focus:border-border-focus transition-colors duration-fast"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-display font-semibold text-text-muted uppercase tracking-wider mb-1">Chain</label>
                    <select
                      value={wlChain}
                      onChange={(e) => setWlChain(e.target.value)}
                      className="bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer"
                    >
                      {selectedChains.map((cid) => {
                        const c = CHAINS.find((ch) => ch.id === cid);
                        return <option key={cid} value={cid}>{c?.name}</option>;
                      })}
                    </select>
                  </div>
                  <button
                    onClick={handleAddWhitelist}
                    className="px-3 py-1.5 rounded-button text-caption font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {whitelistAddresses.length > 0 && (
                  <div className="space-y-1.5 mt-3">
                    {whitelistAddresses.map((addr, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 bg-surface-elevated rounded-input text-caption font-display">
                        <span className="font-semibold text-text-primary min-w-[100px]">{addr.label}</span>
                        <code className="font-mono text-text-secondary flex-1 truncate">{addr.address}</code>
                        <span className="text-[9px] text-text-muted uppercase font-display">{addr.chain}</span>
                        <span className="text-[9px] text-status-warning font-display font-semibold">24h cooldown</span>
                        <button
                          onClick={() => setWhitelistAddresses((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-text-muted hover:text-status-error transition-colors duration-fast cursor-pointer"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {whitelistAddresses.length === 0 && (
                  <div className="text-micro text-text-muted text-center py-3 font-display">
                    No addresses in whitelist yet. You can add them later from the dashboard.
                  </div>
                )}
              </div>
            </div>

            <StepNav onPrev={prevStep}>
              <NavButton
                onClick={nextStep}
                disabled={withdrawalMode === "existing" && existingAddress.length !== 42}
                direction="next"
              >
                Continue to Deployment
              </NavButton>
            </StepNav>
          </div>
        );

      // ========== STEP 5: Smart Contract Deployment ==========
      case 5:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Smart Contract Deployment"
              subtitle="Deploy the wallet infrastructure that enables automated deposit sweeping."
            />

            {/* Deployment overview cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-elevated border border-border-default rounded-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 flex items-center justify-center bg-accent-subtle"
                    style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-display font-semibold text-text-primary">Wallet Factory</div>
                    <div className="text-micro text-text-muted font-mono">CvhWalletFactory.sol</div>
                  </div>
                </div>
                <p className="text-micro text-text-secondary font-display leading-relaxed">
                  Creates and manages forwarder deposit addresses via CREATE2. Deterministic address computation before deployment.
                </p>
              </div>

              <div className="bg-surface-elevated border border-border-default rounded-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 flex items-center justify-center bg-accent-subtle"
                    style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-display font-semibold text-text-primary">Forwarder Implementation</div>
                    <div className="text-micro text-text-muted font-mono">CvhForwarder.sol</div>
                  </div>
                </div>
                <p className="text-micro text-text-secondary font-display leading-relaxed">
                  Minimal proxy template for deposit addresses. Automatically sweeps received funds to your withdrawal address.
                </p>
              </div>
            </div>

            {/* Gas estimate */}
            <div className="bg-surface-elevated border border-border-default rounded-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-caption font-display font-bold text-text-muted uppercase tracking-wider">Estimated Gas Cost</div>
                  <div className="text-[16px] font-display font-bold font-mono mt-1 text-text-primary">~0.04 {selectedChainObj?.symbol || "ETH"}</div>
                </div>
                <div className="text-right">
                  <div className="text-micro text-text-muted font-display">Current balance</div>
                  <div className="text-subheading font-display font-bold text-status-success font-mono">{balance.toFixed(4)} {selectedChainObj?.symbol || "ETH"}</div>
                </div>
              </div>
            </div>

            {/* Deploy button */}
            {!isDeploying && deploymentSteps.every((s) => s.status === "pending") && (
              <div className="flex justify-center">
                <button
                  onClick={simulateDeployment}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-card text-body font-display font-bold bg-accent-primary text-accent-text hover:bg-accent-hover shadow-glow transition-all duration-fast cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Deploy Contracts
                </button>
              </div>
            )}

            {/* Deployment status -- Forge Pipeline */}
            <ContractDeploymentStatus steps={deploymentSteps} />

            {/* Post-deployment artifacts */}
            {allDeployed && (
              <div className="space-y-3 animate-fade-in">
                <JsonArtifact title="Wallet Factory Deployment" data={MOCK_FACTORY_DEPLOYMENT.deploymentJson} defaultExpanded filename="wallet-factory-deployment.json" />
                <JsonArtifact title="Factory ABI" data={MOCK_FACTORY_DEPLOYMENT.abi} filename="wallet-factory-abi.json" />
                <JsonArtifact title="Constructor Arguments" data={MOCK_FACTORY_DEPLOYMENT.constructorArgs} filename="factory-constructor-args.json" />
                <JsonArtifact title="Forwarder Implementation Deployment" data={MOCK_IMPL_DEPLOYMENT.deploymentJson} filename="forwarder-implementation-deployment.json" />
              </div>
            )}

            <StepNav onPrev={prevStep}>
              {allDeployed && (
                <NavButton onClick={nextStep} direction="next">Generate First Deposit Address</NavButton>
              )}
            </StepNav>
          </div>
        );

      // ========== STEP 6: First Forwarder Test ==========
      case 6:
        return (
          <div className="space-y-6">
            <StepHeader
              title="Your First Deposit Address"
              subtitle="Generate a forwarder address that your customers will use to make deposits. Funds are automatically swept to your operations wallet."
            />

            {!forwarderGenerated ? (
              <div className="flex flex-col items-center gap-6 py-8">
                {/* Hex icon */}
                <div className="w-20 h-20 flex items-center justify-center">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <polygon points="40,4 74,22 74,58 40,76 6,58 6,22" fill="var(--accent-subtle)" stroke="var(--accent-primary)" strokeWidth="2" />
                    <line x1="40" y1="28" x2="40" y2="52" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="28" y1="40" x2="52" y2="40" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <button
                  onClick={() => setForwarderGenerated(true)}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-card text-body font-display font-bold bg-accent-primary text-accent-text hover:bg-accent-hover shadow-glow transition-all duration-fast cursor-pointer"
                >
                  Generate Deposit Address
                </button>
              </div>
            ) : (
              <div className="space-y-5 animate-fade-in">
                <div className="grid grid-cols-2 gap-6">
                  <QRCodeDisplay
                    address={MOCK_FORWARDER.address}
                    network={selectedChainObj?.name || "Ethereum"}
                    size="lg"
                  />

                  <div className="space-y-4">
                    <div className="bg-surface-elevated border border-border-default rounded-card p-4 space-y-3">
                      <div className="text-caption font-display font-bold uppercase tracking-wider text-text-muted">
                        Forwarder Details
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Address</div>
                        <CopyableText text={MOCK_FORWARDER.address} mono />
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Sweep Destination</div>
                        <code className="text-caption font-mono text-accent-primary">
                          {withdrawalMode === "generate"
                            ? MOCK_WITHDRAWAL_WALLET.address
                            : existingAddress || MOCK_WITHDRAWAL_WALLET.address}
                        </code>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 font-display">Deployment Mode</div>
                        <span className="text-caption font-display font-semibold text-accent-primary">
                          CREATE2 (deploy on first deposit)
                        </span>
                      </div>
                    </div>

                    <div className="bg-accent-subtle border border-accent-primary/15 rounded-card p-3">
                      <div className="text-caption text-accent-primary font-display font-semibold mb-1">How it works</div>
                      <ul className="space-y-1 text-micro text-text-secondary font-display">
                        <li>1. Share this address with your customer</li>
                        <li>2. Customer sends {selectedChainObj?.symbol || "ETH"} or tokens to this address</li>
                        <li>3. Forwarder contract deploys automatically</li>
                        <li>4. Funds are swept to your withdrawal address</li>
                      </ul>
                    </div>

                    <div className="bg-surface-elevated border border-dashed border-border-default rounded-card p-3 text-center">
                      <div className="text-micro text-text-muted font-display mb-1.5">Test with a small deposit</div>
                      <button className="text-micro text-accent-primary font-display font-semibold hover:text-accent-hover transition-colors duration-fast cursor-pointer">
                        Send 0.001 {selectedChainObj?.symbol || "ETH"} test deposit
                      </button>
                    </div>
                  </div>
                </div>

                <JsonArtifact title="Forwarder Creation Payload" data={MOCK_FORWARDER.creationJson} filename="forwarder-creation.json" />
                <JsonArtifact title="Forwarder Callback" data={MOCK_FORWARDER.callbackJson} filename="forwarder-callback.json" />
              </div>
            )}

            <StepNav onPrev={prevStep}>
              {forwarderGenerated && (
                <NavButton onClick={nextStep} variant="success">Complete Setup</NavButton>
              )}
            </StepNav>
          </div>
        );

      // ========== STEP 7: Setup Complete ==========
      case 7:
        return (
          <div className="space-y-6">
            {/* Success header with hex checkmark */}
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 animate-fade-up">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <polygon points="32,4 58,18 58,46 32,60 6,46 6,18" fill="var(--status-success)" />
                  <polyline points="22,32 28,38 42,24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-display font-display mb-1">Setup Complete!</h2>
              <p className="text-body text-text-secondary font-display">
                Your wallet infrastructure is ready. Here&apos;s a summary of everything that was configured.
              </p>
            </div>

            {/* Summary cards with hex icons */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard icon="wallet" label="Operations Wallet" address={MOCK_OPERATIONS_WALLET.address}>
                <div className="mt-2 text-[12px] font-mono text-status-success font-semibold">
                  {balance.toFixed(4)} {selectedChainObj?.symbol || "ETH"}
                </div>
              </SummaryCard>
              <SummaryCard icon="sweep" label="Withdrawal Address" address={
                withdrawalMode === "generate"
                  ? MOCK_WITHDRAWAL_WALLET.address
                  : existingAddress || MOCK_WITHDRAWAL_WALLET.address
              } />
              <SummaryCard icon="factory" label="Wallet Factory" address={MOCK_FACTORY_DEPLOYMENT.contractAddress} />
              <SummaryCard icon="forwarder" label="First Deposit Address" address={MOCK_FORWARDER.address} />
            </div>

            {/* Selected chains */}
            <div className="bg-surface-elevated border border-border-default rounded-card p-4">
              <div className="text-caption font-display font-bold uppercase tracking-wider text-text-muted mb-3">Active Networks</div>
              <div className="flex gap-2 flex-wrap">
                {selectedChains.map((cid) => {
                  const chain = CHAINS.find((c) => c.id === cid);
                  if (!chain) return null;
                  return (
                    <span
                      key={cid}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-caption font-display font-semibold border",
                        cid === primaryChain
                          ? "bg-accent-subtle border-accent-primary/30 text-accent-primary"
                          : "bg-surface-card border-border-default text-text-secondary"
                      )}
                    >
                      <span
                        className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-accent-primary bg-accent-subtle"
                        style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
                      >
                        {chain.icon}
                      </span>
                      {chain.name}
                      {cid === primaryChain && (
                        <span className="text-[8px] uppercase opacity-60">primary</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Download all artifacts */}
            <div className="bg-surface-elevated border border-border-default rounded-card p-5 text-center">
              <div className="text-body font-display font-semibold mb-1 text-text-primary">Download All Artifacts</div>
              <p className="text-micro text-text-muted font-display mb-3">
                Save all wallet creation payloads, deployment data, ABIs, and callback JSONs as a JSON bundle.
              </p>
              <button
                onClick={() => {
                  const bundle = {
                    exportedAt: new Date().toISOString(),
                    operationsWallet: MOCK_OPERATIONS_WALLET.creationJson,
                    operationsCallback: MOCK_OPERATIONS_WALLET.callbackJson,
                    withdrawalWallet: MOCK_WITHDRAWAL_WALLET.creationJson,
                    factoryDeployment: MOCK_FACTORY_DEPLOYMENT.deploymentJson,
                    factoryAbi: MOCK_FACTORY_DEPLOYMENT.abi,
                    factoryConstructorArgs: MOCK_FACTORY_DEPLOYMENT.constructorArgs,
                    implementationDeployment: MOCK_IMPL_DEPLOYMENT.deploymentJson,
                    firstForwarder: MOCK_FORWARDER.creationJson,
                    forwarderCallback: MOCK_FORWARDER.callbackJson,
                  };
                  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "cryptovaulthub-setup-artifacts.json";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-button text-caption font-display font-semibold bg-surface-card text-text-primary border border-border-default hover:border-accent-primary transition-all duration-fast cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download All as JSON Bundle
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-3 pt-2">
              <a
                href="/"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-button text-caption font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover shadow-glow transition-all duration-fast no-underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
                Go to Dashboard
              </a>
              <a
                href="/addresses"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-button text-caption font-display font-semibold text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary transition-all duration-fast no-underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Generate More Deposit Addresses
              </a>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-[820px] mx-auto">
      {/* Step indicator -- blockchain steps */}
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

function CopyableText({ text, mono = false }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5 group">
      <code
        className={cn(
          "text-caption break-all leading-relaxed select-all",
          mono ? "font-mono text-text-primary" : "text-text-secondary font-display"
        )}
      >
        {text}
      </code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={cn(
          "flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-fast cursor-pointer p-0.5",
          copied ? "text-status-success" : "text-text-muted hover:text-accent-primary"
        )}
        title={copied ? "Copied!" : "Copy"}
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center">
      <h2 className="text-[18px] font-display font-bold mb-1 text-text-primary">{title}</h2>
      <p className="text-body text-text-secondary font-display max-w-[480px] mx-auto">{subtitle}</p>
    </div>
  );
}

function StepNav({ onPrev, children }: { onPrev: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between pt-2">
      <button
        onClick={onPrev}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-button text-caption font-display font-semibold text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary transition-all duration-fast cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
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
        disabled && "!bg-surface-hover !text-text-muted !cursor-not-allowed !shadow-none",
        !disabled && variant === "primary" && "bg-accent-primary text-accent-text hover:bg-accent-hover shadow-glow",
        !disabled && variant === "success" && "bg-status-success text-white hover:bg-status-success/90 shadow-glow"
      )}
    >
      {children}
      {direction === "next" && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}

function ModeCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-4 rounded-card border-2 text-left transition-all duration-fast cursor-pointer",
        selected
          ? "border-accent-primary bg-accent-subtle"
          : "border-border-default bg-surface-elevated hover:border-border-focus"
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={cn(
            "w-8 h-8 flex items-center justify-center border-2 transition-all duration-fast",
            selected ? "border-accent-primary bg-accent-primary text-white" : "border-border-default text-text-muted"
          )}
          style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
        >
          {icon}
        </div>
        <div>
          <div className="text-body font-display font-semibold text-text-primary">{title}</div>
          <div className="text-micro text-text-muted font-display">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

function SummaryCard({
  icon,
  label,
  address,
  children,
}: {
  icon: "wallet" | "sweep" | "factory" | "forwarder";
  label: string;
  address: string;
  children?: React.ReactNode;
}) {
  const iconSvg = {
    wallet: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
    sweep: <><polyline points="22 12 16 12 14 15 10 9 8 12 2 12" /></>,
    factory: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></>,
    forwarder: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  };

  return (
    <div className="bg-surface-elevated border border-border-default rounded-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 flex items-center justify-center bg-accent-subtle"
          style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
            {iconSvg[icon]}
          </svg>
        </div>
        <div className="text-body font-display font-semibold text-text-primary">{label}</div>
      </div>
      <CopyableText text={address} mono />
      {children}
    </div>
  );
}
