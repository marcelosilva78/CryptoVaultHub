// ─── Client Info ───────────────────────────────────────────────
export const clientInfo = {
  name: "Corretora XYZ",
  tier: "Business",
  user: {
    name: "Operador Admin",
    initials: "OP",
    role: "Owner",
  },
};

// ─── Dashboard KPIs ────────────────────────────────────────────
export const dashboardKPIs = {
  totalBalance: 847200,
  totalBalanceSub: "Across 3 chains",
  deposits24h: 123400,
  deposits24hSub: "247 transactions",
  withdrawals24h: 45800,
  withdrawals24hSub: "18 transactions",
  activeAddresses: 2340,
  activeAddressesSub: "of 12,430 total",
};

// ─── Balance by Token ──────────────────────────────────────────
export const balancesByToken = [
  { token: "USDT", chain: "BSC", balance: "500,000.00", usdValue: "$500,000" },
  { token: "USDC", chain: "BSC", balance: "340,000.00", usdValue: "$340,000" },
  { token: "BNB", chain: "BSC", balance: "12.50", usdValue: "$3,750" },
  { token: "ETH", chain: "Ethereum", balance: "1.20", usdValue: "$3,600" },
  { token: "MATIC", chain: "Polygon", balance: "1,250.00", usdValue: "$850" },
];

// ─── Balance History (for chart) ───────────────────────────────
export interface BalanceHistoryPoint {
  date: string;
  balance: number;
  deposits: number;
  withdrawals: number;
}

export const balanceHistory: BalanceHistoryPoint[] = [
  { date: "Mar 10", balance: 612000, deposits: 45000, withdrawals: 12000 },
  { date: "Mar 13", balance: 635000, deposits: 38000, withdrawals: 15000 },
  { date: "Mar 16", balance: 658000, deposits: 52000, withdrawals: 29000 },
  { date: "Mar 19", balance: 671000, deposits: 41000, withdrawals: 28000 },
  { date: "Mar 22", balance: 694000, deposits: 60000, withdrawals: 37000 },
  { date: "Mar 25", balance: 710000, deposits: 33000, withdrawals: 17000 },
  { date: "Mar 28", balance: 738000, deposits: 55000, withdrawals: 27000 },
  { date: "Mar 31", balance: 762000, deposits: 48000, withdrawals: 24000 },
  { date: "Apr 03", balance: 795000, deposits: 61000, withdrawals: 28000 },
  { date: "Apr 06", balance: 821000, deposits: 43000, withdrawals: 17000 },
  { date: "Apr 09", balance: 847200, deposits: 38000, withdrawals: 11800 },
];

// ─── Recent Activity ───────────────────────────────────────────
export type ActivityType = "Deposit" | "Sweep" | "Withdraw";
export interface ActivityItem {
  time: string;
  type: ActivityType;
  amount: string;
  chain: string;
}

export const recentActivity: ActivityItem[] = [
  { time: "14:02", type: "Deposit", amount: "+100.00 USDT", chain: "BSC" },
  { time: "13:58", type: "Sweep", amount: "100.00 USDT swept", chain: "BSC" },
  { time: "13:45", type: "Withdraw", amount: "-500.00 USDT", chain: "BSC" },
  { time: "13:30", type: "Deposit", amount: "+0.85 ETH", chain: "ETH" },
  { time: "13:12", type: "Deposit", amount: "+50.00 USDC", chain: "POLY" },
  { time: "12:55", type: "Withdraw", amount: "-1,200.00 USDC", chain: "BSC" },
  { time: "12:40", type: "Deposit", amount: "+2,500.00 USDT", chain: "BSC" },
  { time: "12:22", type: "Sweep", amount: "2,500.00 USDT swept", chain: "BSC" },
  { time: "12:05", type: "Deposit", amount: "+320.00 USDC", chain: "ETH" },
  { time: "11:48", type: "Withdraw", amount: "-15,000.00 USDT", chain: "BSC" },
];

// ─── Plan Usage ────────────────────────────────────────────────
export interface PlanUsageItem {
  label: string;
  current: string;
  max: string;
  percent: number;
  color: string;
}

export const planUsage: PlanUsageItem[] = [
  { label: "API Requests/s", current: "65", max: "100", percent: 65, color: "bg-cvh-accent" },
  { label: "Forwarders", current: "12,430", max: "50,000", percent: 25, color: "bg-cvh-green" },
  { label: "Daily Withdrawal", current: "$45.8K", max: "$500K", percent: 9, color: "bg-cvh-green" },
  { label: "Webhooks", current: "2", max: "10", percent: 20, color: "bg-cvh-green" },
];

// ─── Wallets (Deposit Addresses) ───────────────────────────────
export const walletKPIs = {
  totalAddresses: 12430,
  withBalance: 3201,
  pendingSweep: 89,
};

export interface WalletAddress {
  address: string;
  addressFull: string;
  label: string;
  externalId: string;
  chain: string;
  balance: string;
  balanceUsd: string;
  hasBalance: boolean;
  deployed: boolean;
  lastDeposit: string;
  createdAt: string;
  depositCount: number;
  forwarderAddresses: string[];
  tokens: string[];
}

export const walletAddresses: WalletAddress[] = [
  { address: "0x742d35Cc...4f2a", addressFull: "0x742d35Cc6634C0532925a3b844Bc9e7595f4f2a", label: "Joao Silva", externalId: "user-joao-123", chain: "BSC", balance: "100 USDT", balanceUsd: "$100.00", hasBalance: true, deployed: true, lastDeposit: "Apr 8, 14:02", createdAt: "Jan 15, 2026", depositCount: 47, forwarderAddresses: ["0x9a2B...c3d1"], tokens: ["USDT", "USDC", "BNB"] },
  { address: "0x8f3a21Bb...9e1c", addressFull: "0x8f3a21BbE45d7C8a92F6319Ae94Cd4bF5729e1c", label: "Maria Santos", externalId: "user-maria-456", chain: "ETH", balance: "0.85 ETH", balanceUsd: "$2,550.00", hasBalance: true, deployed: true, lastDeposit: "Apr 8, 13:30", createdAt: "Feb 02, 2026", depositCount: 23, forwarderAddresses: ["0x1f4E...a8b2"], tokens: ["ETH", "USDT", "USDC"] },
  { address: "0xa1c9e0Dd...7b3f", addressFull: "0xa1c9e0DdF7283bA5c1E24d9087aB3Ff41C07b3f", label: "Pedro Lima", externalId: "user-pedro-789", chain: "Polygon", balance: "0", balanceUsd: "$0.00", hasBalance: false, deployed: false, lastDeposit: "Apr 8, 13:12", createdAt: "Mar 05, 2026", depositCount: 5, forwarderAddresses: [], tokens: ["USDC", "MATIC"] },
  { address: "0xb4e7f2Aa...3d5e", addressFull: "0xb4e7f2Aa8c21D5E49f0B76A3C84192eF6a03d5e", label: "Ana Costa", externalId: "user-ana-012", chain: "BSC", balance: "0", balanceUsd: "$0.00", hasBalance: false, deployed: false, lastDeposit: "Never", createdAt: "Apr 01, 2026", depositCount: 0, forwarderAddresses: [], tokens: ["USDT", "BNB"] },
  { address: "0xc3f8d1Ee...9a0b", addressFull: "0xc3f8d1Ee2Ba7F94D6c51a38e0d7E6A21C589a0b", label: "Carlos Oliveira", externalId: "user-carlos-345", chain: "BSC", balance: "2,500 USDT", balanceUsd: "$2,500.00", hasBalance: true, deployed: true, lastDeposit: "Apr 8, 12:45", createdAt: "Jan 20, 2026", depositCount: 89, forwarderAddresses: ["0x6c9A...e2f3", "0xd4B1...7a8c"], tokens: ["USDT", "USDC", "BNB", "BUSD"] },
  { address: "0xd5a2c8Ff...1b4e", addressFull: "0xd5a2c8Ff3D914B7C0e28aF51d6E8C2a09D01b4e", label: "Lucas Mendes", externalId: "user-lucas-678", chain: "ETH", balance: "1.42 ETH", balanceUsd: "$4,260.00", hasBalance: true, deployed: true, lastDeposit: "Apr 7, 18:30", createdAt: "Feb 14, 2026", depositCount: 31, forwarderAddresses: ["0x8e2D...b5c1"], tokens: ["ETH", "USDT"] },
  { address: "0xe6b3d9Aa...2c5f", addressFull: "0xe6b3d9Aa1E0A5C8D2f39B60e7F9D3b1A2E02c5f", label: "Fernanda Rocha", externalId: "user-fernanda-901", chain: "BSC", balance: "15,200 USDT", balanceUsd: "$15,200.00", hasBalance: true, deployed: true, lastDeposit: "Apr 9, 08:15", createdAt: "Dec 20, 2025", depositCount: 156, forwarderAddresses: ["0x3a7B...d1e4", "0x5f2C...a9b3", "0x7d4E...c8f2"], tokens: ["USDT", "USDC", "BNB"] },
  { address: "0xf7c4e0Bb...3d6a", addressFull: "0xf7c4e0Bb2F1B6D9E3a40C71f8A0E4c2B3F13d6a", label: "Ricardo Alves", externalId: "user-ricardo-234", chain: "Polygon", balance: "850 MATIC", balanceUsd: "$578.00", hasBalance: true, deployed: true, lastDeposit: "Apr 7, 11:20", createdAt: "Mar 12, 2026", depositCount: 12, forwarderAddresses: ["0x2b8C...e5f1"], tokens: ["MATIC", "USDC"] },
];

// ─── Deposits ──────────────────────────────────────────────────
export const depositKPIs = {
  deposits24h: 247,
  volume24h: 123400,
  confirmingNow: 12,
};

export interface Deposit {
  date: string;
  address: string;
  externalId: string;
  token: string;
  amount: string;
  confirmations: number;
  confirmationsRequired: number;
  status: "Confirming" | "Confirmed";
  txHash: string;
  chain: string;
}

export const deposits: Deposit[] = [
  { date: "Apr 9, 08:15", address: "0xe6b3...2c5f", externalId: "user-fernanda-901", token: "USDT", amount: "+3,200.00", confirmations: 4, confirmationsRequired: 12, status: "Confirming", txHash: "0xf1e2...3d4c", chain: "BSC" },
  { date: "Apr 8, 14:02", address: "0x742d...4f2a", externalId: "user-joao-123", token: "USDT", amount: "+100.00", confirmations: 8, confirmationsRequired: 12, status: "Confirming", txHash: "0xabc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1", chain: "BSC" },
  { date: "Apr 8, 13:30", address: "0x8f3a...9e1c", externalId: "user-maria-456", token: "ETH", amount: "+0.85", confirmations: 12, confirmationsRequired: 12, status: "Confirmed", txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", chain: "ETH" },
  { date: "Apr 8, 13:12", address: "0xa1c9...7b3f", externalId: "user-pedro-789", token: "USDC", amount: "+50.00", confirmations: 128, confirmationsRequired: 128, status: "Confirmed", txHash: "0x789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567", chain: "Polygon" },
  { date: "Apr 8, 12:45", address: "0xb4e7...3d5e", externalId: "user-ana-012", token: "USDT", amount: "+2,500.00", confirmations: 15, confirmationsRequired: 15, status: "Confirmed", txHash: "0xdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd", chain: "BSC" },
  { date: "Apr 7, 18:30", address: "0xd5a2...1b4e", externalId: "user-lucas-678", token: "ETH", amount: "+1.42", confirmations: 12, confirmationsRequired: 12, status: "Confirmed", txHash: "0x5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b", chain: "ETH" },
  { date: "Apr 7, 11:20", address: "0xf7c4...3d6a", externalId: "user-ricardo-234", token: "MATIC", amount: "+850.00", confirmations: 128, confirmationsRequired: 128, status: "Confirmed", txHash: "0x9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", chain: "Polygon" },
  { date: "Apr 6, 22:10", address: "0xe6b3...2c5f", externalId: "user-fernanda-901", token: "USDC", amount: "+12,000.00", confirmations: 15, confirmationsRequired: 15, status: "Confirmed", txHash: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c", chain: "BSC" },
];

// ─── Withdrawals ───────────────────────────────────────────────
export interface Withdrawal {
  date: string;
  destinationLabel: string;
  destinationAddr: string;
  token: string;
  amount: string;
  status: "Confirmed" | "Confirming" | "Pending";
  chain: string;
  txHash: string;
}

export const withdrawals: Withdrawal[] = [
  { date: "Apr 8, 13:45", destinationLabel: "Binance Hot", destinationAddr: "0xDEF1...2345", token: "USDT", amount: "-500.00", status: "Confirmed", chain: "BSC", txHash: "0xaa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b" },
  { date: "Apr 8, 12:30", destinationLabel: "Carteira Fria", destinationAddr: "0xABC9...8765", token: "ETH", amount: "-10.00", status: "Confirming", chain: "ETH", txHash: "0xbb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c" },
  { date: "Apr 7, 18:00", destinationLabel: "Fornecedor X", destinationAddr: "0x1234...5678", token: "USDC", amount: "-1,200.00", status: "Confirmed", chain: "BSC", txHash: "0xcc3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d" },
  { date: "Apr 7, 14:20", destinationLabel: "Binance Hot", destinationAddr: "0xDEF1...2345", token: "USDT", amount: "-25,000.00", status: "Confirmed", chain: "BSC", txHash: "0xdd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e" },
  { date: "Apr 6, 09:15", destinationLabel: "Carteira Fria", destinationAddr: "0xABC9...8765", token: "USDT", amount: "-50,000.00", status: "Confirmed", chain: "BSC", txHash: "0xee5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f" },
  { date: "Apr 5, 16:40", destinationLabel: "Fornecedor X", destinationAddr: "0x1234...5678", token: "MATIC", amount: "-5,000.00", status: "Confirmed", chain: "Polygon", txHash: "0xff6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a" },
];

export const withdrawalDestinations = [
  { label: "Binance Hot", address: "0xDEF1...2345" },
  { label: "Carteira Fria", address: "0xABC9...8765" },
  { label: "Fornecedor X", address: "0x1234...5678" },
];

// ─── Transactions (Full Traceability) ──────────────────────────
export type TransactionType = "deposit" | "withdrawal" | "sweep";
export type TransactionStatus = "pending" | "confirming" | "confirmed" | "failed";

export interface Transaction {
  id: string;
  timestamp: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: string;
  amountRaw: number;
  token: string;
  chain: string;
  status: TransactionStatus;
  confirmations: number;
  confirmationsRequired: number;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  gasUsed: string;
  gasPrice: string;
  gasCostUsd: string;
  nonce: number;
  contractAddress: string | null;
  eventLogs: { event: string; args: Record<string, string> }[];
  rawJson: Record<string, unknown>;
}

export const transactionSummary = {
  totalVolumeIn: "$168,242.00",
  totalVolumeOut: "$81,700.00",
  transactionCount: 18,
  avgConfirmationTime: "2m 34s",
};

export const transactions: Transaction[] = [
  {
    id: "TX-001",
    timestamp: "2026-04-09T08:15:22Z",
    type: "deposit",
    from: "0x9f8E7d6C5b4A3c2D1e0F9a8B7c6D5e4F3a2B1c0D",
    to: "0xe6b3d9Aa1E0A5C8D2f39B60e7F9D3b1A2E02c5f",
    amount: "+3,200.00",
    amountRaw: 3200,
    token: "USDT",
    chain: "BSC",
    status: "confirming",
    confirmations: 4,
    confirmationsRequired: 12,
    txHash: "0xf1e2d3c4b5a6978867564534231201f0e9d8c7b6a5948372615040302010f0e9",
    blockNumber: 42891234,
    blockHash: "0x0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
    gasUsed: "65,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.14",
    nonce: 1847,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0x9f8E...1c0D", to: "0xe6b3...2c5f", value: "3200000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2", accessList: [], maxFeePerGas: "3000000000", maxPriorityFeePerGas: "1000000000" },
  },
  {
    id: "TX-002",
    timestamp: "2026-04-08T14:02:11Z",
    type: "deposit",
    from: "0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9a0B",
    to: "0x742d35Cc6634C0532925a3b844Bc9e7595f4f2a",
    amount: "+100.00",
    amountRaw: 100,
    token: "USDT",
    chain: "BSC",
    status: "confirming",
    confirmations: 8,
    confirmationsRequired: 12,
    txHash: "0xabc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
    blockNumber: 42890987,
    blockHash: "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
    gasUsed: "52,341",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.11",
    nonce: 2103,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0x1a2B...9a0B", to: "0x742d...4f2a", value: "100000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2", accessList: [], maxFeePerGas: "3000000000", maxPriorityFeePerGas: "1000000000" },
  },
  {
    id: "TX-003",
    timestamp: "2026-04-08T13:58:44Z",
    type: "sweep",
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f4f2a",
    to: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    amount: "100.00",
    amountRaw: 100,
    token: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xbbb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    blockNumber: 42890990,
    blockHash: "0x2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
    gasUsed: "78,412",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.17",
    nonce: 445,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0x742d...4f2a", to: "0xMaster...f4f", value: "100000000000000000000" } },
      { event: "Forwarded", args: { forwarder: "0x742d...4f2a", amount: "100000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2", input: "0xa9059cbb...", accessList: [] },
  },
  {
    id: "TX-004",
    timestamp: "2026-04-08T13:45:30Z",
    type: "withdrawal",
    from: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    to: "0xDEF12345678901234567890123456789012345",
    amount: "-500.00",
    amountRaw: 500,
    token: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xaa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
    blockNumber: 42890985,
    blockHash: "0x3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
    gasUsed: "52,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.11",
    nonce: 446,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0xMaster...f4f", to: "0xDEF1...2345", value: "500000000000000000000" } },
      { event: "WithdrawalExecuted", args: { destination: "0xDEF1...2345", amount: "500000000000000000000", token: "USDT" } },
    ],
    rawJson: { chainId: 56, type: "0x2", accessList: [], batchIndex: 0, batchSize: 1 },
  },
  {
    id: "TX-005",
    timestamp: "2026-04-08T13:30:15Z",
    type: "deposit",
    from: "0x4c5D6e7F8a9B0c1D2e3F4a5B6c7D8e9F0a1B2c3D",
    to: "0x8f3a21BbE45d7C8a92F6319Ae94Cd4bF5729e1c",
    amount: "+0.85",
    amountRaw: 0.85,
    token: "ETH",
    chain: "ETH",
    status: "confirmed",
    confirmations: 12,
    confirmationsRequired: 12,
    txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: 19845672,
    blockHash: "0x4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f",
    gasUsed: "21,000",
    gasPrice: "18 Gwei",
    gasCostUsd: "$1.14",
    nonce: 89,
    contractAddress: null,
    eventLogs: [],
    rawJson: { chainId: 1, type: "0x2", accessList: [], maxFeePerGas: "20000000000", maxPriorityFeePerGas: "2000000000" },
  },
  {
    id: "TX-006",
    timestamp: "2026-04-08T13:12:05Z",
    type: "deposit",
    from: "0x5d6E7f8A9b0C1d2E3f4A5b6C7d8E9f0A1b2C3d4E",
    to: "0xa1c9e0DdF7283bA5c1E24d9087aB3Ff41C07b3f",
    amount: "+50.00",
    amountRaw: 50,
    token: "USDC",
    chain: "Polygon",
    status: "confirmed",
    confirmations: 128,
    confirmationsRequired: 128,
    txHash: "0x789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567",
    blockNumber: 56789012,
    blockHash: "0x5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
    gasUsed: "65,200",
    gasPrice: "35 Gwei",
    gasCostUsd: "$0.03",
    nonce: 342,
    contractAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    eventLogs: [
      { event: "Transfer", args: { from: "0x5d6E...3d4E", to: "0xa1c9...7b3f", value: "50000000" } },
    ],
    rawJson: { chainId: 137, type: "0x2", accessList: [] },
  },
  {
    id: "TX-007",
    timestamp: "2026-04-08T12:55:00Z",
    type: "withdrawal",
    from: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    to: "0x1234567890abcdef1234567890abcdef12345678",
    amount: "-1,200.00",
    amountRaw: 1200,
    token: "USDC",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xcc3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
    blockNumber: 42890940,
    blockHash: "0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
    gasUsed: "52,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.11",
    nonce: 444,
    contractAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    eventLogs: [
      { event: "Transfer", args: { from: "0xMaster...f4f", to: "0x1234...5678", value: "1200000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2", accessList: [] },
  },
  {
    id: "TX-008",
    timestamp: "2026-04-08T12:45:00Z",
    type: "deposit",
    from: "0x6e7F8a9B0c1D2e3F4a5B6c7D8e9F0a1B2c3D4e5F",
    to: "0xb4e7f2Aa8c21D5E49f0B76A3C84192eF6a03d5e",
    amount: "+2,500.00",
    amountRaw: 2500,
    token: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd",
    blockNumber: 42890920,
    blockHash: "0x7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c",
    gasUsed: "65,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.14",
    nonce: 998,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0x6e7F...4e5F", to: "0xb4e7...3d5e", value: "2500000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2", accessList: [] },
  },
  {
    id: "TX-009",
    timestamp: "2026-04-08T12:40:00Z",
    type: "sweep",
    from: "0xb4e7f2Aa8c21D5E49f0B76A3C84192eF6a03d5e",
    to: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    amount: "2,500.00",
    amountRaw: 2500,
    token: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xeee123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde",
    blockNumber: 42890925,
    blockHash: "0x8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d",
    gasUsed: "78,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.17",
    nonce: 110,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0xb4e7...3d5e", to: "0xMaster...f4f", value: "2500000000000000000000" } },
      { event: "Forwarded", args: { forwarder: "0xb4e7...3d5e", amount: "2500000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2", input: "0xa9059cbb..." },
  },
  {
    id: "TX-010",
    timestamp: "2026-04-07T18:30:00Z",
    type: "deposit",
    from: "0x7f8A9b0C1d2E3f4A5b6C7d8E9f0A1b2C3d4E5f6A",
    to: "0xd5a2c8Ff3D914B7C0e28aF51d6E8C2a09D01b4e",
    amount: "+1.42",
    amountRaw: 1.42,
    token: "ETH",
    chain: "ETH",
    status: "confirmed",
    confirmations: 12,
    confirmationsRequired: 12,
    txHash: "0x5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b",
    blockNumber: 19845500,
    blockHash: "0x9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e",
    gasUsed: "21,000",
    gasPrice: "15 Gwei",
    gasCostUsd: "$0.95",
    nonce: 1204,
    contractAddress: null,
    eventLogs: [],
    rawJson: { chainId: 1, type: "0x2", accessList: [] },
  },
  {
    id: "TX-011",
    timestamp: "2026-04-07T18:00:00Z",
    type: "withdrawal",
    from: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    to: "0x1234567890abcdef1234567890abcdef12345678",
    amount: "-1,200.00",
    amountRaw: 1200,
    token: "USDC",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xcc3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
    blockNumber: 42888500,
    blockHash: "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    gasUsed: "52,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.11",
    nonce: 442,
    contractAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    eventLogs: [
      { event: "Transfer", args: { from: "0xMaster...f4f", to: "0x1234...5678", value: "1200000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2" },
  },
  {
    id: "TX-012",
    timestamp: "2026-04-07T14:20:00Z",
    type: "withdrawal",
    from: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    to: "0xDEF12345678901234567890123456789012345",
    amount: "-25,000.00",
    amountRaw: 25000,
    token: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xdd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
    blockNumber: 42887800,
    blockHash: "0xb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    gasUsed: "52,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.11",
    nonce: 441,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0xMaster...f4f", to: "0xDEF1...2345", value: "25000000000000000000000" } },
      { event: "WithdrawalExecuted", args: { destination: "0xDEF1...2345", amount: "25000000000000000000000", token: "USDT" } },
    ],
    rawJson: { chainId: 56, type: "0x2", batchIndex: 0, batchSize: 3 },
  },
  {
    id: "TX-013",
    timestamp: "2026-04-07T11:20:00Z",
    type: "deposit",
    from: "0x8a9B0c1D2e3F4a5B6c7D8e9F0a1B2c3D4e5F6a7B",
    to: "0xf7c4e0Bb2F1B6D9E3a40C71f8A0E4c2B3F13d6a",
    amount: "+850.00",
    amountRaw: 850,
    token: "MATIC",
    chain: "Polygon",
    status: "confirmed",
    confirmations: 128,
    confirmationsRequired: 128,
    txHash: "0x9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    blockNumber: 56785000,
    blockHash: "0xc3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    gasUsed: "65,200",
    gasPrice: "35 Gwei",
    gasCostUsd: "$0.03",
    nonce: 567,
    contractAddress: null,
    eventLogs: [],
    rawJson: { chainId: 137, type: "0x2" },
  },
  {
    id: "TX-014",
    timestamp: "2026-04-06T22:10:00Z",
    type: "deposit",
    from: "0x9b0C1d2E3f4A5b6C7d8E9f0A1b2C3d4E5f6A7b8C",
    to: "0xe6b3d9Aa1E0A5C8D2f39B60e7F9D3b1A2E02c5f",
    amount: "+12,000.00",
    amountRaw: 12000,
    token: "USDC",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
    blockNumber: 42885000,
    blockHash: "0xd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
    gasUsed: "65,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.14",
    nonce: 887,
    contractAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    eventLogs: [
      { event: "Transfer", args: { from: "0x9b0C...7b8C", to: "0xe6b3...2c5f", value: "12000000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2" },
  },
  {
    id: "TX-015",
    timestamp: "2026-04-06T09:15:00Z",
    type: "withdrawal",
    from: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    to: "0xABC9876543210fedcba9876543210fedcba98765",
    amount: "-50,000.00",
    amountRaw: 50000,
    token: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0xee5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f",
    blockNumber: 42882000,
    blockHash: "0xe5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
    gasUsed: "52,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.11",
    nonce: 440,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0xMaster...f4f", to: "0xABC9...8765", value: "50000000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2" },
  },
  {
    id: "TX-016",
    timestamp: "2026-04-05T16:40:00Z",
    type: "withdrawal",
    from: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    to: "0x1234567890abcdef1234567890abcdef12345678",
    amount: "-5,000.00",
    amountRaw: 5000,
    token: "MATIC",
    chain: "Polygon",
    status: "confirmed",
    confirmations: 128,
    confirmationsRequired: 128,
    txHash: "0xff6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
    blockNumber: 56780000,
    blockHash: "0xf6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    gasUsed: "65,000",
    gasPrice: "40 Gwei",
    gasCostUsd: "$0.04",
    nonce: 120,
    contractAddress: null,
    eventLogs: [],
    rawJson: { chainId: 137, type: "0x2" },
  },
  {
    id: "TX-017",
    timestamp: "2026-04-08T12:30:00Z",
    type: "withdrawal",
    from: "0xMasterWallet0001C0532925a3b844Bc9e7595f4f",
    to: "0xABC9876543210fedcba9876543210fedcba98765",
    amount: "-10.00",
    amountRaw: 10,
    token: "ETH",
    chain: "ETH",
    status: "confirming",
    confirmations: 6,
    confirmationsRequired: 12,
    txHash: "0xbb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
    blockNumber: 19845650,
    blockHash: "0xa7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
    gasUsed: "21,000",
    gasPrice: "18 Gwei",
    gasCostUsd: "$1.14",
    nonce: 90,
    contractAddress: null,
    eventLogs: [],
    rawJson: { chainId: 1, type: "0x2" },
  },
  {
    id: "TX-018",
    timestamp: "2026-04-04T10:00:00Z",
    type: "deposit",
    from: "0xa0B1c2D3e4F5a6B7c8D9e0F1a2B3c4D5e6F7a8B9",
    to: "0xc3f8d1Ee2Ba7F94D6c51a38e0d7E6A21C589a0b",
    amount: "+8,400.00",
    amountRaw: 8400,
    token: "USDT",
    chain: "BSC",
    status: "confirmed",
    confirmations: 15,
    confirmationsRequired: 15,
    txHash: "0x111213141516171819202122232425262728293031323334353637383940414243",
    blockNumber: 42878000,
    blockHash: "0xb8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9",
    gasUsed: "65,000",
    gasPrice: "3 Gwei",
    gasCostUsd: "$0.14",
    nonce: 2001,
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    eventLogs: [
      { event: "Transfer", args: { from: "0xa0B1...a8B9", to: "0xc3f8...9a0b", value: "8400000000000000000000" } },
    ],
    rawJson: { chainId: 56, type: "0x2" },
  },
];

// ─── Address Book ──────────────────────────────────────────────
export interface WhitelistedAddress {
  label: string;
  address: string;
  chain: string;
  added: string;
  status: "Active" | string; // string for "Cooldown Xh Xm"
  withdrawals: number;
}

export const addressBook: WhitelistedAddress[] = [
  { label: "Binance Hot", address: "0xDEF1...2345", chain: "BSC", added: "Jan 15, 2026", status: "Active", withdrawals: 142 },
  { label: "Carteira Fria", address: "0xABC9...8765", chain: "All EVM", added: "Jan 15, 2026", status: "Active", withdrawals: 28 },
  { label: "Fornecedor X", address: "0x1234...5678", chain: "BSC", added: "Mar 20, 2026", status: "Active", withdrawals: 5 },
  { label: "Nova Parceria", address: "0x9876...abcd", chain: "ETH", added: "Apr 8, 2026", status: "Cooldown 22h14m", withdrawals: 0 },
];

// ─── Webhooks ──────────────────────────────────────────────────
export const webhookConfig = {
  name: "Production Endpoint",
  url: "https://api.corretora.xyz/callbacks/crypto",
  secret: "cvh_whsec_\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF",
  successRate: 99.2,
  active: true,
};

export const webhookEvents = [
  { name: "deposit.pending", enabled: true },
  { name: "deposit.confirmation", enabled: true },
  { name: "deposit.confirmed", enabled: true },
  { name: "deposit.swept", enabled: false },
  { name: "deposit.reverted", enabled: true },
  { name: "withdrawal.submitted", enabled: true },
  { name: "withdrawal.confirmed", enabled: true },
  { name: "withdrawal.failed", enabled: true },
  { name: "gas_tank.low", enabled: false },
];

export interface WebhookDelivery {
  id: string;
  event: string;
  httpStatus: number;
  latency: string;
  attempts: string;
  status: "Sent" | "Failed";
  failed: boolean;
}

export const webhookDeliveries: WebhookDelivery[] = [
  { id: "DLV-20260408-140215-X7K", event: "deposit.confirmed", httpStatus: 200, latency: "156ms", attempts: "1/1", status: "Sent", failed: false },
  { id: "DLV-20260408-134500-M2P", event: "withdrawal.confirmed", httpStatus: 200, latency: "203ms", attempts: "1/1", status: "Sent", failed: false },
  { id: "DLV-20260407-180000-R9Q", event: "deposit.confirmed", httpStatus: 502, latency: "10,000ms", attempts: "5/5", status: "Failed", failed: true },
];

// ─── API Keys ──────────────────────────────────────────────────
export interface ApiKey {
  key: string;
  label: string;
  scopes: { name: string; color: "blue" | "green" | "orange" }[];
  ipAllowlist: string;
  lastUsed: string;
  requests24h: string;
}

export const apiKeys: ApiKey[] = [
  {
    key: "cvh_live_a1b2\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF",
    label: "Production",
    scopes: [
      { name: "read", color: "blue" },
      { name: "write", color: "green" },
      { name: "withdraw", color: "orange" },
    ],
    ipAllowlist: "203.0.113.0/24",
    lastUsed: "2 min ago",
    requests24h: "48,291",
  },
  {
    key: "cvh_live_c3d4\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF",
    label: "Staging",
    scopes: [
      { name: "read", color: "blue" },
      { name: "write", color: "green" },
    ],
    ipAllowlist: "Any",
    lastUsed: "3h ago",
    requests24h: "1,247",
  },
];

// ─── Security ──────────────────────────────────────────────────
export type CustodyMode = "full" | "cosign" | "client-init";

export const custodyModes = [
  { id: "full" as CustodyMode, label: "Full Custody", desc: "CVH manages both keys" },
  { id: "cosign" as CustodyMode, label: "Co-Sign", desc: "Both parties sign" },
  { id: "client-init" as CustodyMode, label: "Client-Init", desc: "You initiate, CVH approves" },
];

export const shamirShares = [
  { name: "Share 1 — Client Primary", status: "Downloaded", color: "green" as const },
  { name: "Share 2 — CVH Admin", status: "Stored", color: "green" as const },
  { name: "Share 3 — Cold Storage", status: "Exported", color: "green" as const },
  { name: "Share 4 — Client Secondary", status: "Pending Download", color: "orange" as const },
  { name: "Share 5 — Physical Vault", status: "Stored", color: "green" as const },
];

// ─── Nav Items ─────────────────────────────────────────────────
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/", icon: "\u25C9" },
      { label: "Setup Wizard", href: "/setup", icon: "\u2726" },
      { label: "Wallets", href: "/wallets", icon: "\u25CE" },
      { label: "Transactions", href: "/transactions", icon: "\u2B82" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Deposits", href: "/deposits", icon: "\u2193", badge: 12 },
      { label: "Withdrawals", href: "/withdrawals", icon: "\u2191" },
      { label: "Address Book", href: "/addresses", icon: "\u25C7" },
    ],
  },
  {
    title: "Integration",
    items: [
      { label: "Webhooks", href: "/webhooks", icon: "\u26A1" },
      { label: "API Keys", href: "/api-keys", icon: "\uD83D\uDD11" },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Security", href: "/security", icon: "\uD83D\uDEE1" },
    ],
  },
];
