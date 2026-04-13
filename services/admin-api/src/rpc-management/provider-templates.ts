export interface ProviderTemplate {
  name: string;
  authMethod: string;
  authHeaderName?: string;
  urlPatterns: { http: string; ws: string | null };
  chainSlugs: Record<number, string>;
  defaultLimits: {
    maxRequestsPerSecond: number | null;
    maxRequestsPerMinute: number | null;
    maxRequestsPerDay: number | null;
    maxRequestsPerMonth: number | null;
  };
  supportedChainIds: number[];
  fields: string[];
  nodeTypes?: string[];
}

export const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  tatum: {
    name: 'Tatum',
    authMethod: 'header',
    authHeaderName: 'x-api-key',
    urlPatterns: {
      http: 'https://api.tatum.io/v3/blockchain/node/{chain-slug}',
      ws: null,
    },
    chainSlugs: {
      1: 'ethereum', 56: 'bsc', 137: 'polygon-matic',
      42161: 'arbitrum-one', 10: 'optimism', 43114: 'avax', 8453: 'base',
    },
    defaultLimits: {
      maxRequestsPerSecond: 5, maxRequestsPerMinute: 300,
      maxRequestsPerDay: null, maxRequestsPerMonth: 100000,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey'],
  },
  alchemy: {
    name: 'Alchemy',
    authMethod: 'url_path',
    urlPatterns: {
      http: 'https://{chain-slug}.g.alchemy.com/v2/{apiKey}',
      ws: 'wss://{chain-slug}.g.alchemy.com/v2/{apiKey}',
    },
    chainSlugs: {
      1: 'eth-mainnet', 56: 'bnb-mainnet', 137: 'polygon-mainnet',
      42161: 'arb-mainnet', 10: 'opt-mainnet', 43114: 'avax-mainnet', 8453: 'base-mainnet',
    },
    defaultLimits: {
      maxRequestsPerSecond: 25, maxRequestsPerMinute: null,
      maxRequestsPerDay: null, maxRequestsPerMonth: 300000000,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey'],
  },
  infura: {
    name: 'Infura',
    authMethod: 'url_path',
    urlPatterns: {
      http: 'https://{chain-slug}.infura.io/v3/{apiKey}',
      ws: 'wss://{chain-slug}.infura.io/ws/v3/{apiKey}',
    },
    chainSlugs: {
      1: 'mainnet', 56: 'bnbsmartchain-mainnet', 137: 'polygon-mainnet',
      42161: 'arbitrum-mainnet', 10: 'optimism-mainnet', 43114: 'avalanche-mainnet', 8453: 'base-mainnet',
    },
    defaultLimits: {
      maxRequestsPerSecond: 10, maxRequestsPerMinute: null,
      maxRequestsPerDay: 100000, maxRequestsPerMonth: null,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey'],
  },
  quicknode: {
    name: 'QuickNode',
    authMethod: 'url_path',
    urlPatterns: {
      http: 'https://{subdomain}.quiknode.pro/{apiKey}',
      ws: 'wss://{subdomain}.quiknode.pro/{apiKey}',
    },
    chainSlugs: {},
    defaultLimits: {
      maxRequestsPerSecond: 25, maxRequestsPerMinute: null,
      maxRequestsPerDay: null, maxRequestsPerMonth: null,
    },
    supportedChainIds: [1, 56, 137, 42161, 10, 43114, 8453],
    fields: ['apiKey', 'subdomain'],
  },
  custom: {
    name: 'Custom',
    authMethod: 'none',
    urlPatterns: { http: '', ws: '' },
    chainSlugs: {},
    defaultLimits: {
      maxRequestsPerSecond: null, maxRequestsPerMinute: null,
      maxRequestsPerDay: null, maxRequestsPerMonth: null,
    },
    supportedChainIds: [],
    fields: ['rpcHttpUrl', 'rpcWsUrl', 'nodeType', 'authMethod'],
    nodeTypes: ['geth', 'nethermind', 'erigon', 'besu', 'openethereum', 'reth'],
  },
};
