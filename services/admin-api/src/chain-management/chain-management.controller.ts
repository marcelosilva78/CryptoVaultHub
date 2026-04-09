import {
  Controller,
  Get,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { ChainManagementService } from './chain-management.service';
import { AddChainDto, AddTokenDto } from '../common/dto/chain.dto';

@ApiBearerAuth('JWT')
@Controller('admin')
export class ChainManagementController {
  constructor(private readonly chainService: ChainManagementService) {}

  @Post('chains')
  @AdminAuth('super_admin', 'admin')
  @ApiTags('Chains')
  @ApiOperation({
    summary: 'Add a new blockchain network',
    description: `Registers a new EVM-compatible blockchain network in the platform.

**After adding a chain:**
1. The chain indexer service will begin syncing blocks from the RPC endpoint
2. The gas tank monitoring will start tracking the chain's gas wallet balance
3. Existing clients will NOT automatically have access -- use tier configuration to enable chains per client

**Supported networks:** Any EVM-compatible chain (Ethereum, Polygon, BSC, Arbitrum, Optimism, Avalanche, etc.)

**RPC requirements:** The RPC endpoint should support the \`eth_*\` JSON-RPC namespace and ideally be an archive node for reliable historical queries.`,
  })
  @ApiBody({
    type: AddChainDto,
    examples: {
      ethereum: {
        summary: 'Ethereum Mainnet',
        value: {
          name: 'Ethereum Mainnet',
          symbol: 'ETH',
          chainId: 1,
          rpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
          explorerUrl: 'https://etherscan.io',
          confirmationsRequired: 12,
          isActive: true,
        },
      },
      polygon: {
        summary: 'Polygon PoS',
        value: {
          name: 'Polygon',
          symbol: 'MATIC',
          chainId: 137,
          rpcUrl: 'https://polygon-rpc.com',
          explorerUrl: 'https://polygonscan.com',
          confirmationsRequired: 128,
          isActive: true,
        },
      },
      arbitrum: {
        summary: 'Arbitrum One',
        value: {
          name: 'Arbitrum One',
          symbol: 'ETH',
          chainId: 42161,
          rpcUrl: 'https://arb1.arbitrum.io/rpc',
          explorerUrl: 'https://arbiscan.io',
          confirmationsRequired: 1,
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Chain added successfully',
    schema: {
      example: {
        success: true,
        chain: {
          id: 1,
          name: 'Ethereum Mainnet',
          symbol: 'ETH',
          chainId: 1,
          rpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
          explorerUrl: 'https://etherscan.io',
          confirmationsRequired: 12,
          isActive: true,
          createdAt: '2026-04-09T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid chain configuration' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 409, description: 'Conflict -- chain with this chainId already exists' })
  async addChain(@Body() dto: AddChainDto, @Req() req: Request) {
    const user = (req as any).user;
    const chain = await this.chainService.addChain(dto, user.userId, req.ip);
    return { success: true, chain };
  }

  @Get('chains')
  @AdminAuth()
  @ApiTags('Chains')
  @ApiOperation({
    summary: 'List all configured blockchain networks',
    description: `Returns all blockchain networks registered in the platform, including both active and inactive chains.

Each chain entry includes its RPC endpoint, explorer URL, confirmation requirements, and active status. Use this endpoint to verify chain configuration before adding tokens or deploying forwarder contracts.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'List of all configured chains',
    schema: {
      example: {
        success: true,
        chains: [
          {
            id: 1,
            name: 'Ethereum Mainnet',
            symbol: 'ETH',
            chainId: 1,
            rpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
            explorerUrl: 'https://etherscan.io',
            confirmationsRequired: 12,
            isActive: true,
            createdAt: '2026-04-09T10:30:00Z',
          },
          {
            id: 2,
            name: 'Polygon',
            symbol: 'MATIC',
            chainId: 137,
            rpcUrl: 'https://polygon-rpc.com',
            explorerUrl: 'https://polygonscan.com',
            confirmationsRequired: 128,
            isActive: true,
            createdAt: '2026-04-09T10:35:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async listChains() {
    const chains = await this.chainService.listChains();
    return { success: true, chains };
  }

  @Post('tokens')
  @AdminAuth('super_admin', 'admin')
  @ApiTags('Tokens')
  @ApiOperation({
    summary: 'Add an ERC-20 token to the registry',
    description: `Registers a new ERC-20 token for a specific blockchain network.

**Before adding a token:**
- The chain (identified by chainId) must already be registered via POST /admin/chains
- Verify the contract address is correct for the target chain -- an incorrect address will cause deposit detection failures

**After adding a token:**
- The chain indexer will begin monitoring Transfer events for the token contract
- Existing forwarder contracts will automatically start forwarding deposits of this token
- Clients on tiers with access to the chain will see this token in their supported assets

**Common tokens:**
- USDC: 6 decimals, widely deployed across EVM chains
- USDT: 6 decimals on Ethereum, varies on other chains
- DAI: 18 decimals on all chains`,
  })
  @ApiBody({
    type: AddTokenDto,
    examples: {
      usdc_ethereum: {
        summary: 'USDC on Ethereum',
        value: {
          name: 'USD Coin',
          symbol: 'USDC',
          chainId: 1,
          contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6,
          isActive: true,
        },
      },
      usdt_ethereum: {
        summary: 'USDT on Ethereum',
        value: {
          name: 'Tether USD',
          symbol: 'USDT',
          chainId: 1,
          contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          decimals: 6,
          isActive: true,
        },
      },
      dai_polygon: {
        summary: 'DAI on Polygon',
        value: {
          name: 'Dai Stablecoin',
          symbol: 'DAI',
          chainId: 137,
          contractAddress: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
          decimals: 18,
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Token added successfully',
    schema: {
      example: {
        success: true,
        token: {
          id: 1,
          name: 'USD Coin',
          symbol: 'USDC',
          chainId: 1,
          contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6,
          isActive: true,
          createdAt: '2026-04-09T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid token configuration or non-existent chainId' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 409, description: 'Conflict -- token with this contract address already exists on this chain' })
  async addToken(@Body() dto: AddTokenDto, @Req() req: Request) {
    const user = (req as any).user;
    const token = await this.chainService.addToken(dto, user.userId, req.ip);
    return { success: true, token };
  }

  @Get('tokens')
  @AdminAuth()
  @ApiTags('Tokens')
  @ApiOperation({
    summary: 'List all registered ERC-20 tokens',
    description: `Returns all ERC-20 tokens registered across all chains, including both active and inactive tokens.

Each token entry includes its contract address, decimal configuration, and the chain it belongs to. Use this endpoint to audit the token registry or verify token configuration.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'List of all registered tokens',
    schema: {
      example: {
        success: true,
        tokens: [
          {
            id: 1,
            name: 'USD Coin',
            symbol: 'USDC',
            chainId: 1,
            contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            decimals: 6,
            isActive: true,
            createdAt: '2026-04-09T10:30:00Z',
          },
          {
            id: 2,
            name: 'Tether USD',
            symbol: 'USDT',
            chainId: 1,
            contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            decimals: 6,
            isActive: true,
            createdAt: '2026-04-09T10:35:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async listTokens() {
    const tokens = await this.chainService.listTokens();
    return { success: true, tokens };
  }
}
