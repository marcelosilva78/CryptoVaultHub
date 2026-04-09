import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const APPROVAL_TOPIC = ethers.id('Approval(address,address,uint256)');

interface ProcessedBlockResult {
  blockNumber: number;
  blockHash: string;
  parentHash: string;
  transactionCount: number;
  eventsDetected: number;
}

/**
 * Processes a single block: fetches block data, matches tx from/to against
 * monitored_addresses, parses ERC-20 Transfer event logs, and stores
 * indexed_blocks + indexed_events records.
 */
@Injectable()
export class BlockProcessorService {
  private readonly logger = new Logger(BlockProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Process a single block for the given chain.
   * Returns the number of events detected.
   */
  async processBlock(
    chainId: number,
    blockNumber: number,
  ): Promise<ProcessedBlockResult> {
    const provider = await this.evmProvider.getProvider(chainId);

    // Fetch block with full transactions
    const block = await provider.getBlock(blockNumber, true);
    if (!block) {
      throw new Error(
        `Block ${blockNumber} not found on chain ${chainId}`,
      );
    }

    // Load monitored addresses for this chain
    const monitoredAddresses = await this.prisma.monitoredAddress.findMany({
      where: { chainId, isActive: true },
    });
    const monitoredMap = new Map<
      string,
      { clientId: bigint; walletId: bigint }
    >();
    for (const addr of monitoredAddresses) {
      monitoredMap.set(addr.address.toLowerCase(), {
        clientId: addr.clientId,
        walletId: addr.walletId,
      });
    }

    // Load tokens for matching
    const tokens = await this.prisma.token.findMany({
      where: { chainId, isActive: true },
    });
    const tokenByContract = new Map<string, bigint>();
    for (const t of tokens) {
      tokenByContract.set(t.contractAddress.toLowerCase(), t.id);
    }

    const events: Array<{
      chainId: number;
      blockNumber: bigint;
      txHash: string;
      logIndex: number;
      contractAddress: string;
      eventType: 'erc20_transfer' | 'native_transfer' | 'approval' | 'other';
      fromAddress: string | null;
      toAddress: string | null;
      tokenId: bigint | null;
      amount: bigint | null;
      clientId: bigint | null;
      projectId: bigint | null;
      walletId: bigint | null;
      isInbound: boolean | null;
      rawData: any;
    }> = [];

    // 1. Scan native transfers from block transactions
    if (block.prefetchedTransactions) {
      let logIdx = -1;
      for (const tx of block.prefetchedTransactions) {
        logIdx++;
        if (!tx.to || tx.value === 0n) continue;

        const toLower = tx.to.toLowerCase();
        const fromLower = tx.from.toLowerCase();

        const toMonitored = monitoredMap.get(toLower);
        const fromMonitored = monitoredMap.get(fromLower);

        if (toMonitored || fromMonitored) {
          const monitored = toMonitored || fromMonitored;
          events.push({
            chainId,
            blockNumber: BigInt(blockNumber),
            txHash: tx.hash,
            logIndex: logIdx,
            contractAddress: '0x0000000000000000000000000000000000000000',
            eventType: 'native_transfer',
            fromAddress: tx.from,
            toAddress: tx.to,
            tokenId: null,
            amount: tx.value,
            clientId: monitored!.clientId,
            projectId: null,
            walletId: monitored!.walletId,
            isInbound: !!toMonitored,
            rawData: {
              gasPrice: tx.gasPrice?.toString(),
              gasLimit: tx.gasLimit?.toString(),
              nonce: tx.nonce,
            },
          });
        }
      }
    }

    // 2. Scan ERC-20 Transfer and Approval logs
    const logs = await provider.getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
      topics: [[TRANSFER_TOPIC, APPROVAL_TOPIC]],
    });

    for (const log of logs) {
      if (log.topics.length < 3) continue;

      const isTransfer = log.topics[0] === TRANSFER_TOPIC;
      const fromAddress = ethers.getAddress(
        '0x' + log.topics[1].slice(26),
      );
      const toAddress = ethers.getAddress(
        '0x' + log.topics[2].slice(26),
      );
      const amount =
        log.data && log.data !== '0x' ? BigInt(log.data) : 0n;

      const toLower = toAddress.toLowerCase();
      const fromLower = fromAddress.toLowerCase();
      const contractLower = log.address.toLowerCase();

      const toMonitored = monitoredMap.get(toLower);
      const fromMonitored = monitoredMap.get(fromLower);

      if (toMonitored || fromMonitored) {
        const monitored = toMonitored || fromMonitored;
        const tokenId = tokenByContract.get(contractLower) ?? null;

        events.push({
          chainId,
          blockNumber: BigInt(blockNumber),
          txHash: log.transactionHash,
          logIndex: log.index,
          contractAddress: log.address,
          eventType: isTransfer ? 'erc20_transfer' : 'approval',
          fromAddress,
          toAddress,
          tokenId,
          amount,
          clientId: monitored!.clientId,
          projectId: null,
          walletId: monitored!.walletId,
          isInbound: !!toMonitored,
          rawData: {
            topics: log.topics,
            data: log.data,
          },
        });
      }
    }

    // 3. Persist indexed block and events in a transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.indexedBlock.upsert({
        where: {
          uq_chain_block: {
            chainId,
            blockNumber: BigInt(blockNumber),
          },
        },
        update: {
          blockHash: block.hash!,
          parentHash: block.parentHash,
          blockTimestamp: BigInt(block.timestamp),
          transactionCount: block.transactions.length,
          eventsDetected: events.length,
        },
        create: {
          chainId,
          blockNumber: BigInt(blockNumber),
          blockHash: block.hash!,
          parentHash: block.parentHash,
          blockTimestamp: BigInt(block.timestamp),
          transactionCount: block.transactions.length,
          eventsDetected: events.length,
        },
      });

      if (events.length > 0) {
        for (const event of events) {
          await tx.indexedEvent.upsert({
            where: {
              uq_chain_tx_log: {
                chainId: event.chainId,
                txHash: event.txHash,
                logIndex: event.logIndex,
              },
            },
            update: {
              fromAddress: event.fromAddress,
              toAddress: event.toAddress,
              tokenId: event.tokenId,
              amount: event.amount,
              clientId: event.clientId,
              projectId: event.projectId,
              walletId: event.walletId,
              isInbound: event.isInbound,
              rawData: event.rawData,
              processedAt: new Date(),
            },
            create: {
              chainId: event.chainId,
              blockNumber: event.blockNumber,
              txHash: event.txHash,
              logIndex: event.logIndex,
              contractAddress: event.contractAddress,
              eventType: event.eventType,
              fromAddress: event.fromAddress,
              toAddress: event.toAddress,
              tokenId: event.tokenId,
              amount: event.amount,
              clientId: event.clientId,
              projectId: event.projectId,
              walletId: event.walletId,
              isInbound: event.isInbound,
              rawData: event.rawData,
              processedAt: new Date(),
            },
          });
        }
      }
    });

    if (events.length > 0) {
      this.logger.log(
        `Block ${blockNumber} on chain ${chainId}: ${events.length} events indexed`,
      );
    }

    return {
      blockNumber,
      blockHash: block.hash!,
      parentHash: block.parentHash,
      transactionCount: block.transactions.length,
      eventsDetected: events.length,
    };
  }
}
