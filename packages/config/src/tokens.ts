export interface DefaultToken {
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  coingeckoId: string | null;
}

export const DEFAULT_TOKENS: Record<number, DefaultToken[]> = {
  // Ethereum Mainnet
  1: [
    {
      symbol: 'USDT',
      name: 'Tether USD',
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      coingeckoId: 'tether',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
      coingeckoId: 'dai',
    },
    {
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      decimals: 8,
      coingeckoId: 'wrapped-bitcoin',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      coingeckoId: 'weth',
    },
    {
      symbol: 'LINK',
      name: 'ChainLink Token',
      contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      decimals: 18,
      coingeckoId: 'chainlink',
    },
  ],

  // BNB Smart Chain
  56: [
    {
      symbol: 'USDT',
      name: 'Tether USD',
      contractAddress: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
      coingeckoId: 'tether',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'BUSD',
      name: 'Binance USD',
      contractAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      decimals: 18,
      coingeckoId: 'binance-usd',
    },
    {
      symbol: 'BTCB',
      name: 'Bitcoin BEP2',
      contractAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      decimals: 18,
      coingeckoId: 'bitcoin-bep2',
    },
    {
      symbol: 'WBNB',
      name: 'Wrapped BNB',
      contractAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      decimals: 18,
      coingeckoId: 'wbnb',
    },
  ],

  // Polygon Mainnet
  137: [
    {
      symbol: 'USDT',
      name: 'Tether USD',
      contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
      coingeckoId: 'tether',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      contractAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
      coingeckoId: 'weth',
    },
    {
      symbol: 'WMATIC',
      name: 'Wrapped Matic',
      contractAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      decimals: 18,
      coingeckoId: 'wmatic',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      contractAddress: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      decimals: 18,
      coingeckoId: 'dai',
    },
  ],
};
