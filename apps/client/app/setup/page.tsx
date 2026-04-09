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
    color: "from-blue-500 to-indigo-600",
    borderColor: "border-blue-500/30",
    gasEstimate: "~0.05 ETH ($162)",
    explorerBase: "https://etherscan.io",
  },
  {
    id: "bsc",
    name: "BNB Smart Chain",
    symbol: "BNB",
    icon: "\u25C6",
    color: "from-yellow-500 to-amber-600",
    borderColor: "border-yellow-500/30",
    gasEstimate: "~0.02 BNB ($12)",
    explorerBase: "https://bscscan.com",
  },
  {
    id: "polygon",
    name: "Polygon",
    symbol: "MATIC",
    icon: "\u2B21",
    color: "from-purple-500 to-violet-600",
    borderColor: "border-purple-500/30",
    gasEstimate: "~5.0 MATIC ($4.50)",
    explorerBase: "https://polygonscan.com",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    symbol: "ETH",
    icon: "\u25B2",
    color: "from-blue-400 to-cyan-500",
    borderColor: "border-cyan-500/30",
    gasEstimate: "~0.001 ETH ($3.24)",
    explorerBase: "https://arbiscan.io",
  },
  {
    id: "optimism",
    name: "Optimism",
    symbol: "ETH",
    icon: "\u2B24",
    color: "from-red-500 to-rose-600",
    borderColor: "border-red-500/30",
    gasEstimate: "~0.001 ETH ($3.24)",
    explorerBase: "https://optimistic.etherscan.io",
  },
  {
    id: "avalanche",
    name: "Avalanche",
    symbol: "AVAX",
    icon: "\u25B3",
    color: "from-red-600 to-orange-500",
    borderColor: "border-red-600/30",
    gasEstimate: "~0.1 AVAX ($3.50)",
    explorerBase: "https://snowtrace.io",
  },
  {
    id: "base",
    name: "Base",
    symbol: "ETH",
    icon: "\u0042",
    color: "from-blue-600 to-blue-400",
    borderColor: "border-blue-600/30",
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
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "left"
  );

  const selectedChainObj = CHAINS.find((c) => c.id === primaryChain);

  // Simulate deposit detection
  const simulateDeposit = useCallback(() => {
    setTimeout(() => {
      setDepositDetected(true);
      setBalance(0.05);
      // Simulate confirmations counting up
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

    // Deploy factory
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

      // Deploy implementation
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
    setSlideDirection(step > currentStep ? "left" : "right");
    setCurrentStep(step);
  };

  const nextStep = () => goToStep(currentStep + 1);
  const prevStep = () => goToStep(currentStep - 1);

  const toggleChain = (chainId: string) => {
    setSelectedChains((prev) => {
      const next = prev.includes(chainId)
        ? prev.filter((c) => c !== chainId)
        : [...prev, chainId];
      // Auto-set primary to first selected
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
            {/* Welcome */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-cvh-accent to-cvh-purple rounded-2xl flex items-center justify-center text-2xl font-extrabold text-white shadow-lg shadow-cvh-accent/20">
                V
              </div>
              <h1 className="text-[24px] font-bold tracking-[-0.02em] mb-2">
                Welcome to CryptoVaultHub
              </h1>
              <p className="text-[13px] text-cvh-text-secondary max-w-[520px] mx-auto leading-relaxed">
                Let&apos;s set up your self-hosted wallet infrastructure. You&apos;ll get
                a hot wallet, deploy smart contracts for automated deposit
                sweeping, and generate your first customer deposit address.
              </p>
            </div>

            {/* Chain Selection */}
            <div>
              <h2 className="text-[14px] font-semibold mb-1">
                Select Blockchain Networks
              </h2>
              <p className="text-[11px] text-cvh-text-muted mb-4">
                Choose the networks you want to operate on. You can add more
                later.
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
                        "relative p-4 rounded-cvh-lg border-2 text-left transition-all duration-200 cursor-pointer group",
                        isSelected
                          ? cn("bg-cvh-bg-elevated", chain.borderColor)
                          : "bg-cvh-bg-tertiary border-cvh-border-subtle hover:border-cvh-border hover:bg-cvh-bg-hover"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-cvh flex items-center justify-center text-[18px] font-bold text-white bg-gradient-to-br",
                            chain.color
                          )}
                        >
                          {chain.icon}
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px] font-semibold flex items-center gap-2">
                            {chain.name}
                            {isPrimary && (
                              <span className="text-[8px] bg-cvh-accent/20 text-cvh-accent px-1.5 py-0.5 rounded-full font-bold uppercase">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-cvh-text-muted">
                            {chain.symbol} &middot; {chain.gasEstimate}
                          </div>
                        </div>

                        {/* Checkbox */}
                        <div
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                            isSelected
                              ? "bg-cvh-accent border-cvh-accent"
                              : "border-cvh-border group-hover:border-cvh-text-muted"
                          )}
                        >
                          {isSelected && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Set as primary */}
                      {isSelected && !isPrimary && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrimaryChain(chain.id);
                          }}
                          className="mt-2 text-[9px] text-cvh-text-muted hover:text-cvh-accent transition-colors cursor-pointer"
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
              <button
                onClick={nextStep}
                disabled={selectedChains.length === 0}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-cvh text-[12px] font-semibold transition-all cursor-pointer",
                  selectedChains.length > 0
                    ? "bg-cvh-accent text-white hover:bg-cvh-accent-dim shadow-lg shadow-cvh-accent/20"
                    : "bg-cvh-bg-elevated text-cvh-text-muted cursor-not-allowed"
                )}
              >
                Continue
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        );

      // ========== STEP 2: Operations Wallet Created ==========
      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-[18px] font-bold mb-1">
                Your Operations Wallet
              </h2>
              <p className="text-[12px] text-cvh-text-secondary">
                This hot wallet manages your smart contract ecosystem. Fund it
                to enable contract deployments.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Left: QR + Address */}
              <div className="flex flex-col items-center gap-4">
                <QRCodeDisplay
                  address={MOCK_OPERATIONS_WALLET.address}
                  network={selectedChainObj?.name || "Ethereum"}
                  networkColor="text-cvh-accent"
                  size="lg"
                />
              </div>

              {/* Right: Wallet Details */}
              <div className="space-y-4">
                {/* Details card */}
                <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4 space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-cvh-text-muted mb-2">
                    Wallet Details
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                        Address
                      </div>
                      <CopyableText
                        text={MOCK_OPERATIONS_WALLET.address}
                        mono
                      />
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Chain
                        </div>
                        <div className="text-[12px] font-semibold">
                          {selectedChainObj?.name || "Ethereum"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Status
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
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
                <div className="bg-cvh-accent/5 border border-cvh-accent/15 rounded-cvh-lg p-4">
                  <div className="text-[11px] font-bold text-cvh-accent mb-2">
                    Fund Your Wallet
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-cvh-text-secondary">
                    <li className="flex items-start gap-2">
                      <span className="text-cvh-accent mt-0.5">1.</span>
                      Send at least{" "}
                      <strong className="text-cvh-text-primary">
                        {selectedChainObj?.gasEstimate?.split(" ")[0] || "0.05"}{" "}
                        {selectedChainObj?.symbol || "ETH"}
                      </strong>{" "}
                      to this address
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cvh-accent mt-0.5">2.</span>
                      This funds smart contract deployment gas costs
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cvh-accent mt-0.5">3.</span>
                      Estimated cost breakdown:
                      <ul className="ml-4 text-[10px] text-cvh-text-muted">
                        <li>Factory deploy: ~0.025 {selectedChainObj?.symbol || "ETH"}</li>
                        <li>Implementation: ~0.015 {selectedChainObj?.symbol || "ETH"}</li>
                        <li>First forwarder: ~0.005 {selectedChainObj?.symbol || "ETH"}</li>
                      </ul>
                    </li>
                  </ul>

                  <div className="mt-3 p-2 bg-amber-500/5 border border-amber-500/15 rounded-cvh text-[10px] text-amber-300/80 flex items-center gap-2">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="flex-shrink-0"
                    >
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
              <div className="text-[11px] font-bold uppercase tracking-wider text-cvh-text-muted mb-2">
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
              icon={
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              }
              filename="operations-wallet-creation.json"
            />

            {/* Creation Callback JSON */}
            <JsonArtifact
              title="Creation Callback"
              data={MOCK_OPERATIONS_WALLET.callbackJson}
              icon={
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="22 12 16 12 14 15 10 9 8 12 2 12" />
                </svg>
              }
              filename="operations-wallet-callback.json"
            />

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <button
                onClick={prevStep}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-cvh text-[12px] font-semibold text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              <button
                onClick={() => {
                  simulateDeposit();
                  nextStep();
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-cvh text-[12px] font-semibold bg-cvh-accent text-white hover:bg-cvh-accent-dim shadow-lg shadow-cvh-accent/20 transition-all cursor-pointer"
              >
                I&apos;ve Sent the Deposit
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        );

      // ========== STEP 3: Deposit Confirmation ==========
      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-[18px] font-bold mb-1">
                {depositDetected
                  ? "Deposit Detected!"
                  : "Scanning for Your Deposit"}
              </h2>
              <p className="text-[12px] text-cvh-text-secondary">
                {depositDetected
                  ? "Your deposit has been received and is being confirmed."
                  : "Monitoring the blockchain for your incoming transaction..."}
              </p>
            </div>

            {!depositDetected ? (
              <div className="flex flex-col items-center gap-6 py-8">
                {/* Scanning animation */}
                <div className="relative w-24 h-24">
                  <div className="absolute inset-0 rounded-full border-2 border-cvh-accent/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-cvh-accent/40 animate-ping" />
                  <div className="absolute inset-2 rounded-full border-2 border-cvh-accent/30 animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cvh-accent animate-pulse"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                </div>

                <div className="text-[13px] text-cvh-accent font-semibold animate-pulse">
                  Scanning blockchain for your deposit...
                </div>

                {/* Progress bar */}
                <div className="w-64 h-1 bg-cvh-bg-elevated rounded-full overflow-hidden">
                  <div className="h-full bg-cvh-accent rounded-full animate-scan-progress" />
                </div>

                <div className="text-[11px] text-cvh-text-muted">
                  Checking every 5 seconds &middot; Listening for pending
                  transactions
                </div>

                {/* Manual entry option */}
                <div className="mt-4 p-4 bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg w-full max-w-md">
                  <div className="text-[11px] text-cvh-text-muted mb-2">
                    Already sent? Enter your transaction hash:
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="0x..."
                      className="flex-1 bg-cvh-bg-secondary border border-cvh-border rounded-[6px] px-3 py-2 font-mono text-[11px] text-cvh-text-primary outline-none focus:border-cvh-accent transition-colors"
                    />
                    <button className="px-3 py-2 rounded-[6px] text-[11px] font-semibold bg-cvh-bg-elevated text-cvh-text-secondary border border-cvh-border hover:text-cvh-text-primary transition-colors cursor-pointer">
                      Check
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Success animation */}
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-16 h-16 rounded-full bg-cvh-green flex items-center justify-center animate-fade-up shadow-lg shadow-cvh-green/20">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className="text-cvh-green text-[14px] font-bold">
                    Deposit Received!
                  </div>
                </div>

                {/* Deposit details */}
                <div className="bg-cvh-bg-tertiary border border-cvh-green/20 rounded-cvh-lg p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                        Amount
                      </div>
                      <div className="text-[18px] font-bold text-cvh-green font-mono">
                        {MOCK_DEPOSIT_TX.valueEth}{" "}
                        {selectedChainObj?.symbol || "ETH"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                        Confirmations
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[18px] font-bold text-cvh-text-primary font-mono">
                          {depositConfirmations}
                        </span>
                        <span className="text-[11px] text-cvh-text-muted">
                          / 12
                        </span>
                        {depositConfirmations < 12 && (
                          <span className="live-dot" />
                        )}
                        {depositConfirmations >= 12 && (
                          <span className="text-[10px] text-cvh-green font-semibold">
                            Finalized
                          </span>
                        )}
                      </div>
                      {/* Confirmations bar */}
                      <div className="w-full h-1.5 bg-cvh-bg-elevated rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-cvh-green rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              (depositConfirmations / 12) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-cvh-border-subtle space-y-2">
                    <div>
                      <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                        Transaction Hash
                      </div>
                      <CopyableText
                        text={MOCK_DEPOSIT_TX.transactionHash}
                        mono
                      />
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Block
                        </div>
                        <div className="text-[12px] font-mono text-cvh-text-primary">
                          {MOCK_DEPOSIT_TX.blockNumber.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          From
                        </div>
                        <code className="text-[11px] font-mono text-cvh-text-secondary">
                          {MOCK_DEPOSIT_TX.from.slice(0, 10)}...
                          {MOCK_DEPOSIT_TX.from.slice(-6)}
                        </code>
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Gas Used
                        </div>
                        <div className="text-[12px] font-mono text-cvh-text-primary">
                          {Number(MOCK_DEPOSIT_TX.gasUsed).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Updated balance */}
                <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cvh-text-muted mb-2">
                    Updated Balance
                  </div>
                  <LiveBalance
                    balance={balance}
                    symbol={selectedChainObj?.symbol || "ETH"}
                  />
                </div>

                {/* Navigation */}
                <div className="flex justify-between pt-2">
                  <button
                    onClick={prevStep}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-cvh text-[12px] font-semibold text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary transition-colors cursor-pointer"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back
                  </button>
                  <button
                    onClick={nextStep}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-cvh text-[12px] font-semibold bg-cvh-accent text-white hover:bg-cvh-accent-dim shadow-lg shadow-cvh-accent/20 transition-all cursor-pointer"
                  >
                    Continue to Withdrawal Setup
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      // ========== STEP 4: Withdrawal Address Setup ==========
      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-[18px] font-bold mb-1">
                Withdrawal Address
              </h2>
              <p className="text-[12px] text-cvh-text-secondary max-w-[480px] mx-auto">
                This is the destination address where swept funds from your
                forwarder contracts will be sent.
              </p>
            </div>

            {/* Mode selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setWithdrawalMode("generate")}
                className={cn(
                  "p-4 rounded-cvh-lg border-2 text-left transition-all cursor-pointer",
                  withdrawalMode === "generate"
                    ? "border-cvh-accent bg-cvh-accent/5"
                    : "border-cvh-border-subtle bg-cvh-bg-tertiary hover:border-cvh-border"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2",
                      withdrawalMode === "generate"
                        ? "border-cvh-accent bg-cvh-accent text-white"
                        : "border-cvh-border text-cvh-text-muted"
                    )}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold">
                      Generate New Address
                    </div>
                    <div className="text-[10px] text-cvh-text-muted">
                      System creates a fresh wallet
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setWithdrawalMode("existing")}
                className={cn(
                  "p-4 rounded-cvh-lg border-2 text-left transition-all cursor-pointer",
                  withdrawalMode === "existing"
                    ? "border-cvh-accent bg-cvh-accent/5"
                    : "border-cvh-border-subtle bg-cvh-bg-tertiary hover:border-cvh-border"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2",
                      withdrawalMode === "existing"
                        ? "border-cvh-accent bg-cvh-accent text-white"
                        : "border-cvh-border text-cvh-text-muted"
                    )}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold">
                      Use Existing Address
                    </div>
                    <div className="text-[10px] text-cvh-text-muted">
                      Enter your own wallet address
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Generated wallet details */}
            {withdrawalMode === "generate" && (
              <div className="space-y-5 animate-fade-up">
                <div className="grid grid-cols-2 gap-6">
                  <QRCodeDisplay
                    address={MOCK_WITHDRAWAL_WALLET.address}
                    network={selectedChainObj?.name || "Ethereum"}
                    networkColor="text-cvh-teal"
                    size="md"
                  />
                  <div className="space-y-3">
                    <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4 space-y-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-cvh-text-muted">
                        Withdrawal Wallet
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Address
                        </div>
                        <CopyableText
                          text={MOCK_WITHDRAWAL_WALLET.address}
                          mono
                        />
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Type
                        </div>
                        <div className="text-[12px] font-semibold text-cvh-teal">
                          Sweep Destination
                        </div>
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
              <div className="space-y-4 animate-fade-up">
                <AddressInput
                  value={existingAddress}
                  onChange={setExistingAddress}
                  label="Withdrawal Address"
                  placeholder="0x..."
                />
              </div>
            )}

            {/* Whitelist Management */}
            <div className="border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
              <div className="px-4 py-3 bg-cvh-bg-tertiary border-b border-cvh-border-subtle">
                <div className="text-[12px] font-semibold">
                  Withdrawal Whitelist
                </div>
                <div className="text-[10px] text-cvh-text-muted mt-0.5">
                  Addresses added here must pass a 24-hour cooldown before
                  becoming active.
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Add address form */}
                <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">
                  <div>
                    <label className="block text-[9px] font-semibold text-cvh-text-muted uppercase tracking-wider mb-1">
                      Label
                    </label>
                    <input
                      type="text"
                      value={wlLabel}
                      onChange={(e) => setWlLabel(e.target.value)}
                      placeholder="Main treasury"
                      className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2.5 py-1.5 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-cvh-text-muted uppercase tracking-wider mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      value={wlAddress}
                      onChange={(e) => setWlAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2.5 py-1.5 text-[11px] text-cvh-text-primary font-mono outline-none focus:border-cvh-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-cvh-text-muted uppercase tracking-wider mb-1">
                      Chain
                    </label>
                    <select
                      value={wlChain}
                      onChange={(e) => setWlChain(e.target.value)}
                      className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1.5 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer"
                    >
                      {selectedChains.map((cid) => {
                        const c = CHAINS.find((ch) => ch.id === cid);
                        return (
                          <option key={cid} value={cid}>
                            {c?.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <button
                    onClick={handleAddWhitelist}
                    className="px-3 py-1.5 rounded-[6px] text-[11px] font-semibold bg-cvh-accent text-white hover:bg-cvh-accent-dim transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {/* Listed addresses */}
                {whitelistAddresses.length > 0 && (
                  <div className="space-y-1.5 mt-3">
                    {whitelistAddresses.map((addr, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 bg-cvh-bg-tertiary rounded-cvh text-[11px]"
                      >
                        <span className="font-semibold text-cvh-text-primary min-w-[100px]">
                          {addr.label}
                        </span>
                        <code className="font-mono text-cvh-text-secondary flex-1 truncate">
                          {addr.address}
                        </code>
                        <span className="text-[9px] text-cvh-text-muted uppercase">
                          {addr.chain}
                        </span>
                        <span className="text-[9px] text-amber-400 font-semibold">
                          24h cooldown
                        </span>
                        <button
                          onClick={() =>
                            setWhitelistAddresses((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="text-cvh-text-muted hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {whitelistAddresses.length === 0 && (
                  <div className="text-[10px] text-cvh-text-muted text-center py-3">
                    No addresses in whitelist yet. You can add them later from
                    the dashboard.
                  </div>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <button
                onClick={prevStep}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-cvh text-[12px] font-semibold text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={
                  withdrawalMode === "existing" &&
                  existingAddress.length !== 42
                }
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-cvh text-[12px] font-semibold transition-all cursor-pointer",
                  withdrawalMode === "generate" ||
                    existingAddress.length === 42
                    ? "bg-cvh-accent text-white hover:bg-cvh-accent-dim shadow-lg shadow-cvh-accent/20"
                    : "bg-cvh-bg-elevated text-cvh-text-muted cursor-not-allowed"
                )}
              >
                Continue to Deployment
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        );

      // ========== STEP 5: Smart Contract Deployment ==========
      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-[18px] font-bold mb-1">
                Smart Contract Deployment
              </h2>
              <p className="text-[12px] text-cvh-text-secondary max-w-[480px] mx-auto">
                Deploy the wallet infrastructure that enables automated deposit
                sweeping.
              </p>
            </div>

            {/* Deployment overview */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-cvh bg-cvh-accent/10 flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cvh-accent"
                    >
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold">
                      Wallet Factory
                    </div>
                    <div className="text-[10px] text-cvh-text-muted">
                      CvhWalletFactory.sol
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-cvh-text-secondary leading-relaxed">
                  Creates and manages forwarder deposit addresses via CREATE2.
                  Deterministic address computation before deployment.
                </p>
              </div>

              <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-cvh bg-cvh-purple/10 flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cvh-purple"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold">
                      Forwarder Implementation
                    </div>
                    <div className="text-[10px] text-cvh-text-muted">
                      CvhForwarder.sol
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-cvh-text-secondary leading-relaxed">
                  Minimal proxy template for deposit addresses. Automatically
                  sweeps received funds to your withdrawal address.
                </p>
              </div>
            </div>

            {/* Gas estimate */}
            <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-cvh-text-muted uppercase tracking-wider">
                    Estimated Gas Cost
                  </div>
                  <div className="text-[16px] font-bold font-mono mt-1">
                    ~0.04 {selectedChainObj?.symbol || "ETH"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-cvh-text-muted">
                    Current balance
                  </div>
                  <div className="text-[14px] font-bold text-cvh-green font-mono">
                    {balance.toFixed(4)} {selectedChainObj?.symbol || "ETH"}
                  </div>
                </div>
              </div>
            </div>

            {/* Deploy button */}
            {!isDeploying &&
              deploymentSteps.every((s) => s.status === "pending") && (
                <div className="flex justify-center">
                  <button
                    onClick={simulateDeployment}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-cvh-lg text-[13px] font-bold bg-gradient-to-r from-cvh-accent to-cvh-purple text-white shadow-lg shadow-cvh-accent/30 hover:shadow-cvh-accent/50 transition-all cursor-pointer"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Deploy Contracts
                  </button>
                </div>
              )}

            {/* Deployment status */}
            <ContractDeploymentStatus steps={deploymentSteps} />

            {/* Post-deployment artifacts */}
            {allDeployed && (
              <div className="space-y-3 animate-fade-up">
                <JsonArtifact
                  title="Wallet Factory Deployment"
                  data={MOCK_FACTORY_DEPLOYMENT.deploymentJson}
                  defaultExpanded
                  filename="wallet-factory-deployment.json"
                />

                <JsonArtifact
                  title="Factory ABI"
                  data={MOCK_FACTORY_DEPLOYMENT.abi}
                  filename="wallet-factory-abi.json"
                />

                <JsonArtifact
                  title="Constructor Arguments"
                  data={MOCK_FACTORY_DEPLOYMENT.constructorArgs}
                  filename="factory-constructor-args.json"
                />

                <JsonArtifact
                  title="Forwarder Implementation Deployment"
                  data={MOCK_IMPL_DEPLOYMENT.deploymentJson}
                  filename="forwarder-implementation-deployment.json"
                />
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <button
                onClick={prevStep}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-cvh text-[12px] font-semibold text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              {allDeployed && (
                <button
                  onClick={nextStep}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-cvh text-[12px] font-semibold bg-cvh-accent text-white hover:bg-cvh-accent-dim shadow-lg shadow-cvh-accent/20 transition-all cursor-pointer"
                >
                  Generate First Deposit Address
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );

      // ========== STEP 6: First Forwarder Test ==========
      case 6:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-[18px] font-bold mb-1">
                Your First Deposit Address
              </h2>
              <p className="text-[12px] text-cvh-text-secondary max-w-[480px] mx-auto">
                Generate a forwarder address that your customers will use to
                make deposits. Funds are automatically swept to your
                operations wallet.
              </p>
            </div>

            {!forwarderGenerated ? (
              <div className="flex flex-col items-center gap-6 py-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cvh-accent to-cvh-teal flex items-center justify-center shadow-lg shadow-cvh-accent/20">
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <button
                  onClick={() => setForwarderGenerated(true)}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-cvh-lg text-[13px] font-bold bg-gradient-to-r from-cvh-accent to-cvh-teal text-white shadow-lg shadow-cvh-accent/30 hover:shadow-cvh-accent/50 transition-all cursor-pointer"
                >
                  Generate Deposit Address
                </button>
              </div>
            ) : (
              <div className="space-y-5 animate-fade-up">
                <div className="grid grid-cols-2 gap-6">
                  <QRCodeDisplay
                    address={MOCK_FORWARDER.address}
                    network={selectedChainObj?.name || "Ethereum"}
                    networkColor="text-cvh-teal"
                    size="lg"
                  />

                  <div className="space-y-4">
                    <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4 space-y-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-cvh-text-muted">
                        Forwarder Details
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Address
                        </div>
                        <CopyableText text={MOCK_FORWARDER.address} mono />
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Sweep Destination
                        </div>
                        <code className="text-[11px] font-mono text-cvh-teal">
                          {withdrawalMode === "generate"
                            ? MOCK_WITHDRAWAL_WALLET.address
                            : existingAddress || MOCK_WITHDRAWAL_WALLET.address}
                        </code>
                      </div>
                      <div>
                        <div className="text-[9px] text-cvh-text-muted uppercase tracking-wider mb-0.5">
                          Deployment Mode
                        </div>
                        <span className="text-[11px] font-semibold text-cvh-accent">
                          CREATE2 (deploy on first deposit)
                        </span>
                      </div>
                    </div>

                    <div className="bg-cvh-teal/5 border border-cvh-teal/15 rounded-cvh-lg p-3">
                      <div className="text-[11px] text-cvh-teal font-semibold mb-1">
                        How it works
                      </div>
                      <ul className="space-y-1 text-[10px] text-cvh-text-secondary">
                        <li>
                          1. Share this address with your customer
                        </li>
                        <li>
                          2. Customer sends{" "}
                          {selectedChainObj?.symbol || "ETH"} or tokens to
                          this address
                        </li>
                        <li>
                          3. Forwarder contract deploys automatically
                        </li>
                        <li>
                          4. Funds are swept to your withdrawal address
                        </li>
                      </ul>
                    </div>

                    {/* Test deposit */}
                    <div className="bg-cvh-bg-tertiary border border-dashed border-cvh-border rounded-cvh-lg p-3 text-center">
                      <div className="text-[10px] text-cvh-text-muted mb-1.5">
                        Test with a small deposit
                      </div>
                      <button className="text-[10px] text-cvh-accent font-semibold hover:text-cvh-accent-dim transition-colors cursor-pointer">
                        Send 0.001 {selectedChainObj?.symbol || "ETH"} test
                        deposit
                      </button>
                    </div>
                  </div>
                </div>

                <JsonArtifact
                  title="Forwarder Creation Payload"
                  data={MOCK_FORWARDER.creationJson}
                  filename="forwarder-creation.json"
                />

                <JsonArtifact
                  title="Forwarder Callback"
                  data={MOCK_FORWARDER.callbackJson}
                  filename="forwarder-callback.json"
                />
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <button
                onClick={prevStep}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-cvh text-[12px] font-semibold text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              {forwarderGenerated && (
                <button
                  onClick={nextStep}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-cvh text-[12px] font-semibold bg-cvh-green text-white hover:bg-cvh-green/90 shadow-lg shadow-cvh-green/20 transition-all cursor-pointer"
                >
                  Complete Setup
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );

      // ========== STEP 7: Setup Complete ==========
      case 7:
        return (
          <div className="space-y-6">
            {/* Success header */}
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cvh-green flex items-center justify-center shadow-lg shadow-cvh-green/20">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-[22px] font-bold mb-1">Setup Complete!</h2>
              <p className="text-[12px] text-cvh-text-secondary">
                Your wallet infrastructure is ready. Here&apos;s a summary of
                everything that was configured.
              </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Operations Wallet */}
              <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-cvh bg-cvh-accent/10 flex items-center justify-center">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cvh-accent"
                    >
                      <rect
                        x="2"
                        y="7"
                        width="20"
                        height="14"
                        rx="2"
                        ry="2"
                      />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div className="text-[12px] font-semibold">
                    Operations Wallet
                  </div>
                </div>
                <CopyableText text={MOCK_OPERATIONS_WALLET.address} mono />
                <div className="mt-2 text-[12px] font-mono text-cvh-green font-semibold">
                  {balance.toFixed(4)} {selectedChainObj?.symbol || "ETH"}
                </div>
              </div>

              {/* Withdrawal Address */}
              <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-cvh bg-cvh-teal/10 flex items-center justify-center">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cvh-teal"
                    >
                      <polyline points="22 12 16 12 14 15 10 9 8 12 2 12" />
                    </svg>
                  </div>
                  <div className="text-[12px] font-semibold">
                    Withdrawal Address
                  </div>
                </div>
                <CopyableText
                  text={
                    withdrawalMode === "generate"
                      ? MOCK_WITHDRAWAL_WALLET.address
                      : existingAddress || MOCK_WITHDRAWAL_WALLET.address
                  }
                  mono
                />
              </div>

              {/* Factory Contract */}
              <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-cvh bg-cvh-purple/10 flex items-center justify-center">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cvh-purple"
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                  <div className="text-[12px] font-semibold">
                    Wallet Factory
                  </div>
                </div>
                <CopyableText
                  text={MOCK_FACTORY_DEPLOYMENT.contractAddress}
                  mono
                />
              </div>

              {/* First Forwarder */}
              <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-cvh bg-cvh-green/10 flex items-center justify-center">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-cvh-green"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <div className="text-[12px] font-semibold">
                    First Deposit Address
                  </div>
                </div>
                <CopyableText text={MOCK_FORWARDER.address} mono />
              </div>
            </div>

            {/* Selected chains */}
            <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cvh-text-muted mb-3">
                Active Networks
              </div>
              <div className="flex gap-2 flex-wrap">
                {selectedChains.map((cid) => {
                  const chain = CHAINS.find((c) => c.id === cid);
                  if (!chain) return null;
                  return (
                    <span
                      key={cid}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border",
                        cid === primaryChain
                          ? "bg-cvh-accent/10 border-cvh-accent/30 text-cvh-accent"
                          : "bg-cvh-bg-elevated border-cvh-border-subtle text-cvh-text-secondary"
                      )}
                    >
                      <span
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br",
                          chain.color
                        )}
                      >
                        {chain.icon}
                      </span>
                      {chain.name}
                      {cid === primaryChain && (
                        <span className="text-[8px] uppercase opacity-60">
                          primary
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Download all artifacts */}
            <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh-lg p-5 text-center">
              <div className="text-[13px] font-semibold mb-1">
                Download All Artifacts
              </div>
              <p className="text-[10px] text-cvh-text-muted mb-3">
                Save all wallet creation payloads, deployment data, ABIs, and
                callback JSONs as a ZIP bundle.
              </p>
              <button
                onClick={() => {
                  // Create a JSON bundle of all artifacts
                  const bundle = {
                    exportedAt: new Date().toISOString(),
                    operationsWallet: MOCK_OPERATIONS_WALLET.creationJson,
                    operationsCallback: MOCK_OPERATIONS_WALLET.callbackJson,
                    withdrawalWallet: MOCK_WITHDRAWAL_WALLET.creationJson,
                    factoryDeployment: MOCK_FACTORY_DEPLOYMENT.deploymentJson,
                    factoryAbi: MOCK_FACTORY_DEPLOYMENT.abi,
                    factoryConstructorArgs:
                      MOCK_FACTORY_DEPLOYMENT.constructorArgs,
                    implementationDeployment:
                      MOCK_IMPL_DEPLOYMENT.deploymentJson,
                    firstForwarder: MOCK_FORWARDER.creationJson,
                    forwarderCallback: MOCK_FORWARDER.callbackJson,
                  };
                  const blob = new Blob(
                    [JSON.stringify(bundle, null, 2)],
                    { type: "application/json" }
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "cryptovaulthub-setup-artifacts.json";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-cvh text-[12px] font-semibold bg-cvh-bg-elevated text-cvh-text-primary border border-cvh-border hover:border-cvh-accent transition-all cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-cvh text-[12px] font-semibold bg-cvh-accent text-white hover:bg-cvh-accent-dim shadow-lg shadow-cvh-accent/20 transition-all no-underline"
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
              </a>
              <a
                href="/addresses"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-cvh text-[12px] font-semibold text-cvh-text-secondary border border-cvh-border hover:border-cvh-accent hover:text-cvh-text-primary transition-all no-underline"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
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
      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator
          steps={STEP_LABELS}
          currentStep={currentStep}
        />
      </div>

      {/* Step content with slide animation */}
      <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-6 overflow-hidden">
        <div
          key={currentStep}
          className={cn(
            "animate-fade-up",
            slideDirection === "left" && "motion-safe:animate-slide-in-left",
            slideDirection === "right" && "motion-safe:animate-slide-in-right"
          )}
        >
          {renderStep()}
        </div>
      </div>
    </div>
  );
}

// ─── Utility Components ───────────────────────────────────────

function CopyableText({
  text,
  mono = false,
}: {
  text: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5 group">
      <code
        className={cn(
          "text-[11px] break-all leading-relaxed select-all",
          mono ? "font-mono text-cvh-text-primary" : "text-cvh-text-secondary"
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
          "flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5",
          copied ? "text-cvh-green" : "text-cvh-text-muted hover:text-cvh-accent"
        )}
        title={copied ? "Copied!" : "Copy"}
      >
        {copied ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
