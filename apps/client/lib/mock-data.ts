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
  label: string;
  externalId: string;
  chain: string;
  balance: string;
  hasBalance: boolean;
  deployed: boolean;
  lastDeposit: string;
}

export const walletAddresses: WalletAddress[] = [
  { address: "0x742d35Cc...4f2a", label: "Joao Silva", externalId: "user-joao-123", chain: "BSC", balance: "100 USDT", hasBalance: true, deployed: true, lastDeposit: "Apr 8, 14:02" },
  { address: "0x8f3a21Bb...9e1c", label: "Maria Santos", externalId: "user-maria-456", chain: "ETH", balance: "0.85 ETH", hasBalance: true, deployed: true, lastDeposit: "Apr 8, 13:30" },
  { address: "0xa1c9e0Dd...7b3f", label: "Pedro Lima", externalId: "user-pedro-789", chain: "Polygon", balance: "0", hasBalance: false, deployed: false, lastDeposit: "Apr 8, 13:12" },
  { address: "0xb4e7f2Aa...3d5e", label: "Ana Costa", externalId: "user-ana-012", chain: "BSC", balance: "0", hasBalance: false, deployed: false, lastDeposit: "Never" },
  { address: "0xc3f8d1Ee...9a0b", label: "Carlos Oliveira", externalId: "user-carlos-345", chain: "BSC", balance: "2,500 USDT", hasBalance: true, deployed: true, lastDeposit: "Apr 8, 12:45" },
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
}

export const deposits: Deposit[] = [
  { date: "Apr 8, 14:02", address: "0x742d...4f2a", externalId: "user-joao-123", token: "USDT", amount: "+100.00", confirmations: 8, confirmationsRequired: 12, status: "Confirming", txHash: "0xabc...def" },
  { date: "Apr 8, 13:30", address: "0x8f3a...9e1c", externalId: "user-maria-456", token: "ETH", amount: "+0.85", confirmations: 12, confirmationsRequired: 12, status: "Confirmed", txHash: "0x123...456" },
  { date: "Apr 8, 13:12", address: "0xa1c9...7b3f", externalId: "user-pedro-789", token: "USDC", amount: "+50.00", confirmations: 128, confirmationsRequired: 128, status: "Confirmed", txHash: "0x789...abc" },
  { date: "Apr 8, 12:45", address: "0xb4e7...3d5e", externalId: "user-ana-012", token: "USDT", amount: "+2,500.00", confirmations: 15, confirmationsRequired: 15, status: "Confirmed", txHash: "0xdef...012" },
];

// ─── Withdrawals ───────────────────────────────────────────────
export interface Withdrawal {
  date: string;
  destinationLabel: string;
  destinationAddr: string;
  token: string;
  amount: string;
  status: "Confirmed" | "Confirming" | "Pending";
}

export const withdrawals: Withdrawal[] = [
  { date: "Apr 8, 13:45", destinationLabel: "Binance Hot", destinationAddr: "0xDEF1...2345", token: "USDT", amount: "-500.00", status: "Confirmed" },
  { date: "Apr 8, 12:30", destinationLabel: "Carteira Fria", destinationAddr: "0xABC9...8765", token: "ETH", amount: "-10.00", status: "Confirming" },
  { date: "Apr 7, 18:00", destinationLabel: "Fornecedor X", destinationAddr: "0x1234...5678", token: "USDC", amount: "-1,200.00", status: "Confirmed" },
  { date: "Apr 7, 14:20", destinationLabel: "Binance Hot", destinationAddr: "0xDEF1...2345", token: "USDT", amount: "-25,000.00", status: "Confirmed" },
];

export const withdrawalDestinations = [
  { label: "Binance Hot", address: "0xDEF1...2345" },
  { label: "Carteira Fria", address: "0xABC9...8765" },
  { label: "Fornecedor X", address: "0x1234...5678" },
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
      { label: "Wallets", href: "/wallets", icon: "\u25CE" },
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
