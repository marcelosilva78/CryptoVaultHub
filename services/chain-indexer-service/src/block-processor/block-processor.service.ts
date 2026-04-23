import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface MonitoredAddr {
  clientId: bigint;
  projectId: bigint;
  walletId: bigint;
}

@Injectable()
export class BlockProcessorService {
  private readonly logger = new Logger(BlockProcessorService.name);
  private addrCache = new Map<number, { map: Map<string, MonitoredAddr>; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly redis: RedisService,
  ) {}

  private async getMonitoredAddresses(chainId: number): Promise<Map<string, MonitoredAddr>> {
    const cached = this.addrCache.get(chainId);
    if (cached && cached.expiresAt > Date.now()) return cached.map;

    const rows = await this.prisma.monitoredAddress.findMany({
      where: { chainId, isActive: true },
      select: { address: true, clientId: true, projectId: true, walletId: true },
    });

    const map = new Map<string, MonitoredAddr>();
    for (const row of rows) {
      map.set(row.address.toLowerCase(), {
        clientId: row.clientId,
        projectId: row.projectId,
        walletId: row.walletId,
      });
    }

    this.addrCache.set(chainId, { map, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return map;
  }

  async processBlock(
    chainId: number,
    blockNumber: number,
  ): Promise<{ eventsFound: number; blockHash: string }> {
    const provider = await this.evmProvider.getProvider(chainId);
    const monitored = await this.getMonitoredAddresses(chainId);

    if (monitored.size === 0) {
      return { eventsFound: 0, blockHash: '' };
    }

    const block = await provider.getBlock(blockNumber, true);
    if (!block) {
      this.logger.warn(`Block ${blockNumber} not found on chain ${chainId}`);
      return { eventsFound: 0, blockHash: '' };
    }

    const relevantEvents: Array<{
      txHash: string;
      logIndex: number;
      contractAddress: string;
      eventType: 'native_transfer' | 'erc20_transfer';
      fromAddress: string;
      toAddress: string;
      amount: bigint;
      clientId: bigint;
      projectId: bigint;
      walletId: bigint;
      isInbound: boolean;
    }> = [];

    // 1. Scan native transfers
    if (block.prefetchedTransactions) {
      for (const tx of block.prefetchedTransactions) {
        if (!tx.value || tx.value === 0n) continue;
        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();

        const fromMonitored = from ? monitored.get(from) : undefined;
        const toMonitored = to ? monitored.get(to) : undefined;

        if (toMonitored) {
          relevantEvents.push({
            txHash: tx.hash,
            logIndex: 0,
            contractAddress: ZERO_ADDRESS,
            eventType: 'native_transfer',
            fromAddress: tx.from,
            toAddress: tx.to!,
            amount: tx.value,
            clientId: toMonitored.clientId,
            projectId: toMonitored.projectId,
            walletId: toMonitored.walletId,
            isInbound: true,
          });
        }
        if (fromMonitored && !toMonitored) {
          relevantEvents.push({
            txHash: tx.hash,
            logIndex: 0,
            contractAddress: ZERO_ADDRESS,
            eventType: 'native_transfer',
            fromAddress: tx.from,
            toAddress: tx.to ?? ZERO_ADDRESS,
            amount: tx.value,
            clientId: fromMonitored.clientId,
            projectId: fromMonitored.projectId,
            walletId: fromMonitored.walletId,
            isInbound: false,
          });
        }
      }
    }

    // 2. Scan ERC20 Transfer events
    try {
      const logs = await provider.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        topics: [TRANSFER_TOPIC],
      });

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (log.topics.length < 3) continue;

        const from = ethers.getAddress('0x' + log.topics[1].slice(26)).toLowerCase();
        const to = ethers.getAddress('0x' + log.topics[2].slice(26)).toLowerCase();
        const amount = BigInt(log.data);

        const fromMonitored = monitored.get(from);
        const toMonitored = monitored.get(to);

        if (toMonitored) {
          relevantEvents.push({
            txHash: log.transactionHash,
            logIndex: log.index,
            contractAddress: log.address,
            eventType: 'erc20_transfer',
            fromAddress: ethers.getAddress('0x' + log.topics[1].slice(26)),
            toAddress: ethers.getAddress('0x' + log.topics[2].slice(26)),
            amount,
            clientId: toMonitored.clientId,
            projectId: toMonitored.projectId,
            walletId: toMonitored.walletId,
            isInbound: true,
          });
        }
        if (fromMonitored && !toMonitored) {
          relevantEvents.push({
            txHash: log.transactionHash,
            logIndex: log.index,
            contractAddress: log.address,
            eventType: 'erc20_transfer',
            fromAddress: ethers.getAddress('0x' + log.topics[1].slice(26)),
            toAddress: ethers.getAddress('0x' + log.topics[2].slice(26)),
            amount,
            clientId: fromMonitored.clientId,
            projectId: fromMonitored.projectId,
            walletId: fromMonitored.walletId,
            isInbound: false,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to get ERC20 logs for block ${blockNumber} on chain ${chainId}: ${err}`);
    }

    // 3. Write to DB only if relevant events found
    if (relevantEvents.length > 0) {
      for (const evt of relevantEvents) {
        await this.prisma.indexedEvent.upsert({
          where: {
            uq_chain_tx_log: {
              chainId,
              txHash: evt.txHash,
              logIndex: evt.logIndex,
            },
          },
          update: {},
          create: {
            chainId,
            blockNumber: BigInt(blockNumber),
            txHash: evt.txHash,
            logIndex: evt.logIndex,
            contractAddress: evt.contractAddress,
            eventType: evt.eventType,
            fromAddress: evt.fromAddress,
            toAddress: evt.toAddress,
            amount: evt.amount.toString(),
            clientId: evt.clientId,
            projectId: evt.projectId,
            walletId: evt.walletId,
            isInbound: evt.isInbound,
          },
        });
      }

      await this.prisma.indexedBlock.upsert({
        where: {
          uq_chain_block: { chainId, blockNumber: BigInt(blockNumber) },
        },
        update: { eventsDetected: relevantEvents.length },
        create: {
          chainId,
          blockNumber: BigInt(blockNumber),
          blockHash: block.hash!,
          parentHash: block.parentHash,
          blockTimestamp: BigInt(block.timestamp),
          transactionCount: block.transactions.length,
          eventsDetected: relevantEvents.length,
        },
      });

      this.logger.log(
        `Block ${blockNumber} on chain ${chainId}: ${relevantEvents.length} relevant events stored`,
      );
    }

    // 4. Cache block hash in Redis for reorg detection
    await this.redis.setCache(
      `block:${chainId}:${blockNumber}:hash`,
      block.hash!,
      86400,
    );

    return { eventsFound: relevantEvents.length, blockHash: block.hash! };
  }

  invalidateCache(chainId: number): void {
    this.addrCache.delete(chainId);
  }
}
