import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0x' + '0'.repeat(64);

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.27',
    settings: {
      optimizer: { enabled: true, runs: 1000 },
      evmVersion: 'cancun',
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    // Testnets
    bscTestnet: {
      url: process.env.RPC_BSC_TESTNET_HTTP || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
      chainId: 97,
      accounts: [DEPLOYER_KEY],
    },
    sepolia: {
      url: process.env.RPC_SEPOLIA_HTTP || '',
      chainId: 11155111,
      accounts: [DEPLOYER_KEY],
    },
    amoy: {
      url: process.env.RPC_AMOY_HTTP || '',
      chainId: 80002,
      accounts: [DEPLOYER_KEY],
    },
    // Mainnets
    ethereum: {
      url: process.env.RPC_ETH_HTTP || '',
      chainId: 1,
      accounts: [DEPLOYER_KEY],
    },
    bsc: {
      url: process.env.RPC_BSC_HTTP || '',
      chainId: 56,
      accounts: [DEPLOYER_KEY],
    },
    polygon: {
      url: process.env.RPC_POLYGON_HTTP || '',
      chainId: 137,
      accounts: [DEPLOYER_KEY],
    },
    arbitrum: {
      url: process.env.RPC_ARBITRUM_HTTP || '',
      chainId: 42161,
      accounts: [DEPLOYER_KEY],
    },
    optimism: {
      url: process.env.RPC_OPTIMISM_HTTP || '',
      chainId: 10,
      accounts: [DEPLOYER_KEY],
    },
    avalanche: {
      url: process.env.RPC_AVAX_HTTP || '',
      chainId: 43114,
      accounts: [DEPLOYER_KEY],
    },
    base: {
      url: process.env.RPC_BASE_HTTP || '',
      chainId: 8453,
      accounts: [DEPLOYER_KEY],
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
