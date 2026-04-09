"use client";

import { useState, useMemo } from "react";
import { Search, ChevronDown, ArrowDownLeft, ArrowUpRight, RefreshCw, Shuffle, Copy, Check, ChevronRight } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { WalletAccordion } from "@/components/wallet-accordion";
import type { WalletData } from "@/components/wallet-accordion";
import { TransactionFilters, defaultFilters } from "@/components/transaction-filters";
import type { TransactionFilterState } from "@/components/transaction-filters";
import { TransactionModal } from "@/components/transaction-modal";
import type { TransactionDetail } from "@/components/transaction-modal";
import { JsonViewer } from "@/components/json-viewer";
import { cn } from "@/lib/utils";
import { shortenAddress } from "@/lib/utils";

// ─── Mock: Clients ──────────────────────────────────────────
const mockClients = [
  { id: "client_cxyz_001", name: "Corretora XYZ", tier: "Business" },
  { id: "client_pgw_002", name: "PayGateway International", tier: "Enterprise" },
  { id: "client_eabc_003", name: "Exchange ABC", tier: "Starter" },
  { id: "client_cps_004", name: "CryptoPay Solutions", tier: "Business" },
  { id: "client_mp_005", name: "MerchantPro", tier: "Starter" },
];

// ─── Mock: Client Summary ───────────────────────────────────
const mockClientSummary: Record<string, {
  totalBalanceUsd: string;
  totalBalanceCrypto: string;
  totalWallets: number;
  activeWallets: number;
  totalTransactions: number;
}> = {
  client_cxyz_001: {
    totalBalanceUsd: "$847,231.54",
    totalBalanceCrypto: "12.50 BNB + 1.20 ETH + 1,250 MATIC",
    totalWallets: 3,
    activeWallets: 3,
    totalTransactions: 1247,
  },
  client_pgw_002: {
    totalBalanceUsd: "$4,215,890.00",
    totalBalanceCrypto: "85.30 BNB + 15.40 ETH + 45,000 MATIC",
    totalWallets: 5,
    activeWallets: 4,
    totalTransactions: 8912,
  },
  client_eabc_003: {
    totalBalanceUsd: "$3,120.75",
    totalBalanceCrypto: "0.15 BNB",
    totalWallets: 1,
    activeWallets: 0,
    totalTransactions: 89,
  },
  client_cps_004: {
    totalBalanceUsd: "$215,430.00",
    totalBalanceCrypto: "3.20 BNB + 0.45 ETH",
    totalWallets: 2,
    activeWallets: 2,
    totalTransactions: 432,
  },
  client_mp_005: {
    totalBalanceUsd: "$8,745.20",
    totalBalanceCrypto: "0.80 BNB + 890 MATIC",
    totalWallets: 2,
    activeWallets: 2,
    totalTransactions: 156,
  },
};

// ─── Mock: Wallets ──────────────────────────────────────────
const mockWallets: Record<string, WalletData[]> = {
  client_cxyz_001: [
    {
      id: "wallet_001",
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
      chain: "BSC",
      network: "Mainnet",
      balance: "12.50 BNB",
      balanceUsd: "$4,312.50",
      status: "active",
      createdAt: "2026-01-15 09:23:41 UTC",
      ownerAddress: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
      contractAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      deploymentTxHash: "0xa16081f360e3847006db660bae1c6d1b2e17ec2a01000000000000000000001e",
      tokenBalances: [
        { token: "BNB", amount: "12.5000", usd: "$4,312.50" },
        { token: "USDT (BEP-20)", amount: "500,000.00", usd: "$500,000.00" },
        { token: "USDC (BEP-20)", amount: "340,000.00", usd: "$340,000.00" },
        { token: "BUSD", amount: "2,850.00", usd: "$2,850.00" },
      ],
      creationJson: {
        clientId: "client_cxyz_001",
        chain: "BSC",
        chainId: 56,
        type: "CvhWalletSimple",
        salt: "0x7c8ab29f000000000000000000000000000000000000000000000000000001a4",
        factory: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        owner: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
        createdAt: "2026-01-15T09:23:41.000Z",
        version: "1.2.0",
        gasUsed: "245,891",
        blockNumber: 35892147,
      },
      callbackData: {
        callbackUrl: "https://api.corretxyz.com/webhooks/wallet-created",
        callbackId: "cb_w_001_bsc",
        deliveredAt: "2026-01-15T09:23:43.120Z",
        httpStatus: 200,
        responseBody: { acknowledged: true, internalId: "CXYZ-W-BSC-001" },
      },
      forwarders: [
        { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", balance: "0.00 BNB", lastDeposit: "2h ago", status: "active" },
        { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", balance: "0.05 BNB", lastDeposit: "1d ago", status: "active" },
        { address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", balance: "0.00 BNB", lastDeposit: "3d ago", status: "active" },
        { address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", balance: "100 USDT", lastDeposit: "5m ago", status: "active" },
        { address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", balance: "0.00 BNB", lastDeposit: "1w ago", status: "inactive" },
      ],
      privateKeyEncrypted: "U2FsdGVkX1+vupppZksvRf5pq5g5XjFRIipRkwB0K1Y96Qsv2Lm+31cmzaAILwytX+sK1YGrjbEAm3+vHKoFmA==",
    },
    {
      id: "wallet_002",
      address: "0x8f3a21Bb5e1f4bCc9d6E8fA3B7dC2e1f6a9b3c4d",
      chain: "Ethereum",
      network: "Mainnet",
      balance: "1.20 ETH",
      balanceUsd: "$3,840.00",
      status: "active",
      createdAt: "2026-01-15 09:25:12 UTC",
      ownerAddress: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
      contractAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      deploymentTxHash: "0xb23081f360e3847006db660bae1c6d1b2e17ec2a01000000000000000000002f",
      tokenBalances: [
        { token: "ETH", amount: "1.2000", usd: "$3,840.00" },
        { token: "USDT (ERC-20)", amount: "5,200.00", usd: "$5,200.00" },
        { token: "USDC (ERC-20)", amount: "1,800.00", usd: "$1,800.00" },
      ],
      creationJson: {
        clientId: "client_cxyz_001",
        chain: "Ethereum",
        chainId: 1,
        type: "CvhWalletSimple",
        salt: "0x9d2ef31a000000000000000000000000000000000000000000000000000001b5",
        factory: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        owner: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
        createdAt: "2026-01-15T09:25:12.000Z",
        version: "1.2.0",
        gasUsed: "312,445",
        blockNumber: 19847100,
      },
      callbackData: {
        callbackUrl: "https://api.corretxyz.com/webhooks/wallet-created",
        callbackId: "cb_w_001_eth",
        deliveredAt: "2026-01-15T09:25:14.450Z",
        httpStatus: 200,
        responseBody: { acknowledged: true, internalId: "CXYZ-W-ETH-001" },
      },
      forwarders: [
        { address: "0x14dC79964da2C08daa4967bA686104dAb7683940", balance: "0.00 ETH", lastDeposit: "12h ago", status: "active" },
        { address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", balance: "0.01 ETH", lastDeposit: "2d ago", status: "active" },
        { address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", balance: "50 USDT", lastDeposit: "6h ago", status: "active" },
      ],
      privateKeyEncrypted: "U2FsdGVkX1+Hs7e2mEXb9CYjq1F3nPqRu+5cTLMJm4tGwk1f8K+r2NcB2jQ6HXDI9pAx3OWc+SzVb4l2/kJPgw==",
    },
    {
      id: "wallet_003",
      address: "0xa1c9e0Dd47b3F5cA8E7d9B0f2C4a6e8D1b3f5a7c",
      chain: "Polygon",
      network: "Mainnet",
      balance: "1,250.00 MATIC",
      balanceUsd: "$912.50",
      status: "active",
      createdAt: "2026-02-01 14:11:33 UTC",
      ownerAddress: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
      contractAddress: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
      deploymentTxHash: "0xc45091f360e3847006db660bae1c6d1b2e17ec2a01000000000000000000003a",
      tokenBalances: [
        { token: "MATIC", amount: "1,250.00", usd: "$912.50" },
        { token: "USDT (PoS)", amount: "18,400.00", usd: "$18,400.00" },
        { token: "USDC (PoS)", amount: "7,600.00", usd: "$7,600.00" },
      ],
      creationJson: {
        clientId: "client_cxyz_001",
        chain: "Polygon",
        chainId: 137,
        type: "CvhWalletSimple",
        salt: "0xaf3cd52b000000000000000000000000000000000000000000000000000001c6",
        factory: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
        owner: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097",
        createdAt: "2026-02-01T14:11:33.000Z",
        version: "1.2.0",
        gasUsed: "198,332",
        blockNumber: 61234500,
      },
      callbackData: {
        callbackUrl: "https://api.corretxyz.com/webhooks/wallet-created",
        callbackId: "cb_w_001_poly",
        deliveredAt: "2026-02-01T14:11:35.890Z",
        httpStatus: 200,
        responseBody: { acknowledged: true, internalId: "CXYZ-W-POLY-001" },
      },
      forwarders: [
        { address: "0xBcd4042DE499D14e55001CcbB24a551F3b954096", balance: "0.00 MATIC", lastDeposit: "4h ago", status: "active" },
        { address: "0x71bE63f3384f5fb98995898A86B02Fb2426c5788", balance: "200 USDT", lastDeposit: "30m ago", status: "active" },
        { address: "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a", balance: "0.00 MATIC", lastDeposit: "5d ago", status: "inactive" },
        { address: "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec", balance: "0.00 MATIC", lastDeposit: "1w ago", status: "inactive" },
      ],
      privateKeyEncrypted: "U2FsdGVkX1+Qp9kR7fHxY2JwNm5bCeT8vK1dWs0uXoIPfLg3h+mA6RrZjYqUNvFE7cBx4PWa+TzQd5k3/lHOiw==",
    },
  ],
};

// ─── Mock: Transactions ─────────────────────────────────────
interface MockTransaction {
  id: string;
  txHash: string;
  timestamp: string;
  type: "deposit" | "withdrawal" | "sweep" | "internal";
  from: string;
  to: string;
  amount: string;
  tokenSymbol: string;
  chain: string;
  status: "confirmed" | "pending" | "failed";
  confirmations: number;
  requiredConfirmations: number;
  detail: TransactionDetail;
}

function buildDetail(base: Omit<MockTransaction, "detail" | "id">): TransactionDetail {
  return {
    txHash: base.txHash,
    blockNumber: 35892147 + Math.floor(Math.random() * 10000),
    blockHash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
    timestamp: base.timestamp,
    timestampUtc: base.timestamp.replace(" UTC-3", " UTC"),
    from: base.from,
    to: base.to,
    value: base.amount,
    tokenSymbol: base.tokenSymbol,
    tokenContract: ["ETH", "BNB", "MATIC"].includes(base.tokenSymbol) ? null : "0x55d398326f99059fF775485246999027B3197955",
    chain: base.chain,
    chainId: base.chain === "BSC" ? 56 : base.chain === "Ethereum" ? 1 : 137,
    type: base.type,
    status: base.status,
    confirmations: base.confirmations,
    requiredConfirmations: base.requiredConfirmations,
    gasUsed: (21000 + Math.floor(Math.random() * 80000)).toLocaleString(),
    gasPrice: (Math.random() * 10 + 3).toFixed(2) + " Gwei",
    effectiveGasPrice: (Math.random() * 10 + 3).toFixed(2) + " Gwei",
    gasCostUsd: "$" + (Math.random() * 2 + 0.1).toFixed(4),
    nonce: Math.floor(Math.random() * 500),
    transactionIndex: Math.floor(Math.random() * 200),
    inputData: base.type === "sweep" ? "0xa9059cbb000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f2bde40000000000000000000000000000000000000000000000056bc75e2d63100000" : "0x",
    decodedInput: base.type === "sweep" ? {
      method: "transfer(address,uint256)",
      params: {
        to: base.to,
        amount: base.amount,
      },
    } : null,
    logs: base.type !== "sweep" && base.type !== "internal" ? [
      {
        logIndex: 0,
        address: "0x55d398326f99059fF775485246999027B3197955",
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          "0x000000000000000000000000" + base.from.slice(2).toLowerCase(),
          "0x000000000000000000000000" + base.to.slice(2).toLowerCase(),
        ],
        data: "0x0000000000000000000000000000000000000000000000056bc75e2d63100000",
        decoded: {
          event: "Transfer",
          args: {
            from: base.from,
            to: base.to,
            value: base.amount,
          },
        },
      },
    ] : [
      {
        logIndex: 0,
        address: "0x55d398326f99059fF775485246999027B3197955",
        topics: [
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
          "0x000000000000000000000000" + base.from.slice(2).toLowerCase(),
          "0x000000000000000000000000" + base.to.slice(2).toLowerCase(),
        ],
        data: "0x0000000000000000000000000000000000000000000000056bc75e2d63100000",
        decoded: {
          event: "Transfer",
          args: { from: base.from, to: base.to, value: base.amount },
        },
      },
      {
        logIndex: 1,
        address: base.from,
        topics: [
          "0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb",
          "0x000000000000000000000000" + base.to.slice(2).toLowerCase(),
        ],
        data: "0x0000000000000000000000000000000000000000000000056bc75e2d63100000",
        decoded: {
          event: "ForwarderFlushed",
          args: { destination: base.to, amount: base.amount },
        },
      },
    ],
    internalTransactions: base.type === "sweep" ? [
      {
        from: base.from,
        to: base.to,
        value: base.amount,
        type: "CALL",
        gasUsed: "21,000",
      },
    ] : [],
    rawTransaction: {
      hash: base.txHash,
      type: 2,
      accessList: [],
      blockHash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      blockNumber: 35892147 + Math.floor(Math.random() * 10000),
      transactionIndex: Math.floor(Math.random() * 200),
      from: base.from,
      to: base.to,
      value: "0x" + BigInt(Math.floor(parseFloat(base.amount.replace(/[^0-9.]/g, "")) * 1e18)).toString(16),
      nonce: Math.floor(Math.random() * 500),
      gasLimit: "0x" + (100000 + Math.floor(Math.random() * 200000)).toString(16),
      gasUsed: "0x" + (21000 + Math.floor(Math.random() * 80000)).toString(16),
      gasPrice: "0x" + Math.floor((Math.random() * 10 + 3) * 1e9).toString(16),
      maxFeePerGas: "0x" + Math.floor(20 * 1e9).toString(16),
      maxPriorityFeePerGas: "0x" + Math.floor(1.5 * 1e9).toString(16),
      input: base.type === "sweep" ? "0xa9059cbb..." : "0x",
      v: "0x1",
      r: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      s: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      chainId: base.chain === "BSC" ? 56 : base.chain === "Ethereum" ? 1 : 137,
      status: base.status === "confirmed" ? 1 : base.status === "failed" ? 0 : null,
      confirmations: base.confirmations,
    },
  };
}

const txBase: Omit<MockTransaction, "detail" | "id">[] = [
  {
    txHash: "0xe9e7cea3dedca5984780bafc599bd69add087d56a42d35cc6634c0532925a3b8",
    timestamp: "2026-04-09 14:02:15 UTC-3",
    type: "deposit",
    from: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "100.00 USDT",
    tokenSymbol: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    requiredConfirmations: 15,
  },
  {
    txHash: "0xf1a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3",
    timestamp: "2026-04-09 13:58:42 UTC-3",
    type: "withdrawal",
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    to: "0xdead000000000000000000000000000000000beef",
    amount: "2.50 ETH",
    tokenSymbol: "ETH",
    chain: "Ethereum",
    status: "confirmed",
    confirmations: 12,
    requiredConfirmations: 12,
  },
  {
    txHash: "0xa7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9",
    timestamp: "2026-04-09 13:55:10 UTC-3",
    type: "sweep",
    from: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "4,200.00 USDT",
    tokenSymbol: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    requiredConfirmations: 15,
  },
  {
    txHash: "0xb4c5d6e7f8091a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    timestamp: "2026-04-09 13:48:33 UTC-3",
    type: "deposit",
    from: "0x1234567890AbCdEf1234567890aBcDeF12345678",
    to: "0xa1c9e0Dd47b3F5cA8E7d9B0f2C4a6e8D1b3f5a7c",
    amount: "200.00 USDT",
    tokenSymbol: "USDT",
    chain: "Polygon",
    status: "confirmed",
    confirmations: 128,
    requiredConfirmations: 128,
  },
  {
    txHash: "0xc5d6e7f8091a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
    timestamp: "2026-04-09 13:42:18 UTC-3",
    type: "deposit",
    from: "0xFeDcBa0987654321FeDcBa0987654321FeDcBa09",
    to: "0x8f3a21Bb5e1f4bCc9d6E8fA3B7dC2e1f6a9b3c4d",
    amount: "0.85 ETH",
    tokenSymbol: "ETH",
    chain: "Ethereum",
    status: "confirmed",
    confirmations: 14,
    requiredConfirmations: 12,
  },
  {
    txHash: "0xd6e7f8091a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
    timestamp: "2026-04-09 13:35:55 UTC-3",
    type: "withdrawal",
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    to: "0x8765432109aBcDeF8765432109AbCdEf87654321",
    amount: "15,000.00 USDC",
    tokenSymbol: "USDC",
    chain: "BSC",
    status: "confirmed",
    confirmations: 18,
    requiredConfirmations: 15,
  },
  {
    txHash: "0xe7f8091a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f809",
    timestamp: "2026-04-09 13:28:07 UTC-3",
    type: "deposit",
    from: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "50.00 BUSD",
    tokenSymbol: "BUSD",
    chain: "BSC",
    status: "confirmed",
    confirmations: 20,
    requiredConfirmations: 15,
  },
  {
    txHash: "0xf8091a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f80912",
    timestamp: "2026-04-09 13:15:44 UTC-3",
    type: "sweep",
    from: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "1,500.00 USDT",
    tokenSymbol: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    requiredConfirmations: 15,
  },
  {
    txHash: "0x091a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b",
    timestamp: "2026-04-09 12:58:22 UTC-3",
    type: "internal",
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    to: "0x8f3a21Bb5e1f4bCc9d6E8fA3B7dC2e1f6a9b3c4d",
    amount: "0.10 ETH",
    tokenSymbol: "ETH",
    chain: "Ethereum",
    status: "confirmed",
    confirmations: 18,
    requiredConfirmations: 12,
  },
  {
    txHash: "0x1a2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c",
    timestamp: "2026-04-09 12:45:11 UTC-3",
    type: "deposit",
    from: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
    to: "0xa1c9e0Dd47b3F5cA8E7d9B0f2C4a6e8D1b3f5a7c",
    amount: "500.00 MATIC",
    tokenSymbol: "MATIC",
    chain: "Polygon",
    status: "confirmed",
    confirmations: 200,
    requiredConfirmations: 128,
  },
  {
    txHash: "0x2b3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d",
    timestamp: "2026-04-09 12:30:05 UTC-3",
    type: "withdrawal",
    from: "0xa1c9e0Dd47b3F5cA8E7d9B0f2C4a6e8D1b3f5a7c",
    to: "0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db",
    amount: "8,000.00 USDT",
    tokenSymbol: "USDT",
    chain: "Polygon",
    status: "pending",
    confirmations: 45,
    requiredConfirmations: 128,
  },
  {
    txHash: "0x3c4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e",
    timestamp: "2026-04-09 12:15:33 UTC-3",
    type: "deposit",
    from: "0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "0.50 BNB",
    tokenSymbol: "BNB",
    chain: "BSC",
    status: "confirmed",
    confirmations: 30,
    requiredConfirmations: 15,
  },
  {
    txHash: "0x4d5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f",
    timestamp: "2026-04-09 11:58:17 UTC-3",
    type: "sweep",
    from: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "3,750.00 USDT",
    tokenSymbol: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    requiredConfirmations: 15,
  },
  {
    txHash: "0x5e6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70",
    timestamp: "2026-04-09 11:42:09 UTC-3",
    type: "deposit",
    from: "0x617F2E2fD72FD9D5503197092aC168c91465E7f2",
    to: "0x8f3a21Bb5e1f4bCc9d6E8fA3B7dC2e1f6a9b3c4d",
    amount: "1,200.00 USDC",
    tokenSymbol: "USDC",
    chain: "Ethereum",
    status: "confirmed",
    confirmations: 15,
    requiredConfirmations: 12,
  },
  {
    txHash: "0x6f7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7081",
    timestamp: "2026-04-09 11:25:50 UTC-3",
    type: "withdrawal",
    from: "0x8f3a21Bb5e1f4bCc9d6E8fA3B7dC2e1f6a9b3c4d",
    to: "0xDDdDddDdDdDdDDddDDddDDDDdDdDDdDDdDDDDDDd",
    amount: "500.00 USDT",
    tokenSymbol: "USDT",
    chain: "Ethereum",
    status: "failed",
    confirmations: 0,
    requiredConfirmations: 12,
  },
  {
    txHash: "0x7081920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192",
    timestamp: "2026-04-09 11:10:28 UTC-3",
    type: "deposit",
    from: "0x17F6AD8Ef982297579C203069C1DbfFE4348c372",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "25,000.00 USDT",
    tokenSymbol: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 50,
    requiredConfirmations: 15,
  },
  {
    txHash: "0x81920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70819200",
    timestamp: "2026-04-09 10:55:14 UTC-3",
    type: "internal",
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    to: "0xa1c9e0Dd47b3F5cA8E7d9B0f2C4a6e8D1b3f5a7c",
    amount: "5,000.00 USDT",
    tokenSymbol: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 55,
    requiredConfirmations: 15,
  },
  {
    txHash: "0x920a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920a1b",
    timestamp: "2026-04-09 10:38:02 UTC-3",
    type: "deposit",
    from: "0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2BDe4",
    amount: "2.00 BNB",
    tokenSymbol: "BNB",
    chain: "BSC",
    status: "confirmed",
    confirmations: 60,
    requiredConfirmations: 15,
  },
];

const mockTransactions: Record<string, MockTransaction[]> = {
  client_cxyz_001: txBase.map((tx, i) => ({
    ...tx,
    id: `tx_${i.toString().padStart(3, "0")}`,
    detail: buildDetail(tx),
  })),
};

// ─── Type icons: using semantic status colors per identity ──
const typeIcons: Record<string, { icon: React.ElementType; color: string }> = {
  deposit: { icon: ArrowDownLeft, color: "text-status-success" },
  withdrawal: { icon: ArrowUpRight, color: "text-status-error" },
  sweep: { icon: RefreshCw, color: "text-accent-primary" },
  internal: { icon: Shuffle, color: "text-text-secondary" },
};

const statusColor: Record<string, "success" | "warning" | "error"> = {
  confirmed: "success",
  pending: "warning",
  failed: "error",
};

// ─── Inline Copy helper ────────────────────────────────────
function InlineCopy({ text, display }: { text: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-caption text-text-primary cursor-pointer hover:text-accent-primary transition-colors duration-fast" title={text}>
        {display || shortenAddress(text, 6)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="text-text-muted hover:text-text-primary transition-colors duration-fast"
      >
        {copied ? <Check className="w-2.5 h-2.5 text-status-success" /> : <Copy className="w-2.5 h-2.5" />}
      </button>
    </span>
  );
}

// ─── Page Component ─────────────────────────────────────────
export default function TraceabilityPage() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [filters, setFilters] = useState<TransactionFilterState>(defaultFilters);
  const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());
  const [modalTx, setModalTx] = useState<TransactionDetail | null>(null);

  const selectedClient = mockClients.find((c) => c.id === selectedClientId);
  const clientSummary = selectedClientId ? mockClientSummary[selectedClientId] : null;
  const wallets = selectedClientId ? (mockWallets[selectedClientId] || []) : [];
  const transactions = selectedClientId ? (mockTransactions[selectedClientId] || []) : [];

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (filters.tokens.length > 0) {
      result = result.filter((tx) => filters.tokens.includes(tx.tokenSymbol));
    }
    if (filters.types.length > 0) {
      result = result.filter((tx) => filters.types.includes(tx.type));
    }
    if (filters.statuses.length > 0) {
      result = result.filter((tx) => filters.statuses.includes(tx.status));
    }
    if (filters.chain) {
      result = result.filter((tx) => tx.chain === filters.chain);
    }
    if (filters.addressSearch) {
      const search = filters.addressSearch.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.from.toLowerCase().includes(search) ||
          tx.to.toLowerCase().includes(search) ||
          tx.txHash.toLowerCase().includes(search)
      );
    }

    // Sort
    result.sort((a, b) => {
      const dir = filters.sortDir === "asc" ? 1 : -1;
      if (filters.sortBy === "date") {
        return (a.timestamp > b.timestamp ? -1 : 1) * dir;
      }
      if (filters.sortBy === "amount") {
        const amountA = parseFloat(a.amount.replace(/[^0-9.]/g, ""));
        const amountB = parseFloat(b.amount.replace(/[^0-9.]/g, ""));
        return (amountA - amountB) * dir;
      }
      return 0;
    });

    return result;
  }, [transactions, filters]);

  const toggleTxExpand = (id: string) => {
    setExpandedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredClients = mockClients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <>
      {/* ─── Page Title ──────────────────────────── */}
      <div className="flex items-center justify-between mb-section-gap">
        <div>
          <h2 className="text-heading font-display font-bold tracking-tight text-text-primary">
            Transaction Traceability
          </h2>
          <p className="text-caption font-display text-text-muted mt-0.5">
            Full transparency view -- wallets, transactions, and on-chain data for any client
          </p>
        </div>
      </div>

      {/* ─── Client Selector ─────────────────────── */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap">
        <div className="text-micro font-display font-semibold uppercase tracking-[0.06em] text-text-muted mb-2">
          Select Client
        </div>
        <div className="relative">
          <button
            onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
            className={cn(
              "w-full flex items-center justify-between bg-surface-input border rounded-input px-4 py-2.5 text-left transition-all duration-fast",
              clientDropdownOpen ? "border-border-focus" : "border-border-default hover:border-text-secondary"
            )}
          >
            {selectedClient ? (
              <div className="flex items-center gap-3">
                <span className="text-body font-display font-semibold text-text-primary">{selectedClient.name}</span>
                <Badge variant="neutral" className="text-[10px]">{selectedClient.tier}</Badge>
                <span className="text-caption text-text-muted font-mono">{selectedClient.id}</span>
              </div>
            ) : (
              <span className="text-body font-display text-text-muted">Choose a client to view traceability data...</span>
            )}
            <ChevronDown className={cn("w-4 h-4 text-text-muted transition-transform duration-normal", clientDropdownOpen && "rotate-180")} />
          </button>

          {clientDropdownOpen && (
            <>
              <div className="fixed inset-0 z-[50]" onClick={() => setClientDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface-elevated border border-border-default rounded-input z-[51] shadow-float overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
                  <Search className="w-3.5 h-3.5 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search clients..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="bg-transparent border-none text-text-primary text-caption font-display outline-none flex-1 placeholder:text-text-muted"
                    autoFocus
                  />
                </div>
                {filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClientId(client.id);
                      setClientDropdownOpen(false);
                      setClientSearch("");
                      setExpandedTxIds(new Set());
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hover transition-colors duration-fast",
                      selectedClientId === client.id && "bg-accent-glow"
                    )}
                  >
                    <span className="text-body font-display font-semibold text-text-primary">{client.name}</span>
                    <Badge variant="neutral" className="text-[10px]">{client.tier}</Badge>
                    <span className="text-[10px] text-text-muted font-mono ml-auto">{client.id}</span>
                  </button>
                ))}
                {filteredClients.length === 0 && (
                  <div className="px-4 py-3 text-caption font-display text-text-muted text-center">No clients found</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Summary Cards (grid-cols-4 + 1) ─────── */}
      {clientSummary && (
        <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap animate-fade-in">
          <StatCard label="Total Balance (USD)" value={clientSummary.totalBalanceUsd} color="accent" />
          <StatCard
            label="Crypto Holdings"
            value={clientSummary.totalBalanceCrypto.split(" + ")[0]}
            subtitle={clientSummary.totalBalanceCrypto.split(" + ").slice(1).join(" + ")}
            mono
          />
          <StatCard label="Wallets" value={`${clientSummary.activeWallets}/${clientSummary.totalWallets}`} subtitle="Active / Total" />
          <StatCard label="Total Transactions" value={clientSummary.totalTransactions.toLocaleString()} />
        </div>
      )}

      {/* ─── No client selected ──────────────────── */}
      {!selectedClientId && (
        <div className="bg-surface-card border border-border-default rounded-card p-16 text-center">
          <div className="text-text-muted text-body font-display mb-2">Select a client above to view their complete traceability data</div>
          <div className="text-text-muted text-caption font-display">Includes wallets, deposit addresses, transactions, and full on-chain details</div>
        </div>
      )}

      {/* ─── Wallets Section ─────────────────────── */}
      {selectedClientId && wallets.length > 0 && (
        <div className="mb-section-gap animate-fade-in">
          <div className="text-subheading font-display font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
            Wallets
          </div>
          <WalletAccordion wallets={wallets} />
        </div>
      )}

      {/* ─── Transactions Section ────────────────── */}
      {selectedClientId && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-subheading font-display font-semibold text-text-secondary uppercase tracking-[0.05em]">
              Transactions
            </span>
            <Badge variant="neutral" className="text-[10px]">{filteredTransactions.length} results</Badge>
          </div>

          {/* Filters */}
          <TransactionFilters filters={filters} onChange={setFilters} />

          {/* Transaction Table */}
          <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
            {/* Table header */}
            <div className="grid grid-cols-[32px_160px_80px_1fr_120px_70px_80px_80px_100px] gap-2 items-center px-4 py-2.5 bg-surface-elevated border-b border-border-subtle">
              <div />
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Date / Time</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Type</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">From / To</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Amount</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Chain</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Status</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Confirms</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Tx Hash</div>
            </div>

            {/* Table rows */}
            <div className="max-h-[600px] overflow-y-auto">
              {filteredTransactions.length === 0 && (
                <div className="px-4 py-8 text-center text-body font-display text-text-muted">
                  No transactions match the current filters
                </div>
              )}
              {filteredTransactions.map((tx) => {
                const isExpanded = expandedTxIds.has(tx.id);
                const TypeIcon = typeIcons[tx.type]?.icon || ArrowDownLeft;
                const typeColor = typeIcons[tx.type]?.color || "text-text-secondary";

                // Amount color: deposit/sweep = success (green), withdrawal = error (red), internal = muted
                const amountColor =
                  tx.type === "deposit" || tx.type === "sweep"
                    ? "text-status-success"
                    : tx.type === "withdrawal"
                    ? "text-status-error"
                    : "text-text-secondary";

                const amountPrefix =
                  tx.type === "deposit" || tx.type === "sweep"
                    ? "+"
                    : tx.type === "withdrawal"
                    ? "-"
                    : "";

                return (
                  <div key={tx.id} className="border-b border-border-subtle last:border-b-0">
                    {/* Row */}
                    <button
                      onClick={() => toggleTxExpand(tx.id)}
                      className="w-full grid grid-cols-[32px_160px_80px_1fr_120px_70px_80px_80px_100px] gap-2 items-center px-4 py-2.5 text-left hover:bg-surface-hover transition-colors duration-fast"
                    >
                      {/* Expand icon */}
                      <div>
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-text-muted transition-transform duration-normal",
                            !isExpanded && "-rotate-90"
                          )}
                        />
                      </div>

                      {/* Timestamp */}
                      <div className="font-mono text-caption text-text-secondary">
                        {tx.timestamp}
                      </div>

                      {/* Type */}
                      <div className={cn("flex items-center gap-1 text-caption font-display font-semibold", typeColor)}>
                        <TypeIcon className="w-3 h-3" />
                        {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                      </div>

                      {/* From -> To */}
                      <div className="flex items-center gap-1 text-caption min-w-0 overflow-hidden">
                        <InlineCopy text={tx.from} />
                        <span className="text-text-muted mx-0.5 font-display">{"\u2192"}</span>
                        <InlineCopy text={tx.to} />
                      </div>

                      {/* Amount */}
                      <div className={cn("font-mono text-caption font-semibold", amountColor)}>
                        {amountPrefix}{tx.amount}
                      </div>

                      {/* Chain */}
                      <div className="text-micro font-display font-bold uppercase tracking-[0.05em] text-text-secondary">
                        {tx.chain}
                      </div>

                      {/* Status */}
                      <div>
                        <Badge variant={statusColor[tx.status] || "neutral"} dot className="text-[10px]">
                          {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                        </Badge>
                      </div>

                      {/* Confirmations */}
                      <div className="font-mono text-[10px] text-text-muted">
                        {tx.confirmations}/{tx.requiredConfirmations}
                      </div>

                      {/* Tx hash */}
                      <div
                        className="font-mono text-[10px] text-accent-primary cursor-pointer hover:text-accent-hover truncate transition-colors duration-fast"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalTx(tx.detail);
                        }}
                        title={tx.txHash}
                      >
                        {shortenAddress(tx.txHash, 6)}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-12 pb-4 animate-fade-in">
                        <div className="text-micro font-display text-text-muted uppercase tracking-[0.06em] mb-2">Full Transaction JSON</div>
                        <JsonViewer data={tx.detail} maxHeight="300px" />
                        <button
                          onClick={() => setModalTx(tx.detail)}
                          className="mt-3 bg-accent-primary text-accent-text text-caption font-display font-semibold px-4 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast"
                        >
                          Open Full Details
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Transaction Modal ───────────────────── */}
      <TransactionModal transaction={modalTx} onClose={() => setModalTx(null)} />
    </>
  );
}
