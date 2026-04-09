# Phase 1: Foundation & Smart Contracts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Turborepo monorepo, Docker infrastructure, and all Solidity smart contracts (compiled, tested, and ready for deployment) that form the foundation of CryptoVaultHub.

**Architecture:** Turborepo monorepo with shared packages and independent apps/services. Smart contracts adapted from BitGo eth-multisig-v4 with Hardhat for compilation, testing, and deployment scripts. Docker Compose orchestrates all services with isolated networks.

**Tech Stack:** TypeScript 5.4+, Turborepo, Hardhat, Solidity 0.8.20, ethers.js v6, Docker, docker-compose

**Spec:** `docs/superpowers/specs/2026-04-08-cryptovaulthub-design.md`

---

## File Structure

```
CryptoVaultHub/
├── package.json                          # Root workspace config
├── turbo.json                            # Turborepo pipeline config
├── tsconfig.base.json                    # Shared TypeScript base config
├── .eslintrc.js                          # Root ESLint config
├── .prettierrc                           # Prettier config
├── .gitignore
├── .env.example                          # Environment variable template
├── docker-compose.yml                    # Full stack orchestration
├── docker-compose.dev.yml                # Dev overrides (hot reload)
│
├── contracts/                            # Hardhat project (smart contracts)
│   ├── package.json
│   ├── hardhat.config.ts
│   ├── contracts/
│   │   ├── CvhWalletSimple.sol           # 2-of-3 multisig wallet
│   │   ├── CvhForwarder.sol              # Deposit address with auto-forward
│   │   ├── CvhWalletFactory.sol          # CREATE2 wallet factory
│   │   ├── CvhForwarderFactory.sol       # CREATE2 forwarder factory
│   │   ├── CvhBatcher.sol                # Batch transfer contract
│   │   ├── CloneFactory.sol              # EIP-1167 minimal proxy deployer
│   │   ├── TransferHelper.sol            # Safe ERC20 transfer library
│   │   └── interfaces/
│   │       ├── IForwarder.sol
│   │       └── IERC20.sol
│   ├── test/
│   │   ├── CvhWalletSimple.test.ts
│   │   ├── CvhForwarder.test.ts
│   │   ├── CvhWalletFactory.test.ts
│   │   ├── CvhForwarderFactory.test.ts
│   │   ├── CvhBatcher.test.ts
│   │   └── helpers/
│   │       └── setup.ts                  # Shared test fixtures
│   └── scripts/
│       ├── deploy.ts                     # Main deployment script
│       └── compute-address.ts            # CREATE2 address computation
│
├── packages/
│   ├── types/                            # Shared TypeScript types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── chain.ts                  # Chain configs, IDs
│   │       ├── token.ts                  # Token interfaces
│   │       ├── wallet.ts                 # Wallet/forwarder types
│   │       ├── transaction.ts            # Deposit/withdrawal types
│   │       └── api.ts                    # API request/response types
│   │
│   ├── config/                           # Shared configuration
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── chains.ts                 # Default chain configurations
│   │       └── tokens.ts                 # Default token lists per chain
│   │
│   └── utils/                            # Shared utilities
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── address.ts                # EIP-55 checksum, validation
│           ├── format.ts                 # Amount formatting (wei↔human)
│           └── crypto.ts                 # Hash helpers, signature utils
│
├── services/                             # NestJS microservices (Phase 2+)
│   ├── admin-api/
│   ├── client-api/
│   ├── auth-service/
│   ├── core-wallet-service/
│   ├── key-vault-service/
│   ├── chain-indexer-service/
│   ├── notification-service/
│   └── cron-worker-service/
│
├── apps/                                 # Next.js frontends (Phase 10+)
│   ├── admin/
│   ├── client/
│   └── bi-dashboard/
│
└── infra/                                # Infrastructure configs
    ├── kong/
    │   └── kong.yml                      # Kong declarative config
    ├── prometheus/
    │   └── prometheus.yml
    ├── grafana/
    │   └── provisioning/
    └── docker/
        ├── Dockerfile.nestjs             # Shared NestJS Dockerfile
        └── Dockerfile.nextjs             # Shared Next.js Dockerfile
```

---

## Task 1: Initialize Monorepo Root

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.eslintrc.js`
- Create: `.prettierrc`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Initialize root package.json**

```bash
npm init -y
```

Then replace contents of `package.json`:

```json
{
  "name": "cryptovaulthub",
  "private": true,
  "workspaces": [
    "contracts",
    "packages/*",
    "services/*",
    "apps/*"
  ],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "test": "turbo test",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.4.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "prettier": "^3.2.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create .eslintrc.js**

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: { node: true, es2022: true },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
```

- [ ] **Step 5: Create .prettierrc**

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.next/
coverage/
.env
.env.local
*.log
.turbo/
artifacts/
cache/
typechain-types/
```

- [ ] **Step 7: Create .env.example**

```bash
# MySQL
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=cvh_admin
MYSQL_PASSWORD=changeme
MYSQL_ROOT_PASSWORD=changeme

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Key Vault
VAULT_MASTER_PASSWORD=changeme-use-strong-password

# RPC Endpoints
RPC_ETH_HTTP=https://eth-mainnet.gateway.tatum.io/
RPC_ETH_WS=wss://eth-mainnet.gateway.tatum.io/ws
RPC_BSC_HTTP=https://bsc-mainnet.gateway.tatum.io/
RPC_BSC_WS=wss://bsc-mainnet.gateway.tatum.io/ws
RPC_POLYGON_HTTP=https://polygon-mainnet.gateway.tatum.io/
TATUM_API_KEY=your-tatum-api-key

# PostHog
POSTHOG_HOST=http://posthog-web:8000
POSTHOG_API_KEY=phc_your_key_here

# Kong
KONG_ADMIN_URL=http://api-gateway:8001
```

- [ ] **Step 8: Install dependencies and commit**

```bash
npm install
git add package.json turbo.json tsconfig.base.json .eslintrc.js .prettierrc .gitignore .env.example package-lock.json
git commit -m "chore: initialize Turborepo monorepo root"
```

---

## Task 2: Create Shared Types Package

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`
- Create: `packages/types/src/chain.ts`
- Create: `packages/types/src/token.ts`
- Create: `packages/types/src/wallet.ts`
- Create: `packages/types/src/transaction.ts`
- Create: `packages/types/src/api.ts`

- [ ] **Step 1: Create packages/types/package.json**

```json
{
  "name": "@cvh/types",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create packages/types/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/types/src/chain.ts**

```typescript
export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: {
    symbol: string;
    decimals: number;
  };
  rpcEndpoints: RpcEndpoint[];
  blockTimeSeconds: number;
  confirmationsDefault: number;
  contracts: ChainContracts;
  explorerUrl: string | null;
  gasPriceStrategy: 'eip1559' | 'legacy';
  isActive: boolean;
  isTestnet: boolean;
}

export interface RpcEndpoint {
  url: string;
  apiKey?: string;
  type: 'http' | 'ws';
  priority: number;
}

export interface ChainContracts {
  walletFactoryAddress: string | null;
  forwarderFactoryAddress: string | null;
  walletImplementationAddress: string | null;
  forwarderImplementationAddress: string | null;
  multicall3Address: string;
}

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export enum ChainId {
  ETHEREUM = 1,
  BSC = 56,
  POLYGON = 137,
  ARBITRUM = 42161,
  OPTIMISM = 10,
  AVALANCHE = 43114,
  BASE = 8453,
}
```

- [ ] **Step 4: Create packages/types/src/token.ts**

```typescript
export interface Token {
  id: number;
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  isNative: boolean;
  isDefault: boolean;
  isActive: boolean;
  coingeckoId: string | null;
}

export interface ClientToken {
  clientId: number;
  tokenId: number;
  isDepositEnabled: boolean;
  isWithdrawalEnabled: boolean;
  minDepositAmount: string;
  minWithdrawalAmount: string;
  withdrawalFee: string;
}
```

- [ ] **Step 5: Create packages/types/src/wallet.ts**

```typescript
export interface Wallet {
  id: number;
  clientId: number;
  chainId: number;
  address: string;
  walletType: 'hot' | 'gas_tank';
  isActive: boolean;
  createdAt: Date;
}

export interface DepositAddress {
  id: number;
  clientId: number;
  chainId: number;
  walletId: number;
  address: string;
  externalId: string;
  label: string | null;
  isDeployed: boolean;
  salt: string;
  createdAt: Date;
}

export interface WhitelistedAddress {
  id: number;
  clientId: number;
  address: string;
  label: string;
  chainId: number;
  status: 'cooldown' | 'active' | 'disabled';
  cooldownEndsAt: Date | null;
  createdAt: Date;
}

export type CustodyMode = 'full_custody' | 'co_sign' | 'client_initiated';
export type MonitoringMode = 'realtime' | 'polling' | 'hybrid';
export type KytLevel = 'off' | 'basic' | 'full';
```

- [ ] **Step 6: Create packages/types/src/transaction.ts**

```typescript
export type DepositStatus = 'pending' | 'confirming' | 'confirmed' | 'swept' | 'reverted';
export type WithdrawalStatus =
  | 'pending_approval'
  | 'kyt_screening'
  | 'signing'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'failed'
  | 'rejected';

export interface Deposit {
  id: number;
  clientId: number;
  chainId: number;
  forwarderAddress: string;
  externalId: string;
  tokenId: number;
  amount: string;
  amountRaw: string;
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  status: DepositStatus;
  confirmations: number;
  confirmationsRequired: number;
  sweepTxHash: string | null;
  kytResult: 'clear' | 'hit' | 'possible_match' | null;
  detectedAt: Date;
  confirmedAt: Date | null;
  sweptAt: Date | null;
}

export interface Withdrawal {
  id: number;
  clientId: number;
  chainId: number;
  tokenId: number;
  fromWallet: string;
  toAddressId: number;
  toAddress: string;
  toLabel: string;
  amount: string;
  amountRaw: string;
  txHash: string | null;
  status: WithdrawalStatus;
  sequenceId: number | null;
  gasCost: string | null;
  kytResult: 'clear' | 'hit' | 'possible_match' | null;
  idempotencyKey: string;
  createdAt: Date;
  submittedAt: Date | null;
  confirmedAt: Date | null;
}

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
}
```

- [ ] **Step 7: Create packages/types/src/api.ts**

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  traceId?: string;
}

export interface GenerateAddressRequest {
  externalId: string;
  label?: string;
}

export interface GenerateAddressResponse {
  address: string;
  chainId: number;
  externalId: string;
  label: string | null;
  status: 'active';
  supportedTokens: string[];
}

export interface WithdrawRequest {
  chainId: number;
  tokenSymbol: string;
  toAddressId: number;
  amount: string;
  idempotencyKey: string;
}

export interface WithdrawResponse {
  withdrawalId: number;
  status: string;
  estimatedGas: string;
}
```

- [ ] **Step 8: Create packages/types/src/index.ts**

```typescript
export * from './chain';
export * from './token';
export * from './wallet';
export * from './transaction';
export * from './api';
```

- [ ] **Step 9: Build and commit**

```bash
cd packages/types && npx tsc && cd ../..
git add packages/types/
git commit -m "feat: add shared types package (@cvh/types)"
```

---

## Task 3: Create Shared Config Package

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/chains.ts`
- Create: `packages/config/src/tokens.ts`

- [ ] **Step 1: Create packages/config/package.json**

```json
{
  "name": "@cvh/config",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@cvh/types": "*"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create packages/config/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/config/src/chains.ts**

```typescript
import { ChainConfig, ChainId, MULTICALL3_ADDRESS } from '@cvh/types';

export const DEFAULT_CHAINS: Record<number, ChainConfig> = {
  [ChainId.ETHEREUM]: {
    chainId: ChainId.ETHEREUM,
    name: 'Ethereum',
    shortName: 'ETH',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcEndpoints: [],
    blockTimeSeconds: 12,
    confirmationsDefault: 12,
    contracts: {
      walletFactoryAddress: null,
      forwarderFactoryAddress: null,
      walletImplementationAddress: null,
      forwarderImplementationAddress: null,
      multicall3Address: MULTICALL3_ADDRESS,
    },
    explorerUrl: 'https://etherscan.io',
    gasPriceStrategy: 'eip1559',
    isActive: true,
    isTestnet: false,
  },
  [ChainId.BSC]: {
    chainId: ChainId.BSC,
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    nativeCurrency: { symbol: 'BNB', decimals: 18 },
    rpcEndpoints: [],
    blockTimeSeconds: 3,
    confirmationsDefault: 15,
    contracts: {
      walletFactoryAddress: null,
      forwarderFactoryAddress: null,
      walletImplementationAddress: null,
      forwarderImplementationAddress: null,
      multicall3Address: MULTICALL3_ADDRESS,
    },
    explorerUrl: 'https://bscscan.com',
    gasPriceStrategy: 'legacy',
    isActive: true,
    isTestnet: false,
  },
  [ChainId.POLYGON]: {
    chainId: ChainId.POLYGON,
    name: 'Polygon',
    shortName: 'POLY',
    nativeCurrency: { symbol: 'MATIC', decimals: 18 },
    rpcEndpoints: [],
    blockTimeSeconds: 2,
    confirmationsDefault: 128,
    contracts: {
      walletFactoryAddress: null,
      forwarderFactoryAddress: null,
      walletImplementationAddress: null,
      forwarderImplementationAddress: null,
      multicall3Address: MULTICALL3_ADDRESS,
    },
    explorerUrl: 'https://polygonscan.com',
    gasPriceStrategy: 'eip1559',
    isActive: true,
    isTestnet: false,
  },
  [ChainId.ARBITRUM]: {
    chainId: ChainId.ARBITRUM,
    name: 'Arbitrum One',
    shortName: 'ARB',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcEndpoints: [],
    blockTimeSeconds: 0.26,
    confirmationsDefault: 12,
    contracts: {
      walletFactoryAddress: null,
      forwarderFactoryAddress: null,
      walletImplementationAddress: null,
      forwarderImplementationAddress: null,
      multicall3Address: MULTICALL3_ADDRESS,
    },
    explorerUrl: 'https://arbiscan.io',
    gasPriceStrategy: 'eip1559',
    isActive: true,
    isTestnet: false,
  },
  [ChainId.OPTIMISM]: {
    chainId: ChainId.OPTIMISM,
    name: 'Optimism',
    shortName: 'OP',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcEndpoints: [],
    blockTimeSeconds: 2,
    confirmationsDefault: 12,
    contracts: {
      walletFactoryAddress: null,
      forwarderFactoryAddress: null,
      walletImplementationAddress: null,
      forwarderImplementationAddress: null,
      multicall3Address: MULTICALL3_ADDRESS,
    },
    explorerUrl: 'https://optimistic.etherscan.io',
    gasPriceStrategy: 'eip1559',
    isActive: true,
    isTestnet: false,
  },
  [ChainId.AVALANCHE]: {
    chainId: ChainId.AVALANCHE,
    name: 'Avalanche C-Chain',
    shortName: 'AVAX',
    nativeCurrency: { symbol: 'AVAX', decimals: 18 },
    rpcEndpoints: [],
    blockTimeSeconds: 2,
    confirmationsDefault: 12,
    contracts: {
      walletFactoryAddress: null,
      forwarderFactoryAddress: null,
      walletImplementationAddress: null,
      forwarderImplementationAddress: null,
      multicall3Address: MULTICALL3_ADDRESS,
    },
    explorerUrl: 'https://snowtrace.io',
    gasPriceStrategy: 'eip1559',
    isActive: true,
    isTestnet: false,
  },
  [ChainId.BASE]: {
    chainId: ChainId.BASE,
    name: 'Base',
    shortName: 'BASE',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    rpcEndpoints: [],
    blockTimeSeconds: 2,
    confirmationsDefault: 12,
    contracts: {
      walletFactoryAddress: null,
      forwarderFactoryAddress: null,
      walletImplementationAddress: null,
      forwarderImplementationAddress: null,
      multicall3Address: MULTICALL3_ADDRESS,
    },
    explorerUrl: 'https://basescan.org',
    gasPriceStrategy: 'eip1559',
    isActive: true,
    isTestnet: false,
  },
};
```

- [ ] **Step 4: Create packages/config/src/tokens.ts**

```typescript
interface DefaultToken {
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  coingeckoId: string;
}

export const DEFAULT_TOKENS: Record<number, DefaultToken[]> = {
  1: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, coingeckoId: 'dai' },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, coingeckoId: 'wrapped-bitcoin' },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, coingeckoId: 'weth' },
    { symbol: 'LINK', name: 'Chainlink', contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, coingeckoId: 'chainlink' },
  ],
  56: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, coingeckoId: 'usd-coin' },
    { symbol: 'BUSD', name: 'Binance USD', contractAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18, coingeckoId: 'binance-usd' },
    { symbol: 'BTCB', name: 'Bitcoin BEP2', contractAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18, coingeckoId: 'binance-bitcoin' },
    { symbol: 'WBNB', name: 'Wrapped BNB', contractAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, coingeckoId: 'wbnb' },
  ],
  137: [
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, coingeckoId: 'weth' },
    { symbol: 'WMATIC', name: 'Wrapped MATIC', contractAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, coingeckoId: 'wmatic' },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, coingeckoId: 'dai' },
  ],
};
```

- [ ] **Step 5: Create packages/config/src/index.ts**

```typescript
export { DEFAULT_CHAINS } from './chains';
export { DEFAULT_TOKENS } from './tokens';
```

- [ ] **Step 6: Build and commit**

```bash
cd packages/config && npx tsc && cd ../..
git add packages/config/
git commit -m "feat: add shared config package (@cvh/config) with chain and token defaults"
```

---

## Task 4: Create Shared Utils Package

**Files:**
- Create: `packages/utils/package.json`
- Create: `packages/utils/tsconfig.json`
- Create: `packages/utils/src/index.ts`
- Create: `packages/utils/src/address.ts`
- Create: `packages/utils/src/format.ts`
- Create: `packages/utils/src/crypto.ts`

- [ ] **Step 1: Create packages/utils/package.json**

```json
{
  "name": "@cvh/utils",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "jest"
  },
  "dependencies": {
    "ethers": "^6.11.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0"
  }
}
```

- [ ] **Step 2: Create packages/utils/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/utils/src/address.ts**

```typescript
import { ethers } from 'ethers';

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export function normalizeAddress(address: string): string {
  return ethers.getAddress(address);
}

export function toLowerAddress(address: string): string {
  return address.toLowerCase();
}

export function computeCreate2Address(
  factoryAddress: string,
  salt: string,
  initCodeHash: string,
): string {
  return ethers.getCreate2Address(factoryAddress, salt, initCodeHash);
}

export function computeForwarderSalt(
  parentAddress: string,
  feeAddress: string,
  userSalt: string,
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'bytes32'],
      [parentAddress, feeAddress, userSalt],
    ),
  );
}

export function computeWalletSalt(signers: string[], userSalt: string): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address[]', 'bytes32'],
      [signers, userSalt],
    ),
  );
}
```

- [ ] **Step 4: Create packages/utils/src/format.ts**

```typescript
import { ethers } from 'ethers';

export function weiToHuman(weiAmount: string, decimals: number): string {
  return ethers.formatUnits(weiAmount, decimals);
}

export function humanToWei(humanAmount: string, decimals: number): string {
  return ethers.parseUnits(humanAmount, decimals).toString();
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function shortenTxHash(hash: string, chars = 6): string {
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}
```

- [ ] **Step 5: Create packages/utils/src/crypto.ts**

```typescript
import { ethers } from 'ethers';

export function keccak256(data: string): string {
  return ethers.keccak256(data);
}

export function hashMessage(message: string): string {
  return ethers.hashMessage(message);
}

export function generateRandomBytes32(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

export function recoverAddress(digest: string, signature: string): string {
  return ethers.recoverAddress(digest, signature);
}
```

- [ ] **Step 6: Create packages/utils/src/index.ts**

```typescript
export * from './address';
export * from './format';
export * from './crypto';
```

- [ ] **Step 7: Build and commit**

```bash
cd packages/utils && npx tsc && cd ../..
git add packages/utils/
git commit -m "feat: add shared utils package (@cvh/utils) with address, format, crypto helpers"
```

---

## Task 5: Initialize Hardhat Project

**Files:**
- Create: `contracts/package.json`
- Create: `contracts/hardhat.config.ts`
- Create: `contracts/tsconfig.json`

- [ ] **Step 1: Create contracts/package.json**

```json
{
  "name": "@cvh/contracts",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "hardhat compile",
    "test": "hardhat test",
    "clean": "hardhat clean",
    "deploy:local": "hardhat run scripts/deploy.ts --network localhost"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "@nomicfoundation/hardhat-ethers": "^3.0.0",
    "@nomicfoundation/hardhat-chai-matchers": "^2.0.0",
    "@typechain/ethers-v6": "^0.5.0",
    "@typechain/hardhat": "^9.0.0",
    "ethers": "^6.11.0",
    "hardhat": "^2.22.0",
    "hardhat-gas-reporter": "^2.0.0",
    "solidity-coverage": "^0.8.0",
    "typechain": "^8.3.0",
    "typescript": "^5.4.0",
    "ts-node": "^10.9.0",
    "chai": "^4.4.0",
    "@types/chai": "^4.3.0",
    "@types/mocha": "^10.0.0",
    "@openzeppelin/contracts": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create contracts/hardhat.config.ts**

```typescript
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      evmVersion: 'paris',
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
};

export default config;
```

- [ ] **Step 3: Create contracts/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "module": "commonjs",
    "esModuleInterop": true
  },
  "include": ["hardhat.config.ts", "scripts/**/*.ts", "test/**/*.ts"],
  "files": ["hardhat.config.ts"]
}
```

- [ ] **Step 4: Create directory structure and install**

```bash
mkdir -p contracts/contracts/interfaces contracts/test/helpers contracts/scripts
cd contracts && npm install && cd ..
```

- [ ] **Step 5: Commit**

```bash
git add contracts/package.json contracts/hardhat.config.ts contracts/tsconfig.json contracts/package-lock.json
git commit -m "chore: initialize Hardhat project for smart contracts"
```

---

## Task 6: Implement TransferHelper and Interfaces

**Files:**
- Create: `contracts/contracts/interfaces/IERC20.sol`
- Create: `contracts/contracts/interfaces/IForwarder.sol`
- Create: `contracts/contracts/TransferHelper.sol`

- [ ] **Step 1: Create contracts/contracts/interfaces/IERC20.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

abstract contract ERC20Interface {
    function transfer(address to, uint256 value) public virtual returns (bool);
    function balanceOf(address who) public view virtual returns (uint256);
}
```

- [ ] **Step 2: Create contracts/contracts/interfaces/IForwarder.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

interface IForwarder {
    function init(
        address _parentAddress,
        address _feeAddress,
        bool _autoFlush721,
        bool _autoFlush1155
    ) external;

    function flushTokens(address tokenContractAddress) external;
    function batchFlushERC20Tokens(address[] calldata tokenContractAddresses) external;
    function flush() external;
}
```

- [ ] **Step 3: Create contracts/contracts/TransferHelper.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

/// @title TransferHelper
/// @notice Safe ERC20 transfer that handles non-standard tokens (like USDT)
library TransferHelper {
    function safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: TRANSFER_FAILED"
        );
    }
}
```

- [ ] **Step 4: Compile to verify no errors**

```bash
cd contracts && npx hardhat compile && cd ..
```

Expected: Compilation successful, no errors.

- [ ] **Step 5: Commit**

```bash
git add contracts/contracts/interfaces/ contracts/contracts/TransferHelper.sol
git commit -m "feat: add ERC20 interface, IForwarder interface, and TransferHelper library"
```

---

## Task 7: Implement CloneFactory (EIP-1167)

**Files:**
- Create: `contracts/contracts/CloneFactory.sol`

- [ ] **Step 1: Create contracts/contracts/CloneFactory.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

/// @title CloneFactory
/// @notice Deploys EIP-1167 minimal proxy contracts using CREATE2
contract CloneFactory {
    /// @notice Deploy a minimal proxy clone using CREATE2
    /// @param target Implementation contract address
    /// @param salt Deterministic salt for CREATE2
    /// @return result Address of the deployed clone
    function createClone(
        address target,
        bytes32 salt
    ) internal returns (address payable result) {
        bytes20 targetBytes = bytes20(target);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            result := create2(0, clone, 0x37, salt)
        }
        require(result != address(0), "CloneFactory: CREATE2 failed");
    }

    /// @notice Predict the address a clone will be deployed to
    /// @param target Implementation contract address
    /// @param salt Deterministic salt
    /// @return predicted The predicted address
    function computeCloneAddress(
        address target,
        bytes32 salt
    ) internal view returns (address predicted) {
        bytes20 targetBytes = bytes20(target);
        bytes32 bytecodeHash;
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            bytecodeHash := keccak256(clone, 0x37)
        }
        predicted = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash))))
        );
    }
}
```

- [ ] **Step 2: Compile to verify**

```bash
cd contracts && npx hardhat compile && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add contracts/contracts/CloneFactory.sol
git commit -m "feat: add CloneFactory with EIP-1167 CREATE2 minimal proxy deployment"
```

---

## Task 8: Implement CvhWalletSimple

**Files:**
- Create: `contracts/contracts/CvhWalletSimple.sol`

- [ ] **Step 1: Create contracts/contracts/CvhWalletSimple.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import "./TransferHelper.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IForwarder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @title CvhWalletSimple
/// @notice 2-of-3 multisig wallet adapted from BitGo WalletSimple
contract CvhWalletSimple is IERC721Receiver, ERC165, IERC1155Receiver {
    uint256 private constant MAX_SEQUENCE_ID_INCREASE = 10000;
    uint256 public constant SEQUENCE_ID_WINDOW_SIZE = 10;

    mapping(address => bool) public signers;
    bool public initialized;
    bool public safeMode;
    uint256[10] public recentSequenceIds;

    event Deposited(address from, uint256 value, bytes data);
    event Transacted(
        address msgSender,
        address otherSigner,
        bytes32 operation,
        address toAddress,
        uint256 value,
        bytes data
    );
    event BatchTransacted(address msgSender, address otherSigner, bytes32 operation);
    event BatchTransfer(address sender, address recipient, uint256 value);
    event SafeModeActivated(address msgSender);

    modifier onlyUninitialized() {
        require(!initialized, "Already initialized");
        _;
    }

    modifier onlySigner() {
        require(signers[msg.sender], "Not a signer");
        _;
    }

    /// @notice Initialize the wallet with 3 signers
    function init(address[] calldata allowedSigners) external onlyUninitialized {
        require(allowedSigners.length == 3, "Must have 3 signers");
        for (uint256 i = 0; i < 3; i++) {
            require(allowedSigners[i] != address(0), "Invalid signer");
            require(!signers[allowedSigners[i]], "Duplicate signer");
            signers[allowedSigners[i]] = true;
        }
        initialized = true;
    }

    receive() external payable {
        if (msg.value > 0) {
            emit Deposited(msg.sender, msg.value, "");
        }
    }

    fallback() external payable {
        if (msg.value > 0) {
            emit Deposited(msg.sender, msg.value, msg.data);
        }
    }

    /// @notice Get the network ID for replay protection
    function getNetworkId() internal view virtual returns (string memory) {
        return Strings.toString(block.chainid);
    }

    function getTokenNetworkId() internal view virtual returns (string memory) {
        return string.concat(getNetworkId(), "-ERC20");
    }

    function getBatchNetworkId() internal view virtual returns (string memory) {
        return string.concat(getNetworkId(), "-Batch");
    }

    /// @notice Execute a multisig transaction
    function sendMultiSig(
        address toAddress,
        uint256 value,
        bytes calldata data,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) external onlySigner {
        bytes32 operationHash = keccak256(
            abi.encode(getNetworkId(), toAddress, value, data, expireTime, sequenceId)
        );

        address otherSigner = _verifyMultiSig(operationHash, signature, expireTime, sequenceId);

        if (safeMode) {
            require(signers[toAddress], "Safe mode: can only send to signers");
        }

        (bool success, ) = toAddress.call{value: value}(data);
        require(success, "Call failed");

        emit Transacted(msg.sender, otherSigner, operationHash, toAddress, value, data);
    }

    /// @notice Execute a multisig ERC20 token transfer
    function sendMultiSigToken(
        address toAddress,
        uint256 value,
        address tokenContractAddress,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) external onlySigner {
        bytes32 operationHash = keccak256(
            abi.encodePacked(
                getTokenNetworkId(),
                toAddress,
                value,
                tokenContractAddress,
                expireTime,
                sequenceId
            )
        );

        address otherSigner = _verifyMultiSig(operationHash, signature, expireTime, sequenceId);

        if (safeMode) {
            require(signers[toAddress], "Safe mode: can only send to signers");
        }

        TransferHelper.safeTransfer(tokenContractAddress, toAddress, value);

        emit Transacted(
            msg.sender,
            otherSigner,
            operationHash,
            toAddress,
            value,
            abi.encodePacked(tokenContractAddress)
        );
    }

    /// @notice Execute batch ETH transfers
    function sendMultiSigBatch(
        address[] calldata recipients,
        uint256[] calldata values,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) external onlySigner {
        require(!safeMode, "Batch not allowed in safe mode");
        require(recipients.length == values.length, "Length mismatch");
        require(recipients.length > 0 && recipients.length <= 255, "Invalid batch size");

        bytes32 operationHash = keccak256(
            abi.encode(getBatchNetworkId(), recipients, values, expireTime, sequenceId)
        );

        address otherSigner = _verifyMultiSig(operationHash, signature, expireTime, sequenceId);

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool success, ) = recipients[i].call{value: values[i]}("");
            require(success, "Batch transfer failed");
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
        }

        emit BatchTransacted(msg.sender, otherSigner, operationHash);
    }

    /// @notice Flush tokens from a forwarder to this wallet (single signer)
    function flushForwarderTokens(
        address payable forwarderAddress,
        address tokenContractAddress
    ) external onlySigner {
        IForwarder(forwarderAddress).flushTokens(tokenContractAddress);
    }

    /// @notice Activate safe mode (irrevocable)
    function activateSafeMode() external onlySigner {
        safeMode = true;
        emit SafeModeActivated(msg.sender);
    }

    /// @notice Get the next available sequence ID
    function getNextSequenceId() public view returns (uint256) {
        uint256 highest = 0;
        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE; i++) {
            if (recentSequenceIds[i] > highest) {
                highest = recentSequenceIds[i];
            }
        }
        return highest + 1;
    }

    function _verifyMultiSig(
        bytes32 operationHash,
        bytes calldata signature,
        uint256 expireTime,
        uint256 sequenceId
    ) private returns (address) {
        address otherSigner = _recoverAddressFromSignature(operationHash, signature);

        require(signers[otherSigner], "Invalid signer");
        require(otherSigner != msg.sender, "Cannot self-sign");
        require(block.timestamp <= expireTime, "Transaction expired");

        _tryInsertSequenceId(sequenceId);

        return otherSigner;
    }

    function _recoverAddressFromSignature(
        bytes32 operationHash,
        bytes memory signature
    ) private pure returns (address) {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        // Protect against signature malleability
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "Invalid signature s value"
        );

        return ecrecover(operationHash, v, r, s);
    }

    function _tryInsertSequenceId(uint256 sequenceId) private {
        uint256 lowestValueIndex = 0;
        uint256[10] memory ids = recentSequenceIds;

        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE; i++) {
            require(ids[i] != sequenceId, "Sequence ID already used");
            if (ids[i] < ids[lowestValueIndex]) {
                lowestValueIndex = i;
            }
        }

        require(sequenceId > ids[lowestValueIndex], "Sequence ID too low");
        require(
            sequenceId <= ids[lowestValueIndex] + MAX_SEQUENCE_ID_INCREASE,
            "Sequence ID too high"
        );

        recentSequenceIds[lowestValueIndex] = sequenceId;
    }

    // ERC721/ERC1155 receiver support
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public pure override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
```

- [ ] **Step 2: Compile to verify**

```bash
cd contracts && npx hardhat compile && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add contracts/contracts/CvhWalletSimple.sol
git commit -m "feat: add CvhWalletSimple 2-of-3 multisig wallet contract"
```

---

## Task 9: Implement CvhForwarder

**Files:**
- Create: `contracts/contracts/CvhForwarder.sol`

- [ ] **Step 1: Create contracts/contracts/CvhForwarder.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import "./TransferHelper.sol";
import "./interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @title CvhForwarder
/// @notice Deposit address contract that auto-forwards ETH to parent wallet
///         and allows flushing ERC20 tokens by parent or feeAddress
contract CvhForwarder is IERC721Receiver, ERC165, IERC1155Receiver {
    address payable public parentAddress;
    address public feeAddress;
    bool public autoFlush721;
    bool public autoFlush1155;
    bool private initialized;

    event ForwarderDeposited(address from, uint256 value, bytes data);

    modifier onlyParent() {
        require(msg.sender == parentAddress, "Only parent");
        _;
    }

    modifier onlyAllowedAddress() {
        require(
            msg.sender == parentAddress || msg.sender == feeAddress,
            "Only parent or fee address"
        );
        _;
    }

    /// @notice Initialize the forwarder
    function init(
        address _parentAddress,
        address _feeAddress,
        bool _autoFlush721,
        bool _autoFlush1155
    ) external {
        require(!initialized, "Already initialized");
        require(_parentAddress != address(0), "Invalid parent");
        parentAddress = payable(_parentAddress);
        feeAddress = _feeAddress;
        autoFlush721 = _autoFlush721;
        autoFlush1155 = _autoFlush1155;
        initialized = true;

        // Flush any ETH sent before initialization
        uint256 value = address(this).balance;
        if (value > 0) {
            flush();
        }
    }

    receive() external payable {
        flush();
    }

    fallback() external payable {
        flush();
    }

    /// @notice Forward all ETH to parent wallet
    function flush() public {
        uint256 value = address(this).balance;
        if (value == 0) return;

        (bool success, ) = parentAddress.call{value: value}("");
        require(success, "Flush failed");
        emit ForwarderDeposited(msg.sender, value, msg.data);
    }

    /// @notice Flush a single ERC20 token to parent
    function flushTokens(address tokenContractAddress) external onlyAllowedAddress {
        ERC20Interface token = ERC20Interface(tokenContractAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) return;
        TransferHelper.safeTransfer(tokenContractAddress, parentAddress, balance);
    }

    /// @notice Flush multiple ERC20 tokens to parent in one transaction
    function batchFlushERC20Tokens(
        address[] calldata tokenContractAddresses
    ) external onlyAllowedAddress {
        for (uint256 i = 0; i < tokenContractAddresses.length; i++) {
            ERC20Interface token = ERC20Interface(tokenContractAddresses[i]);
            uint256 balance = token.balanceOf(address(this));
            if (balance > 0) {
                TransferHelper.safeTransfer(tokenContractAddresses[i], parentAddress, balance);
            }
        }
    }

    /// @notice Flush a specific ERC721 token to parent
    function flushERC721Token(
        address tokenContractAddress,
        uint256 tokenId
    ) external onlyAllowedAddress {
        IERC721(tokenContractAddress).safeTransferFrom(address(this), parentAddress, tokenId);
    }

    /// @notice Flush ERC1155 tokens to parent
    function flushERC1155Tokens(
        address tokenContractAddress,
        uint256 tokenId
    ) external onlyAllowedAddress {
        uint256 balance = IERC1155(tokenContractAddress).balanceOf(address(this), tokenId);
        if (balance > 0) {
            IERC1155(tokenContractAddress).safeTransferFrom(
                address(this),
                parentAddress,
                tokenId,
                balance,
                ""
            );
        }
    }

    /// @notice Set auto-flush for ERC721
    function setAutoFlush721(bool _autoFlush) external onlyAllowedAddress {
        autoFlush721 = _autoFlush;
    }

    /// @notice Set auto-flush for ERC1155
    function setAutoFlush1155(bool _autoFlush) external onlyAllowedAddress {
        autoFlush1155 = _autoFlush;
    }

    /// @notice Execute arbitrary call from parent only
    function callFromParent(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyParent returns (bytes memory) {
        (bool success, bytes memory returnData) = target.call{value: value}(data);
        require(success, "Call failed");
        return returnData;
    }

    // Auto-flush NFTs on receive if enabled
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        if (autoFlush721) {
            try IERC721(msg.sender).supportsInterface(type(IERC721).interfaceId) returns (bool supported) {
                if (supported) {
                    IERC721(msg.sender).safeTransferFrom(address(this), parentAddress, tokenId);
                }
            } catch {}
        }
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256 id,
        uint256 value,
        bytes calldata
    ) external override returns (bytes4) {
        if (autoFlush1155) {
            try IERC1155(msg.sender).supportsInterface(type(IERC1155).interfaceId) returns (bool supported) {
                if (supported) {
                    IERC1155(msg.sender).safeTransferFrom(address(this), parentAddress, id, value, "");
                }
            } catch {}
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public pure override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
```

- [ ] **Step 2: Compile to verify**

```bash
cd contracts && npx hardhat compile && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add contracts/contracts/CvhForwarder.sol
git commit -m "feat: add CvhForwarder deposit address contract with auto-flush and feeAddress"
```

---

## Task 10: Implement Factories

**Files:**
- Create: `contracts/contracts/CvhWalletFactory.sol`
- Create: `contracts/contracts/CvhForwarderFactory.sol`

- [ ] **Step 1: Create contracts/contracts/CvhWalletFactory.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import "./CvhWalletSimple.sol";
import "./CloneFactory.sol";

/// @title CvhWalletFactory
/// @notice Deploys CvhWalletSimple proxies via CREATE2
contract CvhWalletFactory is CloneFactory {
    address public implementationAddress;

    event WalletCreated(address newWalletAddress, address[] allowedSigners);

    constructor(address _implementationAddress) {
        implementationAddress = _implementationAddress;
    }

    /// @notice Deploy a new wallet with deterministic address
    function createWallet(
        address[] calldata allowedSigners,
        bytes32 salt
    ) external returns (address) {
        bytes32 finalSalt = keccak256(abi.encodePacked(allowedSigners, salt));
        address payable clone = createClone(implementationAddress, finalSalt);
        CvhWalletSimple(clone).init(allowedSigners);
        emit WalletCreated(clone, allowedSigners);
        return clone;
    }

    /// @notice Compute the address a wallet will be deployed to
    function computeWalletAddress(
        address[] calldata allowedSigners,
        bytes32 salt
    ) external view returns (address) {
        bytes32 finalSalt = keccak256(abi.encodePacked(allowedSigners, salt));
        return computeCloneAddress(implementationAddress, finalSalt);
    }
}
```

- [ ] **Step 2: Create contracts/contracts/CvhForwarderFactory.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import "./CvhForwarder.sol";
import "./CloneFactory.sol";

/// @title CvhForwarderFactory
/// @notice Deploys CvhForwarder proxies via CREATE2
contract CvhForwarderFactory is CloneFactory {
    address public implementationAddress;

    event ForwarderCreated(
        address newForwarderAddress,
        address parentAddress,
        address feeAddress,
        bool shouldAutoFlushERC721,
        bool shouldAutoFlushERC1155
    );

    constructor(address _implementationAddress) {
        implementationAddress = _implementationAddress;
    }

    /// @notice Deploy a new forwarder with deterministic address
    function createForwarder(
        address parent,
        address feeAddress,
        bytes32 salt,
        bool shouldAutoFlushERC721,
        bool shouldAutoFlushERC1155
    ) external returns (address) {
        bytes32 finalSalt = keccak256(abi.encodePacked(parent, feeAddress, salt));
        address payable clone = createClone(implementationAddress, finalSalt);
        CvhForwarder(clone).init(parent, feeAddress, shouldAutoFlushERC721, shouldAutoFlushERC1155);
        emit ForwarderCreated(clone, parent, feeAddress, shouldAutoFlushERC721, shouldAutoFlushERC1155);
        return clone;
    }

    /// @notice Compute the address a forwarder will be deployed to
    function computeForwarderAddress(
        address parent,
        address feeAddress,
        bytes32 salt
    ) external view returns (address) {
        bytes32 finalSalt = keccak256(abi.encodePacked(parent, feeAddress, salt));
        return computeCloneAddress(implementationAddress, finalSalt);
    }
}
```

- [ ] **Step 3: Compile to verify**

```bash
cd contracts && npx hardhat compile && cd ..
```

- [ ] **Step 4: Commit**

```bash
git add contracts/contracts/CvhWalletFactory.sol contracts/contracts/CvhForwarderFactory.sol
git commit -m "feat: add CvhWalletFactory and CvhForwarderFactory with CREATE2 deterministic deployment"
```

---

## Task 11: Implement CvhBatcher

**Files:**
- Create: `contracts/contracts/CvhBatcher.sol`

- [ ] **Step 1: Create contracts/contracts/CvhBatcher.sol**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import "./TransferHelper.sol";

/// @title CvhBatcher
/// @notice Batch distribute ETH or ERC20 tokens to multiple recipients
contract CvhBatcher {
    address public owner;
    uint256 public transferGasLimit;
    uint256 public batchTransferLimit;

    event BatchTransfer(address sender, address recipient, uint256 value);
    event TransferGasLimitChange(uint256 prevLimit, uint256 newLimit);
    event BatchTransferLimitChange(uint256 prevLimit, uint256 newLimit);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        transferGasLimit = 30000;
        batchTransferLimit = 255;
    }

    /// @notice Batch send ETH to multiple recipients
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata values
    ) external payable {
        require(recipients.length == values.length, "Length mismatch");
        require(recipients.length <= batchTransferLimit, "Too many recipients");

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool success, ) = recipients[i].call{value: values[i], gas: transferGasLimit}("");
            require(success, "Transfer failed");
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
        }
    }

    /// @notice Batch send ERC20 tokens to multiple recipients
    function batchTransferToken(
        address tokenAddress,
        address[] calldata recipients,
        uint256[] calldata values
    ) external {
        require(recipients.length == values.length, "Length mismatch");
        require(recipients.length <= batchTransferLimit, "Too many recipients");

        for (uint256 i = 0; i < recipients.length; i++) {
            TransferHelper.safeTransfer(tokenAddress, recipients[i], values[i]);
            emit BatchTransfer(msg.sender, recipients[i], values[i]);
        }
    }

    function setTransferGasLimit(uint256 newLimit) external onlyOwner {
        emit TransferGasLimitChange(transferGasLimit, newLimit);
        transferGasLimit = newLimit;
    }

    function setBatchTransferLimit(uint256 newLimit) external onlyOwner {
        emit BatchTransferLimitChange(batchTransferLimit, newLimit);
        batchTransferLimit = newLimit;
    }

    /// @notice Recover ETH stuck in the contract
    function recover(address payable to) external onlyOwner {
        (bool success, ) = to.call{value: address(this).balance}("");
        require(success, "Recovery failed");
    }
}
```

- [ ] **Step 2: Compile to verify**

```bash
cd contracts && npx hardhat compile && cd ..
```

- [ ] **Step 3: Commit**

```bash
git add contracts/contracts/CvhBatcher.sol
git commit -m "feat: add CvhBatcher for batch ETH/ERC20 distribution"
```

---

## Task 12: Write Test Helpers

**Files:**
- Create: `contracts/test/helpers/setup.ts`

- [ ] **Step 1: Create contracts/test/helpers/setup.ts**

```typescript
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

export async function getSigners() {
  const [deployer, signer1, signer2, signer3, feeAddress, recipient, other] =
    await ethers.getSigners();
  return { deployer, signer1, signer2, signer3, feeAddress, recipient, other };
}

export async function deployWalletSimple() {
  const { deployer, signer1, signer2, signer3 } = await getSigners();
  const CvhWalletSimple = await ethers.getContractFactory('CvhWalletSimple');
  const implementation = await CvhWalletSimple.deploy();
  await implementation.waitForDeployment();
  return { implementation, deployer, signer1, signer2, signer3 };
}

export async function deployInitializedWallet() {
  const { implementation, deployer, signer1, signer2, signer3 } = await deployWalletSimple();
  await implementation.init([signer1.address, signer2.address, signer3.address]);
  return { wallet: implementation, deployer, signer1, signer2, signer3 };
}

export async function deployForwarder() {
  const { deployer, signer1, feeAddress } = await getSigners();
  const CvhForwarder = await ethers.getContractFactory('CvhForwarder');
  const forwarder = await CvhForwarder.deploy();
  await forwarder.waitForDeployment();
  return { forwarder, deployer, signer1, feeAddress };
}

export async function deployMockERC20(name: string, symbol: string, decimals: number) {
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const token = await MockERC20.deploy(name, symbol, decimals);
  await token.waitForDeployment();
  return token;
}

export function createOperationHash(
  networkId: string,
  toAddress: string,
  value: bigint,
  data: string,
  expireTime: number,
  sequenceId: number,
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
      [networkId, toAddress, value, data, expireTime, sequenceId],
    ),
  );
}

export async function signOperation(
  signer: SignerWithAddress,
  operationHash: string,
): Promise<string> {
  const messageBytes = ethers.getBytes(operationHash);
  // Sign the raw hash (not eth_sign which prefixes)
  const signingKey = new ethers.SigningKey(
    // We need to get the private key - in hardhat, signers have deterministic keys
    // For tests, we use signMessage equivalent
  );
  // Use low-level signing to match contract's ecrecover expectation
  const sig = signer.signingKey.sign(operationHash);
  return ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
}

export function futureTimestamp(secondsFromNow: number): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}
```

- [ ] **Step 2: Create a MockERC20 for testing**

Create `contracts/contracts/test/MockERC20.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

- [ ] **Step 3: Compile and commit**

```bash
mkdir -p contracts/contracts/test
cd contracts && npx hardhat compile && cd ..
git add contracts/test/helpers/setup.ts contracts/contracts/test/MockERC20.sol
git commit -m "feat: add test helpers and MockERC20 for contract testing"
```

---

## Task 13: Write CvhWalletSimple Tests

**Files:**
- Create: `contracts/test/CvhWalletSimple.test.ts`

- [ ] **Step 1: Create contracts/test/CvhWalletSimple.test.ts**

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhWalletSimple, MockERC20 } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('CvhWalletSimple', () => {
  let wallet: CvhWalletSimple;
  let token: MockERC20;
  let signer1: SignerWithAddress;
  let signer2: SignerWithAddress;
  let signer3: SignerWithAddress;
  let recipient: SignerWithAddress;
  let other: SignerWithAddress;

  beforeEach(async () => {
    [, signer1, signer2, signer3, recipient, other] = await ethers.getSigners();

    const WalletFactory = await ethers.getContractFactory('CvhWalletSimple');
    wallet = await WalletFactory.deploy();
    await wallet.waitForDeployment();

    await wallet.init([signer1.address, signer2.address, signer3.address]);

    const TokenFactory = await ethers.getContractFactory('MockERC20');
    token = await TokenFactory.deploy('Test USDT', 'USDT', 18);
    await token.waitForDeployment();
  });

  describe('Initialization', () => {
    it('should set 3 signers correctly', async () => {
      expect(await wallet.signers(signer1.address)).to.be.true;
      expect(await wallet.signers(signer2.address)).to.be.true;
      expect(await wallet.signers(signer3.address)).to.be.true;
      expect(await wallet.signers(other.address)).to.be.false;
    });

    it('should not allow re-initialization', async () => {
      await expect(
        wallet.init([signer1.address, signer2.address, signer3.address]),
      ).to.be.revertedWith('Already initialized');
    });

    it('should reject less than 3 signers', async () => {
      const newWallet = await (await ethers.getContractFactory('CvhWalletSimple')).deploy();
      await expect(
        newWallet.init([signer1.address, signer2.address]),
      ).to.be.revertedWith('Must have 3 signers');
    });
  });

  describe('Deposits', () => {
    it('should receive ETH and emit Deposited event', async () => {
      const value = ethers.parseEther('1.0');
      await expect(
        signer1.sendTransaction({ to: await wallet.getAddress(), value }),
      ).to.emit(wallet, 'Deposited').withArgs(signer1.address, value, '0x');
    });

    it('should have correct balance after deposit', async () => {
      const value = ethers.parseEther('2.5');
      await signer1.sendTransaction({ to: await wallet.getAddress(), value });
      expect(await ethers.provider.getBalance(await wallet.getAddress())).to.equal(value);
    });
  });

  describe('sendMultiSig', () => {
    it('should execute ETH transfer with valid 2-of-3 signature', async () => {
      // Fund the wallet
      const walletAddr = await wallet.getAddress();
      await signer1.sendTransaction({ to: walletAddr, value: ethers.parseEther('5.0') });

      const toAddress = recipient.address;
      const value = ethers.parseEther('1.0');
      const data = '0x';
      const expireTime = Math.floor(Date.now() / 1000) + 3600;
      const sequenceId = 1;
      const networkId = '31337'; // hardhat chainid

      // Create operation hash
      const operationHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
          [networkId, toAddress, value, data, expireTime, sequenceId],
        ),
      );

      // Signer2 signs offline
      const sig = signer2.signingKey.sign(operationHash);
      const signature = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);

      // Signer1 submits (msg.sender) with signer2's signature
      const recipientBalanceBefore = await ethers.provider.getBalance(toAddress);

      await expect(
        wallet.connect(signer1).sendMultiSig(toAddress, value, data, expireTime, sequenceId, signature),
      ).to.emit(wallet, 'Transacted');

      const recipientBalanceAfter = await ethers.provider.getBalance(toAddress);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(value);
    });

    it('should reject self-signing (same signer for both)', async () => {
      await signer1.sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.parseEther('5.0'),
      });

      const expireTime = Math.floor(Date.now() / 1000) + 3600;
      const operationHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
          ['31337', recipient.address, ethers.parseEther('1.0'), '0x', expireTime, 1],
        ),
      );

      // Signer1 signs and also submits (self-sign attempt)
      const sig = signer1.signingKey.sign(operationHash);
      const signature = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);

      await expect(
        wallet.connect(signer1).sendMultiSig(
          recipient.address, ethers.parseEther('1.0'), '0x', expireTime, 1, signature,
        ),
      ).to.be.revertedWith('Cannot self-sign');
    });

    it('should reject expired transaction', async () => {
      await signer1.sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.parseEther('5.0'),
      });

      const expireTime = Math.floor(Date.now() / 1000) - 3600; // past
      const operationHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
          ['31337', recipient.address, ethers.parseEther('1.0'), '0x', expireTime, 1],
        ),
      );

      const sig = signer2.signingKey.sign(operationHash);
      const signature = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);

      await expect(
        wallet.connect(signer1).sendMultiSig(
          recipient.address, ethers.parseEther('1.0'), '0x', expireTime, 1, signature,
        ),
      ).to.be.revertedWith('Transaction expired');
    });

    it('should reject non-signer as msg.sender', async () => {
      await expect(
        wallet.connect(other).sendMultiSig(recipient.address, 0, '0x', 9999999999, 1, '0x' + '00'.repeat(65)),
      ).to.be.revertedWith('Not a signer');
    });
  });

  describe('Safe Mode', () => {
    it('should activate safe mode', async () => {
      await expect(wallet.connect(signer1).activateSafeMode())
        .to.emit(wallet, 'SafeModeActivated')
        .withArgs(signer1.address);
      expect(await wallet.safeMode()).to.be.true;
    });

    it('should reject non-signer activating safe mode', async () => {
      await expect(wallet.connect(other).activateSafeMode()).to.be.revertedWith('Not a signer');
    });
  });

  describe('Sequence IDs', () => {
    it('should return 1 as first available sequence ID', async () => {
      expect(await wallet.getNextSequenceId()).to.equal(1);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd contracts && npx hardhat test test/CvhWalletSimple.test.ts && cd ..
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/CvhWalletSimple.test.ts
git commit -m "test: add CvhWalletSimple tests for init, deposits, multisig, safe mode"
```

---

## Task 14: Write CvhForwarder Tests

**Files:**
- Create: `contracts/test/CvhForwarder.test.ts`

- [ ] **Step 1: Create contracts/test/CvhForwarder.test.ts**

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CvhForwarder, MockERC20 } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('CvhForwarder', () => {
  let forwarder: CvhForwarder;
  let token: MockERC20;
  let parent: SignerWithAddress;
  let feeAddr: SignerWithAddress;
  let depositor: SignerWithAddress;
  let other: SignerWithAddress;

  beforeEach(async () => {
    [, parent, feeAddr, depositor, other] = await ethers.getSigners();

    const ForwarderFactory = await ethers.getContractFactory('CvhForwarder');
    forwarder = await ForwarderFactory.deploy();
    await forwarder.waitForDeployment();
    await forwarder.init(parent.address, feeAddr.address, true, true);

    const TokenFactory = await ethers.getContractFactory('MockERC20');
    token = await TokenFactory.deploy('Test USDT', 'USDT', 18);
    await token.waitForDeployment();
  });

  describe('Initialization', () => {
    it('should set parent and feeAddress correctly', async () => {
      expect(await forwarder.parentAddress()).to.equal(parent.address);
      expect(await forwarder.feeAddress()).to.equal(feeAddr.address);
    });

    it('should not allow re-initialization', async () => {
      await expect(
        forwarder.init(parent.address, feeAddr.address, true, true),
      ).to.be.revertedWith('Already initialized');
    });
  });

  describe('ETH Auto-Forward', () => {
    it('should auto-forward ETH to parent on receive', async () => {
      const value = ethers.parseEther('1.0');
      const parentBalanceBefore = await ethers.provider.getBalance(parent.address);

      await depositor.sendTransaction({
        to: await forwarder.getAddress(),
        value,
      });

      const parentBalanceAfter = await ethers.provider.getBalance(parent.address);
      expect(parentBalanceAfter - parentBalanceBefore).to.equal(value);

      // Forwarder should have 0 balance
      expect(await ethers.provider.getBalance(await forwarder.getAddress())).to.equal(0);
    });

    it('should emit ForwarderDeposited event on ETH forward', async () => {
      const value = ethers.parseEther('0.5');
      await expect(
        depositor.sendTransaction({ to: await forwarder.getAddress(), value }),
      ).to.emit(forwarder, 'ForwarderDeposited');
    });
  });

  describe('ERC20 Flush', () => {
    it('should flush tokens when called by parent', async () => {
      const amount = ethers.parseEther('1000');
      await token.mint(await forwarder.getAddress(), amount);

      expect(await token.balanceOf(await forwarder.getAddress())).to.equal(amount);

      await forwarder.connect(parent).flushTokens(await token.getAddress());

      expect(await token.balanceOf(await forwarder.getAddress())).to.equal(0);
      expect(await token.balanceOf(parent.address)).to.equal(amount);
    });

    it('should flush tokens when called by feeAddress', async () => {
      const amount = ethers.parseEther('500');
      await token.mint(await forwarder.getAddress(), amount);

      await forwarder.connect(feeAddr).flushTokens(await token.getAddress());

      expect(await token.balanceOf(parent.address)).to.equal(amount);
    });

    it('should reject flush from unauthorized address', async () => {
      await token.mint(await forwarder.getAddress(), ethers.parseEther('100'));

      await expect(
        forwarder.connect(other).flushTokens(await token.getAddress()),
      ).to.be.revertedWith('Only parent or fee address');
    });

    it('should handle zero balance gracefully', async () => {
      // Should not revert on zero balance
      await forwarder.connect(parent).flushTokens(await token.getAddress());
    });
  });

  describe('Batch Flush', () => {
    it('should flush multiple tokens in one transaction', async () => {
      const token2 = await (await ethers.getContractFactory('MockERC20'))
        .deploy('Test USDC', 'USDC', 18);

      await token.mint(await forwarder.getAddress(), ethers.parseEther('100'));
      await token2.mint(await forwarder.getAddress(), ethers.parseEther('200'));

      await forwarder.connect(feeAddr).batchFlushERC20Tokens([
        await token.getAddress(),
        await token2.getAddress(),
      ]);

      expect(await token.balanceOf(parent.address)).to.equal(ethers.parseEther('100'));
      expect(await token2.balanceOf(parent.address)).to.equal(ethers.parseEther('200'));
    });
  });

  describe('callFromParent', () => {
    it('should only allow parent to execute arbitrary calls', async () => {
      await expect(
        forwarder.connect(feeAddr).callFromParent(other.address, 0, '0x'),
      ).to.be.revertedWith('Only parent');
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd contracts && npx hardhat test test/CvhForwarder.test.ts && cd ..
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/CvhForwarder.test.ts
git commit -m "test: add CvhForwarder tests for ETH auto-forward, ERC20 flush, batch flush"
```

---

## Task 15: Write Factory Tests

**Files:**
- Create: `contracts/test/CvhWalletFactory.test.ts`
- Create: `contracts/test/CvhForwarderFactory.test.ts`

- [ ] **Step 1: Create contracts/test/CvhWalletFactory.test.ts**

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('CvhWalletFactory', () => {
  it('should deploy a wallet proxy with correct signers', async () => {
    const [, signer1, signer2, signer3] = await ethers.getSigners();

    const WalletImpl = await ethers.getContractFactory('CvhWalletSimple');
    const impl = await WalletImpl.deploy();

    const Factory = await ethers.getContractFactory('CvhWalletFactory');
    const factory = await Factory.deploy(await impl.getAddress());

    const salt = ethers.keccak256(ethers.toUtf8Bytes('test-wallet-1'));
    const signers = [signer1.address, signer2.address, signer3.address];

    const tx = await factory.createWallet(signers, salt);
    const receipt = await tx.wait();

    const event = receipt?.logs.find(
      (log) => factory.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === 'WalletCreated',
    );
    expect(event).to.not.be.undefined;

    const parsedEvent = factory.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    const walletAddress = parsedEvent!.args.newWalletAddress;

    // Verify the deployed wallet has correct signers
    const wallet = WalletImpl.attach(walletAddress);
    expect(await wallet.signers(signer1.address)).to.be.true;
    expect(await wallet.signers(signer2.address)).to.be.true;
    expect(await wallet.signers(signer3.address)).to.be.true;
  });

  it('should compute deterministic address correctly', async () => {
    const [, signer1, signer2, signer3] = await ethers.getSigners();

    const WalletImpl = await ethers.getContractFactory('CvhWalletSimple');
    const impl = await WalletImpl.deploy();

    const Factory = await ethers.getContractFactory('CvhWalletFactory');
    const factory = await Factory.deploy(await impl.getAddress());

    const salt = ethers.keccak256(ethers.toUtf8Bytes('deterministic-test'));
    const signers = [signer1.address, signer2.address, signer3.address];

    const predicted = await factory.computeWalletAddress(signers, salt);
    const tx = await factory.createWallet(signers, salt);
    const receipt = await tx.wait();

    const event = receipt?.logs.find(
      (log) => factory.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === 'WalletCreated',
    );
    const parsedEvent = factory.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    const actualAddress = parsedEvent!.args.newWalletAddress;

    expect(actualAddress).to.equal(predicted);
  });
});
```

- [ ] **Step 2: Create contracts/test/CvhForwarderFactory.test.ts**

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('CvhForwarderFactory', () => {
  it('should deploy a forwarder proxy with correct parent and feeAddress', async () => {
    const [, parent, feeAddr] = await ethers.getSigners();

    const ForwarderImpl = await ethers.getContractFactory('CvhForwarder');
    const impl = await ForwarderImpl.deploy();

    const Factory = await ethers.getContractFactory('CvhForwarderFactory');
    const factory = await Factory.deploy(await impl.getAddress());

    const salt = ethers.keccak256(ethers.toUtf8Bytes('forwarder-1'));

    const tx = await factory.createForwarder(parent.address, feeAddr.address, salt, true, true);
    const receipt = await tx.wait();

    const event = receipt?.logs.find(
      (log) => factory.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === 'ForwarderCreated',
    );
    const parsedEvent = factory.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    const forwarderAddress = parsedEvent!.args.newForwarderAddress;

    const forwarder = ForwarderImpl.attach(forwarderAddress);
    expect(await forwarder.parentAddress()).to.equal(parent.address);
    expect(await forwarder.feeAddress()).to.equal(feeAddr.address);
  });

  it('should compute deterministic forwarder address correctly', async () => {
    const [, parent, feeAddr] = await ethers.getSigners();

    const ForwarderImpl = await ethers.getContractFactory('CvhForwarder');
    const impl = await ForwarderImpl.deploy();

    const Factory = await ethers.getContractFactory('CvhForwarderFactory');
    const factory = await Factory.deploy(await impl.getAddress());

    const salt = ethers.keccak256(ethers.toUtf8Bytes('deterministic-fwd'));

    const predicted = await factory.computeForwarderAddress(parent.address, feeAddr.address, salt);
    const tx = await factory.createForwarder(parent.address, feeAddr.address, salt, true, true);
    const receipt = await tx.wait();

    const event = receipt?.logs.find(
      (log) => factory.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === 'ForwarderCreated',
    );
    const parsedEvent = factory.interface.parseLog({ topics: [...event!.topics], data: event!.data });

    expect(parsedEvent!.args.newForwarderAddress).to.equal(predicted);
  });

  it('should auto-forward ETH from forwarder proxy to parent', async () => {
    const [, parent, feeAddr, depositor] = await ethers.getSigners();

    const ForwarderImpl = await ethers.getContractFactory('CvhForwarder');
    const impl = await ForwarderImpl.deploy();

    const Factory = await ethers.getContractFactory('CvhForwarderFactory');
    const factory = await Factory.deploy(await impl.getAddress());

    const salt = ethers.keccak256(ethers.toUtf8Bytes('eth-forward-test'));
    const tx = await factory.createForwarder(parent.address, feeAddr.address, salt, true, true);
    const receipt = await tx.wait();

    const event = receipt?.logs.find(
      (log) => factory.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === 'ForwarderCreated',
    );
    const parsedEvent = factory.interface.parseLog({ topics: [...event!.topics], data: event!.data });
    const forwarderAddress = parsedEvent!.args.newForwarderAddress;

    const parentBefore = await ethers.provider.getBalance(parent.address);
    const value = ethers.parseEther('1.0');

    await depositor.sendTransaction({ to: forwarderAddress, value });

    const parentAfter = await ethers.provider.getBalance(parent.address);
    expect(parentAfter - parentBefore).to.equal(value);
  });
});
```

- [ ] **Step 3: Run all tests**

```bash
cd contracts && npx hardhat test && cd ..
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/CvhWalletFactory.test.ts contracts/test/CvhForwarderFactory.test.ts
git commit -m "test: add factory tests for deterministic deployment and ETH forwarding"
```

---

## Task 16: Write Deployment Script

**Files:**
- Create: `contracts/scripts/deploy.ts`
- Create: `contracts/scripts/compute-address.ts`

- [ ] **Step 1: Create contracts/scripts/deploy.ts**

```typescript
import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // 1. Deploy implementation contracts
  console.log('\n--- Deploying Implementation Contracts ---');

  const CvhWalletSimple = await ethers.getContractFactory('CvhWalletSimple');
  const walletImpl = await CvhWalletSimple.deploy();
  await walletImpl.waitForDeployment();
  console.log('CvhWalletSimple implementation:', await walletImpl.getAddress());

  const CvhForwarder = await ethers.getContractFactory('CvhForwarder');
  const forwarderImpl = await CvhForwarder.deploy();
  await forwarderImpl.waitForDeployment();
  console.log('CvhForwarder implementation:', await forwarderImpl.getAddress());

  // 2. Deploy factory contracts
  console.log('\n--- Deploying Factory Contracts ---');

  const CvhWalletFactory = await ethers.getContractFactory('CvhWalletFactory');
  const walletFactory = await CvhWalletFactory.deploy(await walletImpl.getAddress());
  await walletFactory.waitForDeployment();
  console.log('CvhWalletFactory:', await walletFactory.getAddress());

  const CvhForwarderFactory = await ethers.getContractFactory('CvhForwarderFactory');
  const forwarderFactory = await CvhForwarderFactory.deploy(await forwarderImpl.getAddress());
  await forwarderFactory.waitForDeployment();
  console.log('CvhForwarderFactory:', await forwarderFactory.getAddress());

  // 3. Deploy batcher
  const CvhBatcher = await ethers.getContractFactory('CvhBatcher');
  const batcher = await CvhBatcher.deploy();
  await batcher.waitForDeployment();
  console.log('CvhBatcher:', await batcher.getAddress());

  console.log('\n--- Deployment Complete ---');
  console.log({
    walletImplementation: await walletImpl.getAddress(),
    forwarderImplementation: await forwarderImpl.getAddress(),
    walletFactory: await walletFactory.getAddress(),
    forwarderFactory: await forwarderFactory.getAddress(),
    batcher: await batcher.getAddress(),
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 2: Create contracts/scripts/compute-address.ts**

```typescript
import { ethers } from 'hardhat';

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS;
  const parentAddress = process.env.PARENT_ADDRESS;
  const feeAddress = process.env.FEE_ADDRESS;
  const userSalt = process.env.SALT || ethers.keccak256(ethers.toUtf8Bytes('default'));

  if (!factoryAddress || !parentAddress || !feeAddress) {
    console.error('Usage: FACTORY_ADDRESS=0x... PARENT_ADDRESS=0x... FEE_ADDRESS=0x... npx hardhat run scripts/compute-address.ts');
    process.exit(1);
  }

  const factory = await ethers.getContractAt('CvhForwarderFactory', factoryAddress);
  const predicted = await factory.computeForwarderAddress(parentAddress, feeAddress, userSalt);

  console.log('Predicted forwarder address:', predicted);
  console.log('Factory:', factoryAddress);
  console.log('Parent:', parentAddress);
  console.log('Fee Address:', feeAddress);
  console.log('Salt:', userSalt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 3: Test deployment on local network**

```bash
cd contracts && npx hardhat run scripts/deploy.ts --network hardhat && cd ..
```

Expected: All 5 contracts deployed successfully with addresses printed.

- [ ] **Step 4: Commit**

```bash
git add contracts/scripts/
git commit -m "feat: add deployment and address computation scripts"
```

---

## Task 17: Create Docker Infrastructure

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml`
- Create: `infra/docker/Dockerfile.nestjs`
- Create: `infra/docker/Dockerfile.nextjs`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: '3.9'

networks:
  public-net:
    driver: bridge
  internal-net:
    driver: bridge
    internal: true
  vault-net:
    driver: bridge
    internal: true
  monitoring-net:
    driver: bridge

services:
  # ── Infrastructure ──
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - internal-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # ── API Gateway ──
  api-gateway:
    image: kong:3.6
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /etc/kong/kong.yml
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
      KONG_ADMIN_ERROR_LOG: /dev/stderr
      KONG_ADMIN_LISTEN: "0.0.0.0:8001"
    volumes:
      - ./infra/kong/kong.yml:/etc/kong/kong.yml
    ports:
      - "8000:8000"
      - "8443:8443"
      - "8001:8001"
    networks:
      - public-net
      - internal-net
    healthcheck:
      test: ["CMD", "kong", "health"]
      interval: 10s
      timeout: 3s
      retries: 3

  # ── Observability ──
  prometheus:
    image: prom/prometheus:v2.50.0
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - monitoring-net
      - internal-net

  grafana:
    image: grafana/grafana:10.3.0
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    networks:
      - monitoring-net
      - public-net

  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    networks:
      - monitoring-net
      - internal-net

  jaeger:
    image: jaegertracing/all-in-one:1.54
    ports:
      - "16686:16686"
      - "4318:4318"
    networks:
      - monitoring-net
      - internal-net

volumes:
  redis-data:
  prometheus-data:
  grafana-data:
```

- [ ] **Step 2: Create infra/docker/Dockerfile.nestjs**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
ARG SERVICE_PATH
COPY ${SERVICE_PATH}/ ./${SERVICE_PATH}/
RUN npm ci --workspace=@cvh/types --workspace=@cvh/config --workspace=@cvh/utils
RUN npx turbo build --filter=${SERVICE_PATH}

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder --chown=nestjs:nodejs /app/ ./
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Create infra/docker/Dockerfile.nextjs**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
ARG APP_PATH
COPY ${APP_PATH}/ ./${APP_PATH}/
RUN npm ci
RUN npx turbo build --filter=${APP_PATH}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
ARG APP_PATH
COPY --from=builder --chown=nextjs:nodejs /app/${APP_PATH}/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/${APP_PATH}/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/${APP_PATH}/package.json ./
USER nextjs
EXPOSE 3000
CMD ["npx", "next", "start"]
```

- [ ] **Step 4: Create infra configs**

Create `infra/kong/kong.yml`:

```yaml
_format_version: "3.0"
_transform: true

services:
  - name: admin-api
    url: http://admin-api:3001
    routes:
      - name: admin-routes
        paths:
          - /admin
        strip_path: false
  - name: client-api
    url: http://client-api:3002
    routes:
      - name: client-routes
        paths:
          - /client
        strip_path: false
  - name: auth-service
    url: http://auth-service:3003
    routes:
      - name: auth-routes
        paths:
          - /auth
        strip_path: false
```

Create `infra/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'kong'
    static_configs:
      - targets: ['api-gateway:8001']
  - job_name: 'services'
    static_configs:
      - targets:
        - 'admin-api:3001'
        - 'client-api:3002'
        - 'core-wallet-service:3004'
        - 'chain-indexer-service:3006'
        - 'notification-service:3007'
```

- [ ] **Step 5: Commit**

```bash
mkdir -p infra/kong infra/prometheus infra/grafana/provisioning infra/docker
git add docker-compose.yml infra/
git commit -m "chore: add Docker infrastructure (docker-compose, Kong, Prometheus, Grafana, Loki, Jaeger)"
```

---

## Task 18: Create NestJS Service Scaffolds

**Files:**
- Create scaffold `package.json` + `tsconfig.json` for each of the 8 services

- [ ] **Step 1: Create service directories**

```bash
for svc in admin-api client-api auth-service core-wallet-service key-vault-service chain-indexer-service notification-service cron-worker-service; do
  mkdir -p services/$svc/src
done
```

- [ ] **Step 2: Create template package.json for each service**

For each service, create `services/<name>/package.json` with this template (adjusting name and port):

Example for `services/core-wallet-service/package.json`:

```json
{
  "name": "@cvh/core-wallet-service",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main",
    "test": "jest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@cvh/types": "*",
    "@cvh/config": "*",
    "@cvh/utils": "*",
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/bullmq": "^10.1.0",
    "@prisma/client": "^5.10.0",
    "bullmq": "^5.1.0",
    "ioredis": "^5.3.0",
    "ethers": "^6.11.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.4.0",
    "prisma": "^5.10.0"
  }
}
```

Repeat for all 8 services with appropriate names:
- `@cvh/admin-api` (port 3001)
- `@cvh/client-api` (port 3002)
- `@cvh/auth-service` (port 3003)
- `@cvh/core-wallet-service` (port 3004)
- `@cvh/key-vault-service` (port 3005)
- `@cvh/chain-indexer-service` (port 3006)
- `@cvh/notification-service` (port 3007)
- `@cvh/cron-worker-service` (port 3008)

- [ ] **Step 3: Create placeholder main.ts for each**

For each service, create `services/<name>/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3004; // adjust per service
  await app.listen(port);
  console.log(`Service running on port ${port}`);
}
bootstrap();
```

And `services/<name>/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 4: Create tsconfig.json for each service**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "commonjs",
    "declaration": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Commit**

```bash
git add services/
git commit -m "chore: scaffold all 8 NestJS service directories with package.json and entry points"
```

---

## Task 19: Create Next.js App Scaffolds

**Files:**
- Create scaffold for 3 Next.js apps

- [ ] **Step 1: Create app directories**

```bash
for app in admin client bi-dashboard; do
  mkdir -p apps/$app
done
```

- [ ] **Step 2: Create package.json for each app**

Example for `apps/admin/package.json`:

```json
{
  "name": "@cvh/admin-web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3010",
    "build": "next build",
    "start": "next start --port 3010",
    "lint": "next lint"
  },
  "dependencies": {
    "@cvh/types": "*",
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "@tanstack/react-query": "^5.20.0",
    "recharts": "^2.12.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

Repeat for `@cvh/client-web` (port 3011) and `@cvh/bi-dashboard` (port 3012).

- [ ] **Step 3: Commit**

```bash
git add apps/
git commit -m "chore: scaffold Next.js frontend app directories"
```

---

## Task 20: Install All Dependencies and Verify Build

- [ ] **Step 1: Install all workspace dependencies**

```bash
npm install
```

- [ ] **Step 2: Build shared packages**

```bash
npx turbo build --filter=@cvh/types --filter=@cvh/config --filter=@cvh/utils
```

Expected: All 3 packages build successfully.

- [ ] **Step 3: Run smart contract tests**

```bash
cd contracts && npx hardhat test && cd ..
```

Expected: All contract tests pass.

- [ ] **Step 4: Commit lockfile**

```bash
git add package-lock.json
git commit -m "chore: install all dependencies and verify builds"
```

---

## Task 21: Run Full Verification

- [ ] **Step 1: Verify Docker infrastructure starts**

```bash
docker compose up -d redis api-gateway prometheus grafana loki jaeger
docker compose ps
```

Expected: All infrastructure services running and healthy.

- [ ] **Step 2: Verify Redis connectivity**

```bash
docker compose exec redis redis-cli ping
```

Expected: `PONG`

- [ ] **Step 3: Verify Kong is running**

```bash
curl -s http://localhost:8001/status | head -5
```

Expected: JSON response with Kong status.

- [ ] **Step 4: Shut down and commit**

```bash
docker compose down
git add docker-compose.yml
git commit -m "chore: verify Docker infrastructure starts correctly"
```

---

## Phase 1 Complete

At this point you have:
- Turborepo monorepo with shared packages (`@cvh/types`, `@cvh/config`, `@cvh/utils`)
- 5 Solidity contracts compiled, tested, and ready for deployment
- Docker infrastructure (Redis, Kong, Prometheus, Grafana, Loki, Jaeger)
- 8 NestJS service scaffolds
- 3 Next.js app scaffolds
- Deployment scripts for smart contracts

**Next:** Proceed to Phase 2 (`phase-02-keyvault-auth.md`) for Key Vault Service and Auth Service implementation.
