// ─── Dashboard ───────────────────────────────────────────────
export const dashboardStats = [
  { label: "Active Clients", value: "47", change: "+12%", direction: "up" as const },
  { label: "Deposits Today", value: "$2.3M", change: "+8.2%", direction: "up" as const, color: "green" as const },
  { label: "Withdrawals Today", value: "$1.1M", change: "-3.1%", direction: "down" as const, color: "blue" as const },
  { label: "Volume 24h", value: "$3.4M", change: "+5.7%", direction: "up" as const, color: "accent" as const },
];

export const volumeChartData = [
  { day: "Mon", BSC: 2.6, ETH: 1.7, Polygon: 0.8 },
  { day: "Tue", BSC: 3.0, ETH: 2.0, Polygon: 1.0 },
  { day: "Wed", BSC: 2.3, ETH: 1.6, Polygon: 0.7 },
  { day: "Thu", BSC: 2.7, ETH: 1.9, Polygon: 0.9 },
  { day: "Fri", BSC: 3.2, ETH: 2.1, Polygon: 1.1 },
  { day: "Sat", BSC: 2.1, ETH: 1.5, Polygon: 0.6 },
  { day: "Sun", BSC: 2.4, ETH: 1.7, Polygon: 0.8 },
];

export const activeAlerts = [
  {
    id: "1",
    type: "danger" as const,
    title: "KYT Alert -- OFAC Hit",
    description: "Address 0x7f26...8a3c matched Lazarus Group on BSC deposit",
    time: "2 min ago",
  },
  {
    id: "2",
    type: "warn" as const,
    title: "Gas Tank Low -- BSC",
    description: 'Client "CorretXYZ" gas tank at 0.3 BNB (below 0.5 threshold)',
    time: "14 min ago",
  },
  {
    id: "3",
    type: "warn" as const,
    title: "Webhook Failures -- PayGateway",
    description: "23 consecutive failures to https://pay.gw/callbacks (502 Bad Gateway)",
    time: "1h ago",
  },
  {
    id: "4",
    type: "info" as const,
    title: "OFAC List Updated",
    description: "SDN list synced: 1,247 crypto addresses (+3 new entries)",
    time: "3h ago",
  },
];

export const liveTransactions = [
  {
    time: "14:02:15",
    chain: "BSC",
    chainColor: "accent" as const,
    type: "deposit" as const,
    label: "Deposit",
    description: "CorretXYZ",
    address: "0x742d35Cc...4f2a",
    amount: "+100.00 USDT",
    amountColor: "green" as const,
  },
  {
    time: "14:02:03",
    chain: "ETH",
    chainColor: "blue" as const,
    type: "withdraw" as const,
    label: "Withdraw",
    description: "GatewayABC",
    address: "0x8f3a21Bb...9e1c",
    amount: "-2.50 ETH",
    amountColor: "red" as const,
  },
  {
    time: "14:01:55",
    chain: "BSC",
    chainColor: "accent" as const,
    type: "sweep" as const,
    label: "Sweep",
    description: "CorretXYZ -- 12 forwarders flushed",
    address: "",
    amount: "+4,200 USDT",
    amountColor: "blue" as const,
  },
  {
    time: "14:01:40",
    chain: "POLY",
    chainColor: "purple" as const,
    type: "deposit" as const,
    label: "Deposit",
    description: "ExchDEF",
    address: "0xa1c9e0Dd...7b3f",
    amount: "+200.00 USDT",
    amountColor: "green" as const,
  },
  {
    time: "14:01:22",
    chain: "ETH",
    chainColor: "blue" as const,
    type: "deposit" as const,
    label: "Deposit",
    description: "CorretXYZ",
    address: "0xb4e7f2Aa...3d5e",
    amount: "+0.85 ETH",
    amountColor: "green" as const,
  },
  {
    time: "14:00:58",
    chain: "BSC",
    chainColor: "accent" as const,
    type: "withdraw" as const,
    label: "Withdraw",
    description: "PayGateway",
    address: "0xdead...beef",
    amount: "-15,000 USDC",
    amountColor: "red" as const,
  },
  {
    time: "14:00:31",
    chain: "BSC",
    chainColor: "accent" as const,
    type: "deposit" as const,
    label: "Deposit",
    description: "ExchDEF",
    address: "0xc3f8...1a2b",
    amount: "+50.00 BUSD",
    amountColor: "green" as const,
  },
];

// ─── Clients ─────────────────────────────────────────────────
export const clientsStats = [
  { label: "Total Clients", value: "47" },
  { label: "Active", value: "42", color: "green" as const },
  { label: "Total Forwarders", value: "148,920" },
  { label: "Total Volume (30d)", value: "$89.2M", color: "accent" as const },
];

export const clients = [
  {
    id: "client_cxyz_001",
    name: "Corretora XYZ",
    since: "Since Jan 2026",
    tier: "Business",
    tierColor: "blue" as const,
    chains: "BSC, ETH, POLY",
    forwarders: "12,430",
    volume24h: "$2.3M",
    balance: "$847K",
    status: "Active",
    statusColor: "green" as const,
  },
  {
    id: "client_pgw_002",
    name: "PayGateway International",
    since: "Since Mar 2026",
    tier: "Enterprise",
    tierColor: "purple" as const,
    chains: "BSC, ETH, ARB, POLY, OP",
    forwarders: "89,102",
    volume24h: "$15.1M",
    balance: "$4.2M",
    status: "Active",
    statusColor: "green" as const,
  },
  {
    id: "client_eabc_003",
    name: "Exchange ABC",
    since: "Since Feb 2026",
    tier: "Starter",
    tierColor: "neutral" as const,
    chains: "BSC",
    forwarders: "150",
    volume24h: "$12.5K",
    balance: "$3.1K",
    status: "Suspended",
    statusColor: "orange" as const,
  },
  {
    id: "client_cps_004",
    name: "CryptoPay Solutions",
    since: "Since Apr 2026",
    tier: "Business",
    tierColor: "blue" as const,
    chains: "BSC, ETH",
    forwarders: "5,320",
    volume24h: "$890K",
    balance: "$215K",
    status: "Active",
    statusColor: "green" as const,
  },
  {
    id: "client_mp_005",
    name: "MerchantPro",
    since: "Since Mar 2026",
    tier: "Starter",
    tierColor: "neutral" as const,
    chains: "BSC, POLY",
    forwarders: "890",
    volume24h: "$45K",
    balance: "$8.7K",
    status: "Active",
    statusColor: "green" as const,
  },
];

// ─── Client Detail ───────────────────────────────────────────
export const clientDetail = {
  id: "client_cxyz_001",
  name: "Corretora XYZ",
  tier: "Business",
  since: "Jan 15, 2026",
  stats: [
    { label: "Total Balance", value: "$847K", color: "accent" as const },
    { label: "Forwarders", value: "12,430", subtitle: "3,201 with balance" },
    { label: "Deposits (24h)", value: "$2.3M", color: "green" as const },
    { label: "Withdrawals (24h)", value: "$1.1M", color: "blue" as const },
  ],
  wallets: [
    {
      chain: "BSC",
      chainColor: "accent",
      status: "Active",
      address: "0x1a2b3c4d...5e6f7g8h",
      balances: [
        { token: "BNB", amount: "12.50" },
        { token: "USDT", amount: "500,000.00" },
        { token: "USDC", amount: "340,000.00" },
      ],
    },
    {
      chain: "Ethereum",
      chainColor: "blue",
      status: "Active",
      address: "0x9a8b7c6d...5e4f3g2h",
      balances: [
        { token: "ETH", amount: "1.20" },
        { token: "USDT", amount: "5,200.00" },
        { token: "USDC", amount: "1,800.00" },
      ],
    },
    {
      chain: "Polygon",
      chainColor: "purple",
      status: "Active",
      address: "0x5f4e3d2c...1b0a9z8y",
      balances: [
        { token: "MATIC", amount: "1,250.00" },
        { token: "USDT", amount: "18,400.00" },
        { token: "USDC", amount: "7,600.00" },
      ],
    },
  ],
  config: [
    { label: "Custody Mode", value: "Full Custody" },
    { label: "Monitoring Mode", value: "Hybrid (Realtime + Polling 30s)" },
    { label: "KYT Level", value: "Full (OFAC + EU + UN)", badge: true },
    { label: "Daily Withdrawal Limit", value: "$500,000.00", mono: true },
    { label: "Confirmation Milestones", value: "[1, 3, 6, 12]", mono: true },
    { label: "Whitelist Cooldown", value: "24 hours" },
  ],
  gasTanks: [
    {
      chain: "BSC Gas Tank",
      balance: "0.30 BNB",
      balanceColor: "orange",
      threshold: "0.50 BNB",
      burnRate: "0.08 BNB/day",
      percent: 20,
      status: "low" as const,
      daysLeft: "~3.7 days remaining",
    },
    {
      chain: "ETH Gas Tank",
      balance: "0.85 ETH",
      balanceColor: "green",
      threshold: "0.30 ETH",
      burnRate: "0.02 ETH/day",
      percent: 70,
      status: "ok" as const,
      daysLeft: "~42 days remaining",
    },
    {
      chain: "Polygon Gas Tank",
      balance: "120 MATIC",
      balanceColor: "green",
      threshold: "50 MATIC",
      burnRate: "3 MATIC/day",
      percent: 85,
      status: "ok" as const,
      daysLeft: "~40 days remaining",
    },
  ],
};

// ─── Tiers ───────────────────────────────────────────────────
export const presetTiers = [
  {
    name: "Starter",
    description: "For small businesses getting started",
    features: [
      { label: "req/s API limit", value: "10" },
      { label: "forwarders/chain", value: "1,000" },
      { label: "chains active", value: "2" },
      { label: "Monitoring", value: "Polling" },
      { label: "KYT", value: "Basic" },
      { label: "Daily limit", value: "$50K" },
    ],
    clients: 5,
    badgeColor: "neutral" as const,
  },
  {
    name: "Business",
    description: "For growing exchanges and gateways",
    features: [
      { label: "req/s API limit", value: "100" },
      { label: "forwarders/chain", value: "50,000" },
      { label: "chains active", value: "5" },
      { label: "Monitoring", value: "Hybrid" },
      { label: "KYT", value: "Full" },
      { label: "Daily limit", value: "$500K" },
    ],
    clients: 28,
    badgeColor: "blue" as const,
    selected: true,
  },
  {
    name: "Enterprise",
    description: "For high-volume institutional clients",
    features: [
      { label: "req/s API limit", value: "1,000" },
      { label: "forwarders", value: "Unlimited" },
      { label: "chains active", value: "All" },
      { label: "Monitoring", value: "Realtime + dedicated indexer" },
      { label: "KYT", value: "Full + Graph" },
      { label: "Limits", value: "Custom" },
    ],
    clients: 9,
    badgeColor: "purple" as const,
  },
];

export const customTiers = [
  {
    name: "Business - CorretXYZ Custom",
    basedOn: "Business",
    basedOnColor: "blue" as const,
    overrides: "200 req/s, 7 chains, $1M daily limit",
    assignedTo: "Corretora XYZ",
  },
  {
    name: "Enterprise - PayGW Special",
    basedOn: "Enterprise",
    basedOnColor: "purple" as const,
    overrides: "2000 req/s, co-sign enabled",
    assignedTo: "PayGateway International",
  },
];

// ─── Chains ──────────────────────────────────────────────────
export const chains = [
  {
    name: "Ethereum",
    chainId: "1",
    native: "ETH",
    blockTime: "~12s",
    confirmations: "12",
    rpcHealth: "Healthy",
    rpcColor: "green" as const,
    lastBlock: "19,847,231",
    lag: "0 blocks",
    lagColor: "green",
    status: "Active",
    statusColor: "green" as const,
  },
  {
    name: "BSC",
    chainId: "56",
    native: "BNB",
    blockTime: "~3s",
    confirmations: "15",
    rpcHealth: "Healthy",
    rpcColor: "green" as const,
    lastBlock: "42,891,547",
    lag: "0 blocks",
    lagColor: "green",
    status: "Active",
    statusColor: "green" as const,
  },
  {
    name: "Polygon",
    chainId: "137",
    native: "MATIC",
    blockTime: "~2s",
    confirmations: "128",
    rpcHealth: "Healthy",
    rpcColor: "green" as const,
    lastBlock: "61,234,890",
    lag: "1 block",
    lagColor: "green",
    status: "Active",
    statusColor: "green" as const,
  },
  {
    name: "Arbitrum",
    chainId: "42161",
    native: "ETH",
    blockTime: "~0.26s",
    confirmations: "12",
    rpcHealth: "Degraded",
    rpcColor: "orange" as const,
    lastBlock: "198,452,100",
    lag: "5 blocks",
    lagColor: "orange",
    status: "Active",
    statusColor: "green" as const,
  },
  {
    name: "Optimism",
    chainId: "10",
    native: "ETH",
    blockTime: "~2s",
    confirmations: "12",
    rpcHealth: "Healthy",
    rpcColor: "green" as const,
    lastBlock: "118,290,445",
    lag: "0 blocks",
    lagColor: "green",
    status: "Pending",
    statusColor: "orange" as const,
  },
];

// ─── Tokens ──────────────────────────────────────────────────
export const tokens = [
  {
    symbol: "BNB",
    name: "Binance Coin",
    chain: "BSC",
    contract: null,
    decimals: 18,
    type: "Native" as const,
    typeColor: "accent" as const,
    clientsUsing: 38,
    status: "Active",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    chain: "BSC",
    contract: "0x55d398...7955",
    decimals: 18,
    type: "ERC-20" as const,
    typeColor: "neutral" as const,
    clientsUsing: 42,
    status: "Active",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    chain: "BSC",
    contract: "0x8AC7...E393",
    decimals: 18,
    type: "ERC-20" as const,
    typeColor: "neutral" as const,
    clientsUsing: 39,
    status: "Active",
  },
  {
    symbol: "ETH",
    name: "Ether",
    chain: "Ethereum",
    contract: null,
    decimals: 18,
    type: "Native" as const,
    typeColor: "blue" as const,
    clientsUsing: 35,
    status: "Active",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    chain: "Ethereum",
    contract: "0xdAC1...1ec7",
    decimals: 6,
    type: "ERC-20" as const,
    typeColor: "neutral" as const,
    clientsUsing: 35,
    status: "Active",
  },
];

// ─── Gas Tanks ───────────────────────────────────────────────
export const gasTanksStats = [
  { label: "Total Gas Tanks", value: "94" },
  { label: "Low Balance", value: "3", color: "red" as const },
  { label: "Gas Spent Today", value: "$847", color: "orange" as const },
  { label: "Avg Cost per Sweep", value: "$0.35", mono: true },
];

export const gasTanks = [
  {
    client: "CorretXYZ",
    chain: "BSC",
    address: "0xGas1...Tank",
    balance: "0.30 BNB",
    balanceColor: "red" as const,
    threshold: "0.50 BNB",
    burnRate: "0.08/day",
    daysLeft: "~3.7",
    daysLeftColor: "red" as const,
    status: "LOW",
    statusColor: "red" as const,
    highlight: true,
  },
  {
    client: "CorretXYZ",
    chain: "ETH",
    address: "0xGas2...Tank",
    balance: "0.85 ETH",
    balanceColor: "default" as const,
    threshold: "0.30 ETH",
    burnRate: "0.02/day",
    daysLeft: "~42",
    daysLeftColor: "green" as const,
    status: "OK",
    statusColor: "green" as const,
    highlight: false,
  },
  {
    client: "PayGateway",
    chain: "BSC",
    address: "0xGas3...Tank",
    balance: "5.20 BNB",
    balanceColor: "default" as const,
    threshold: "2.00 BNB",
    burnRate: "0.45/day",
    daysLeft: "~11.5",
    daysLeftColor: "green" as const,
    status: "OK",
    statusColor: "green" as const,
    highlight: false,
  },
];

// ─── Compliance ──────────────────────────────────────────────
export const complianceStats = [
  { label: "Screenings Today", value: "4,312" },
  { label: "Hit Rate", value: "0.07%", color: "orange" as const },
  { label: "Open Alerts", value: "3", color: "red" as const },
  { label: "Blocked Addresses", value: "18" },
];

export const complianceAlerts = [
  {
    severity: "Critical",
    severityColor: "red" as const,
    address: "0x7f26...8a3c",
    match: "OFAC SDN -- Lazarus Group",
    client: "CorretXYZ",
  },
  {
    severity: "High",
    severityColor: "orange" as const,
    address: "0xd4e5...1f2g",
    match: "EU Sanctions -- 1-hop from sanctioned",
    client: "PayGateway",
  },
  {
    severity: "Medium",
    severityColor: "orange" as const,
    address: "0xb3c4...7h8i",
    match: "Tornado Cash interaction (2-hop)",
    client: "ExchDEF",
  },
];

export const sanctionsLists = [
  {
    name: "OFAC SDN",
    entries: "12,847",
    cryptoAddrs: "1,247",
    lastSync: "2026-04-08 03:00",
    status: "Current",
    statusColor: "green" as const,
  },
  {
    name: "OFAC Consolidated",
    entries: "18,920",
    cryptoAddrs: "1,892",
    lastSync: "2026-04-08 03:00",
    status: "Current",
    statusColor: "green" as const,
  },
  {
    name: "EU Sanctions",
    entries: "8,340",
    cryptoAddrs: "312",
    lastSync: "2026-04-07 03:00",
    status: "Current",
    statusColor: "green" as const,
  },
  {
    name: "UN Consolidated",
    entries: "6,128",
    cryptoAddrs: "89",
    lastSync: "2026-04-07 03:00",
    status: "Current",
    statusColor: "green" as const,
  },
  {
    name: "UK OFSI",
    entries: "4,210",
    cryptoAddrs: "156",
    lastSync: "2026-04-06 03:00",
    status: "1 day old",
    statusColor: "orange" as const,
  },
];

// ─── Monitoring ──────────────────────────────────────────────
export const services = [
  { name: "Admin API", status: "healthy" as const, p99: "45ms" },
  { name: "Client API", status: "healthy" as const, p99: "62ms" },
  { name: "Core Wallet", status: "healthy" as const, p99: "120ms" },
  { name: "Key Vault", status: "healthy" as const, p99: "15ms" },
  { name: "Chain Indexer", status: "healthy" as const, p99: "89ms" },
];

export const queues = [
  {
    name: "Webhook Delivery",
    metrics: [
      { label: "Waiting", value: "12", color: "green" },
      { label: "Active", value: "3", color: "blue" },
      { label: "Failed", value: "23", color: "red" },
      { label: "Completed (24h)", value: "8,920", color: "default" },
    ],
  },
  {
    name: "Sweep / Flush",
    metrics: [
      { label: "Waiting", value: "89", color: "green" },
      { label: "Active", value: "5", color: "blue" },
      { label: "Failed", value: "2", color: "red" },
      { label: "Completed (24h)", value: "1,247", color: "default" },
    ],
  },
  {
    name: "Confirmation Tracking",
    metrics: [
      { label: "Tracking", value: "342", color: "accent" },
      { label: "Pending webhooks", value: "156", color: "blue" },
      { label: "Reorgs (24h)", value: "0", color: "green" },
      { label: "Confirmed (24h)", value: "4,512", color: "default" },
    ],
  },
];

// ─── Navigation ──────────────────────────────────────────────
export const navSections = [
  {
    title: "Principal",
    items: [
      { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
      { label: "Clients", href: "/clients", icon: "Users" },
    ],
  },
  {
    title: "Blockchain",
    items: [
      { label: "Chains", href: "/chains", icon: "Link" },
      { label: "Tokens", href: "/tokens", icon: "Coins" },
      { label: "Gas Tanks", href: "/gas-tanks", icon: "Fuel" },
    ],
  },
  {
    title: "Config",
    items: [
      { label: "Tiers & Limits", href: "/tiers", icon: "Layers" },
      { label: "Compliance", href: "/compliance", icon: "ShieldAlert", badge: 3 },
      { label: "Monitoring", href: "/monitoring", icon: "Activity" },
    ],
  },
];
