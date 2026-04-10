import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

interface ProcessedTransfer {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  contractAddress: string | null;
  amount: string;
  isNative: boolean;
}

/**
 * Processes individual blocks to extract transfer events.
 * Handles both ERC20 Transfer events and native ETH transfers.
 */
@Injectable()
export class BlockProcessorService {
  private readonly logger = new Logger(BlockProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Process a single block: extract all transfers (ERC20 + native).
   */
  async processBlock(
    chainId: number,
    blockNumber: number,
  ): Promise<ProcessedTransfer[]> {
    const provider = await this.evmProvider.getProvider(chainId);
    const transfers: ProcessedTransfer[] = [];

    // 1. Get ERC20 Transfer logs
    const logs = await provider.getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
      topics: [TRANSFER_TOPIC],
    });

    for (const log of logs) {
      if (log.topics.length < 3) continue;

      const fromAddress = ethers.getAddress('0x' + log.topics[1].slice(26));
      const toAddress = ethers.getAddress('0x' + log.topics[2].slice(26));
      const amount =
        log.data && log.data !== '0x' ? BigInt(log.data).toString() : '0';

      transfers.push({
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber,
        fromAddress,
        toAddress,
        contractAddress: log.address,
        amount,
        isNative: false,
      });
    }

    // 2. Scan native ETH transfers
    const block = await provider.getBlock(blockNumber, true);
    if (block && block.prefetchedTransactions) {
      for (const tx of block.prefetchedTransactions) {
        if (!tx.to || tx.value === 0n) continue;

        transfers.push({
          txHash: tx.hash,
          logIndex: -1, // Sentinel: native transfers have no real log index
          blockNumber,
          fromAddress: tx.from,
          toAddress: tx.to,
          contractAddress: null,
          amount: tx.value.toString(),
          isNative: true,
        });
      }
    }

    // 3. Mark block as indexed
    await this.prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO indexed_blocks (chain_id, block_number, indexed_at) VALUES (?, ?, NOW())`,
      chainId,
      blockNumber,
    );

    return transfers;
  }
}
