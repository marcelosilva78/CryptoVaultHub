// ──────────────────────────────────────────────
// Mock data for BI Dashboard
// ──────────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);

// ── Helper ──────────────────────────────────────
function generateDays(count: number) {
  const days: string[] = [];
  const now = new Date("2026-04-08");
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// ── KPI values ──────────────────────────────────
export const kpiData = {
  totalAUM: 2_450_000_000,
  aumChange: 5.3,
  volume24h: 187_500_000,
  volume24hChange: 12.4,
  volume7d: 1_280_000_000,
  volume7dChange: 8.1,
  volume30d: 4_850_000_000,
  volume30dChange: -2.3,
  activeClients: 342,
  activeClientsChange: 3.8,
  txCount24h: 15_847,
  txCountChange: 7.2,
};

// ── Daily volumes (90 days) ─────────────────────
export const dailyVolumes = generateDays(90).map((date) => ({
  date,
  volume: Math.round(120_000_000 + rand() * 130_000_000),
  deposits: Math.round(70_000_000 + rand() * 80_000_000),
  withdrawals: Math.round(50_000_000 + rand() * 60_000_000),
  txCount: Math.round(10_000 + rand() * 12_000),
  revenue: Math.round(250_000 + rand() * 200_000),
}));

// ── Volume by chain ─────────────────────────────
export const volumeByChain = [
  { chain: "Ethereum", volume: 89_500_000, color: "#3b82f6" },
  { chain: "Polygon", volume: 42_300_000, color: "#8b5cf6" },
  { chain: "Arbitrum", volume: 28_100_000, color: "#06b6d4" },
  { chain: "Optimism", volume: 15_600_000, color: "#ef4444" },
  { chain: "BSC", volume: 8_200_000, color: "#f59e0b" },
  { chain: "Avalanche", volume: 3_800_000, color: "#22c55e" },
];

// ── Token distribution ──────────────────────────
export const tokenDistribution = [
  { name: "USDT", value: 38, color: "#22c55e" },
  { name: "USDC", value: 28, color: "#3b82f6" },
  { name: "ETH", value: 18, color: "#8b5cf6" },
  { name: "BTC", value: 10, color: "#f59e0b" },
  { name: "DAI", value: 4, color: "#06b6d4" },
  { name: "Other", value: 2, color: "#64748b" },
];

// ── Revenue by client (top 10) ──────────────────
export const revenueByClient = [
  { client: "Acme Corp", revenue: 485_000, volume: 97_000_000, tier: "Enterprise" },
  { client: "Globex Inc", revenue: 342_000, volume: 68_400_000, tier: "Enterprise" },
  { client: "Wayne Ent.", revenue: 298_000, volume: 59_600_000, tier: "Enterprise" },
  { client: "Stark Ind.", revenue: 256_000, volume: 51_200_000, tier: "Pro" },
  { client: "Oscorp", revenue: 198_000, volume: 39_600_000, tier: "Pro" },
  { client: "Umbrella", revenue: 167_000, volume: 33_400_000, tier: "Pro" },
  { client: "LexCorp", revenue: 145_000, volume: 29_000_000, tier: "Pro" },
  { client: "Cyberdyne", revenue: 112_000, volume: 22_400_000, tier: "Standard" },
  { client: "Soylent", revenue: 98_000, volume: 19_600_000, tier: "Standard" },
  { client: "Initech", revenue: 87_000, volume: 17_400_000, tier: "Standard" },
];

// ── Revenue trend (90 days) ─────────────────────
export const revenueTrend = dailyVolumes.map((d) => ({
  date: d.date,
  revenue: d.revenue,
  gasCost: Math.round(d.revenue * (0.08 + rand() * 0.06)),
  margin: d.revenue - Math.round(d.revenue * (0.08 + rand() * 0.06)),
}));

// ── Revenue by chain ────────────────────────────
export const revenueByChainData = [
  { chain: "Ethereum", revenue: 1_250_000, gasCost: 187_500 },
  { chain: "Polygon", revenue: 620_000, gasCost: 18_600 },
  { chain: "Arbitrum", revenue: 410_000, gasCost: 28_700 },
  { chain: "Optimism", revenue: 230_000, gasCost: 16_100 },
  { chain: "BSC", revenue: 120_000, gasCost: 6_000 },
  { chain: "Avalanche", revenue: 55_000, gasCost: 4_400 },
];

// ── Volume by token ─────────────────────────────
export const volumeByToken = [
  { name: "USDT", deposits: 52_000_000, withdrawals: 38_000_000 },
  { name: "USDC", deposits: 38_000_000, withdrawals: 30_000_000 },
  { name: "ETH", deposits: 24_000_000, withdrawals: 18_000_000 },
  { name: "BTC", deposits: 14_000_000, withdrawals: 10_000_000 },
  { name: "DAI", deposits: 5_200_000, withdrawals: 4_800_000 },
];

// ── Heatmap data (hour × day-of-week) ───────────
export const heatmapData: { hour: number; day: number; value: number }[] = [];
for (let day = 0; day < 7; day++) {
  for (let hour = 0; hour < 24; hour++) {
    const baseActivity =
      hour >= 8 && hour <= 20 ? 60 + rand() * 40 : 10 + rand() * 30;
    const weekendFactor = day >= 5 ? 0.6 : 1;
    heatmapData.push({
      hour,
      day,
      value: Math.round(baseActivity * weekendFactor),
    });
  }
}

// ── Client analytics ────────────────────────────
export const clientGrowth = generateDays(90).map((date, i) => ({
  date,
  totalClients: 280 + Math.round(i * 0.7 + rand() * 3),
  activeClients: 250 + Math.round(i * 0.5 + rand() * 5),
}));

export const tierDistribution = [
  { name: "Enterprise", value: 42, color: "#8b5cf6" },
  { name: "Pro", value: 128, color: "#3b82f6" },
  { name: "Standard", value: 145, color: "#22c55e" },
  { name: "Free", value: 27, color: "#64748b" },
];

export const apiUsageByClient = [
  { client: "Acme Corp", calls: 2_450_000 },
  { client: "Globex Inc", calls: 1_820_000 },
  { client: "Wayne Ent.", calls: 1_540_000 },
  { client: "Stark Ind.", calls: 1_230_000 },
  { client: "Oscorp", calls: 980_000 },
  { client: "Umbrella", calls: 756_000 },
  { client: "LexCorp", calls: 612_000 },
  { client: "Cyberdyne", calls: 498_000 },
];

export const forwardersData = [
  { chain: "Ethereum", created: 12_450, utilized: 10_230 },
  { chain: "Polygon", created: 8_320, utilized: 7_100 },
  { chain: "Arbitrum", created: 5_640, utilized: 4_890 },
  { chain: "Optimism", created: 3_210, utilized: 2_680 },
  { chain: "BSC", created: 1_890, utilized: 1_540 },
];

// ── Operations ──────────────────────────────────
export const sweepPerformance = {
  avgDetectToSweep: 14.2, // minutes
  avgDetectToSweepChange: -8.5,
  successRate: 99.7,
  successRateChange: 0.2,
  avgGasUsed: 0.0042, // ETH
  totalSwept24h: 1_245,
};

export const webhookDelivery = generateDays(30).map((date) => ({
  date,
  successRate: 98.5 + rand() * 1.5,
  totalSent: Math.round(8_000 + rand() * 4_000),
  failed: Math.round(10 + rand() * 80),
}));

export const failedTransactions = [
  { id: "0xa1b2..c3d4", chain: "Ethereum", type: "Sweep", error: "Out of gas", timestamp: "2026-04-08 14:23:11", amount: "$12,450" },
  { id: "0xe5f6..g7h8", chain: "Polygon", type: "Sweep", error: "Nonce too low", timestamp: "2026-04-08 13:45:02", amount: "$8,320" },
  { id: "0xi9j0..k1l2", chain: "Arbitrum", type: "Forward", error: "Reverted", timestamp: "2026-04-08 12:12:55", amount: "$3,150" },
  { id: "0xm3n4..o5p6", chain: "Ethereum", type: "Sweep", error: "Out of gas", timestamp: "2026-04-08 11:08:33", amount: "$22,100" },
  { id: "0xq7r8..s9t0", chain: "Optimism", type: "Withdrawal", error: "Insufficient balance", timestamp: "2026-04-08 10:55:47", amount: "$5,670" },
  { id: "0xu1v2..w3x4", chain: "Polygon", type: "Sweep", error: "Gas price spike", timestamp: "2026-04-08 09:32:18", amount: "$1,890" },
  { id: "0xy5z6..a7b8", chain: "BSC", type: "Forward", error: "Contract paused", timestamp: "2026-04-07 23:14:50", amount: "$450" },
  { id: "0xc9d0..e1f2", chain: "Ethereum", type: "Sweep", error: "Out of gas", timestamp: "2026-04-07 22:01:05", amount: "$34,200" },
];

// ── Compliance ──────────────────────────────────
export const screeningsPerDay = generateDays(30).map((date) => ({
  date,
  screenings: Math.round(200 + rand() * 300),
  hits: Math.round(2 + rand() * 8),
}));

export const hitRateTrend = generateDays(30).map((date) => ({
  date,
  hitRate: 0.5 + rand() * 2.5,
}));

export const alertsBySeverity = generateDays(30).map((date) => ({
  date,
  critical: Math.round(rand() * 3),
  high: Math.round(1 + rand() * 5),
  medium: Math.round(3 + rand() * 10),
  low: Math.round(5 + rand() * 15),
}));

export const resolutionTime = {
  avgResolution: 2.4, // hours
  avgResolutionChange: -15.2,
  pendingAlerts: 12,
  resolvedToday: 38,
  escalated: 3,
};

// ── Infrastructure ──────────────────────────────
export const rpcHealth = [
  {
    chain: "Ethereum",
    status: "healthy" as const,
    latency: generateDays(24).map(() => Math.round(45 + rand() * 30)),
    avgLatency: 58,
    uptime: 99.98,
  },
  {
    chain: "Polygon",
    status: "healthy" as const,
    latency: generateDays(24).map(() => Math.round(20 + rand() * 15)),
    avgLatency: 28,
    uptime: 99.95,
  },
  {
    chain: "Arbitrum",
    status: "healthy" as const,
    latency: generateDays(24).map(() => Math.round(30 + rand() * 20)),
    avgLatency: 42,
    uptime: 99.99,
  },
  {
    chain: "Optimism",
    status: "degraded" as const,
    latency: generateDays(24).map(() => Math.round(60 + rand() * 80)),
    avgLatency: 95,
    uptime: 99.82,
  },
  {
    chain: "BSC",
    status: "healthy" as const,
    latency: generateDays(24).map(() => Math.round(15 + rand() * 10)),
    avgLatency: 20,
    uptime: 99.97,
  },
  {
    chain: "Avalanche",
    status: "healthy" as const,
    latency: generateDays(24).map(() => Math.round(35 + rand() * 25)),
    avgLatency: 48,
    uptime: 99.94,
  },
];

export const gasPricesTrend = generateDays(30).map((date) => ({
  date,
  ethereum: Math.round(15 + rand() * 45),
  polygon: Math.round(30 + rand() * 60),
  arbitrum: +(0.1 + rand() * 0.3).toFixed(2),
  optimism: +(0.01 + rand() * 0.05).toFixed(3),
}));

export const gasTankBalances = [
  { chain: "Ethereum", balance: 12.45, usdValue: 42_330, threshold: 5, status: "ok" as const },
  { chain: "Polygon", balance: 45_230, usdValue: 38_445, threshold: 10_000, status: "ok" as const },
  { chain: "Arbitrum", balance: 8.32, usdValue: 28_288, threshold: 3, status: "ok" as const },
  { chain: "Optimism", balance: 2.1, usdValue: 7_140, threshold: 3, status: "warning" as const },
  { chain: "BSC", balance: 42.5, usdValue: 25_500, threshold: 20, status: "ok" as const },
  { chain: "Avalanche", balance: 180, usdValue: 6_480, threshold: 50, status: "ok" as const },
];

export const queueDepths = [
  { queue: "sweep-processor", depth: 23, maxDepth: 1000, avgProcessingMs: 450 },
  { queue: "webhook-delivery", depth: 156, maxDepth: 5000, avgProcessingMs: 120 },
  { queue: "screening-requests", depth: 8, maxDepth: 500, avgProcessingMs: 2100 },
  { queue: "gas-refill", depth: 2, maxDepth: 100, avgProcessingMs: 8500 },
  { queue: "notification-email", depth: 42, maxDepth: 2000, avgProcessingMs: 350 },
  { queue: "tx-confirmation", depth: 312, maxDepth: 10000, avgProcessingMs: 60 },
];

// ── Filter options ──────────────────────────────
export const chainOptions = [
  "All Chains",
  "Ethereum",
  "Polygon",
  "Arbitrum",
  "Optimism",
  "BSC",
  "Avalanche",
];

export const clientOptions = [
  "All Clients",
  "Acme Corp",
  "Globex Inc",
  "Wayne Ent.",
  "Stark Ind.",
  "Oscorp",
  "Umbrella",
  "LexCorp",
  "Cyberdyne",
];
