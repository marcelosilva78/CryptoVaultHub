import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

interface DetectedDeposit {
  chainId: number;
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  contractAddress: string | null; // null = native ETH
  amount: string;
  clientId: string;
  walletId: string;
}

/**
 * Subscribes to blockchain new blocks via WebSocket.
 * On each new block, scans for ERC20 Transfer events and native ETH
 * transfers to monitored deposit addresses.
 */
@Injectable()
export class RealtimeDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeDetectorService.name);
  private readonly subscriptions = new Map<number, ethers.WebSocketProvider>();
  private monitoredAddresses = new Map<string, { clientId: bigint; walletId: bigint }>();
  private activeChainIds: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  async onModuleInit() {
    await this.loadMonitoredAddresses();
    await this.startSubscriptions();
  }

  async onModuleDestroy() {
    for (const [chainId, wsProvider] of this.subscriptions) {
      wsProvider.removeAllListeners();
      wsProvider.destroy();
      this.logger.log(`WS subscription stopped for chain ${chainId}`);
    }
    this.subscriptions.clear();
  }

  /**
   * Load all active monitored addresses into memory for fast lookup.
   */
  async loadMonitoredAddresses(): Promise<void> {
    const addresses = await this.prisma.monitoredAddress.findMany({
      where: { isActive: true },
    });

    this.monitoredAddresses.clear();
    for (const addr of addresses) {
      const key = `${addr.chainId}:${addr.address.toLowerCase()}`;
      this.monitoredAddresses.set(key, {
        clientId: addr.clientId,
        walletId: addr.walletId,
      });
    }

    // Collect unique chain IDs
    this.activeChainIds = [...new Set(addresses.map((a) => a.chainId))];
    this.logger.log(
      `Loaded ${addresses.length} monitored addresses across ${this.activeChainIds.length} chains`,
    );
  }

  /**
   * Refresh monitored addresses (called externally when new addresses are added).
   */
  async refreshMonitoredAddresses(): Promise<void> {
    await this.loadMonitoredAddresses();
  }

  /**
   * Start WebSocket block subscriptions for all active chains.
   */
  private async startSubscriptions(): Promise<void> {
    for (const chainId of this.activeChainIds) {
      try {
        const wsProvider = await this.evmProvider.getWsProvider(chainId);
        this.subscriptions.set(chainId, wsProvider);

        wsProvider.on('block', async (blockNumber: number) => {
          try {
            await this.processBlock(chainId, blockNumber);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Error processing block ${blockNumber} on chain ${chainId}: ${msg}`,
            );
            this.evmProvider.reportFailure(chainId);
          }
        });

        this.logger.log(`WS subscription started for chain ${chainId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to start WS for chain ${chainId}, will rely on polling: ${msg}`,
        );
      }
    }
  }

  /**
   * Process a new block: scan for ERC20 Transfer events and native ETH deposits.
   */
  async processBlock(chainId: number, blockNumber: number): Promise<DetectedDeposit[]> {
    const provider = await this.evmProvider.getProvider(chainId);
    const deposits: DetectedDeposit[] = [];

    // 1. Get ERC20 Transfer logs for this block
    const erc20Deposits = await this.scanERC20Transfers(
      provider,
      chainId,
      blockNumber,
    );
    deposits.push(...erc20Deposits);

    // 2. Scan block transactions for native ETH transfers
    const nativeDeposits = await this.scanNativeTransfers(
      provider,
      chainId,
      blockNumber,
    );
    deposits.push(...nativeDeposits);

    // 3. Publish detected deposits to Redis Stream (batch)
    if (deposits.length > 0) {
      await Promise.all(
        deposits.map((deposit) => this.publishDepositDetected(deposit)),
      );
    }

    // 4. Update sync cursor
    await this.updateSyncCursor(chainId, blockNumber);

    if (deposits.length > 0) {
      this.logger.log(
        `Block ${blockNumber} on chain ${chainId}: ${deposits.length} deposits detected`,
      );
    }

    this.evmProvider.reportSuccess(chainId);
    return deposits;
  }

  /**
   * Scan ERC20 Transfer events where `to` is a monitored address.
   */
  private async scanERC20Transfers(
    provider: ethers.JsonRpcProvider,
    chainId: number,
    blockNumber: number,
  ): Promise<DetectedDeposit[]> {
    const deposits: DetectedDeposit[] = [];

    const logs = await provider.getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
      topics: [TRANSFER_TOPIC],
    });

    for (const log of logs) {
      if (log.topics.length < 3) continue;

      // topics[2] is the `to` address (padded to 32 bytes)
      const toAddress = ethers.getAddress(
        '0x' + log.topics[2].slice(26),
      );
      const key = `${chainId}:${toAddress.toLowerCase()}`;
      const monitored = this.monitoredAddresses.get(key);

      if (monitored) {
        const fromAddress = ethers.getAddress(
          '0x' + log.topics[1].slice(26),
        );
        const amount = log.data && log.data !== '0x' ? BigInt(log.data).toString() : '0';

        deposits.push({
          chainId,
          txHash: log.transactionHash,
          blockNumber,
          fromAddress,
          toAddress,
          contractAddress: log.address,
          amount,
          clientId: monitored.clientId.toString(),
          walletId: monitored.walletId.toString(),
        });
      }
    }

    return deposits;
  }

  /**
   * Scan block transactions for native ETH transfers to monitored addresses.
   */
  private async scanNativeTransfers(
    provider: ethers.JsonRpcProvider,
    chainId: number,
    blockNumber: number,
  ): Promise<DetectedDeposit[]> {
    const deposits: DetectedDeposit[] = [];

    const block = await provider.getBlock(blockNumber, true);
    if (!block || !block.prefetchedTransactions) return deposits;

    for (const tx of block.prefetchedTransactions) {
      if (!tx.to || tx.value === 0n) continue;

      const key = `${chainId}:${tx.to.toLowerCase()}`;
      const monitored = this.monitoredAddresses.get(key);

      if (monitored) {
        deposits.push({
          chainId,
          txHash: tx.hash,
          blockNumber,
          fromAddress: tx.from,
          toAddress: tx.to,
          contractAddress: null, // native
          amount: tx.value.toString(),
          clientId: monitored.clientId.toString(),
          walletId: monitored.walletId.toString(),
        });
      }
    }

    return deposits;
  }

  /**
   * Publish a deposit detection event to Redis Stream.
   */
  private async publishDepositDetected(deposit: DetectedDeposit): Promise<void> {
    await this.redis.publishToStream('deposits:detected', {
      chainId: deposit.chainId.toString(),
      txHash: deposit.txHash,
      blockNumber: deposit.blockNumber.toString(),
      fromAddress: deposit.fromAddress,
      toAddress: deposit.toAddress,
      contractAddress: deposit.contractAddress ?? 'native',
      amount: deposit.amount,
      clientId: deposit.clientId,
      walletId: deposit.walletId,
      detectedAt: new Date().toISOString(),
    });
  }

  /**
   * Update the sync cursor for a chain to the latest processed block.
   */
  private async updateSyncCursor(
    chainId: number,
    blockNumber: number,
  ): Promise<void> {
    await this.prisma.syncCursor.upsert({
      where: { chainId },
      update: { lastBlock: BigInt(blockNumber) },
      create: { chainId, lastBlock: BigInt(blockNumber) },
    });
  }
}
