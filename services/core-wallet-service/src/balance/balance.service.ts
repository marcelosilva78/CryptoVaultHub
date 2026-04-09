import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ContractService } from '../blockchain/contract.service';

export interface TokenBalance {
  tokenId: number;
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  isNative: boolean;
  balanceRaw: string;
  balanceFormatted: string;
}

/**
 * Query on-chain balances via Multicall3, cache in Redis.
 */
@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  /** Cache TTL in seconds */
  private readonly CACHE_TTL = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly contractService: ContractService,
  ) {}

  /**
   * Get token balances for a wallet on a chain.
   * Uses Multicall3 for batching and Redis for caching.
   */
  async getWalletBalances(
    clientId: number,
    chainId: number,
  ): Promise<{
    walletAddress: string;
    balances: TokenBalance[];
  }> {
    // Get hot wallet
    const wallet = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType: 'hot',
        },
      },
    });
    if (!wallet) {
      throw new NotFoundException(
        `Hot wallet not found for client ${clientId} on chain ${chainId}`,
      );
    }

    // Check cache
    const cacheKey = `balance:${chainId}:${wallet.address}`;
    const cached = await this.redisService.getCache(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get default tokens for this chain
    const tokens = await this.prisma.token.findMany({
      where: {
        chainId,
        isActive: true,
        isDefault: true,
      },
    });

    const balances: TokenBalance[] = [];

    // Query native balance
    const nativeToken = tokens.find((t) => t.isNative);
    if (nativeToken) {
      const nativeBalance = await this.contractService.getNativeBalance(
        chainId,
        wallet.address,
      );
      balances.push({
        tokenId: Number(nativeToken.id),
        symbol: nativeToken.symbol,
        name: nativeToken.name,
        contractAddress: nativeToken.contractAddress,
        decimals: nativeToken.decimals,
        isNative: true,
        balanceRaw: nativeBalance.toString(),
        balanceFormatted: ethers.formatUnits(
          nativeBalance,
          nativeToken.decimals,
        ),
      });
    }

    // Query ERC20 balances via Multicall3
    const erc20Tokens = tokens.filter((t) => !t.isNative);
    if (erc20Tokens.length > 0) {
      const tokenAddresses = erc20Tokens.map((t) => t.contractAddress);
      const multicallResults =
        await this.contractService.getBalancesViaMulticall(
          chainId,
          wallet.address,
          tokenAddresses,
        );

      for (let i = 0; i < erc20Tokens.length; i++) {
        const token = erc20Tokens[i];
        const result = multicallResults[i];
        balances.push({
          tokenId: Number(token.id),
          symbol: token.symbol,
          name: token.name,
          contractAddress: token.contractAddress,
          decimals: token.decimals,
          isNative: false,
          balanceRaw: result.balance.toString(),
          balanceFormatted: ethers.formatUnits(
            result.balance,
            token.decimals,
          ),
        });
      }
    }

    const result = {
      walletAddress: wallet.address,
      balances,
    };

    // Cache the result
    await this.redisService.setCache(
      cacheKey,
      JSON.stringify(result),
      this.CACHE_TTL,
    );

    return result;
  }
}
