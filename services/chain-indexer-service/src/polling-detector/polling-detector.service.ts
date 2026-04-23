import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[])',
  'function getEthBalance(address addr) external view returns (uint256 balance)',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

interface PollingJobData {
  chainId: number;
}

/**
 * Cron-based balance checking via Multicall3.
 * Compares current balances with cached previous balances to detect deposits.
 */
@Processor('polling-detector', { concurrency: 5 })
@Injectable()
export class PollingDetectorService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PollingDetectorService.name);

  constructor(
    @InjectQueue('polling-detector') private readonly pollingQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.initPollingJobs();
  }

  /**
   * Initialize repeatable polling jobs for each active chain that has at least
   * one active monitored address.
   */
  private async initPollingJobs(intervalMs: number = 15_000): Promise<void> {
    const chainsWithAddresses = await this.prisma.$queryRaw<Array<{ chain_id: number; name: string }>>`
      SELECT DISTINCT c.chain_id, c.name
      FROM chains c
      INNER JOIN monitored_addresses ma ON ma.chain_id = c.chain_id AND ma.is_active = 1
      WHERE c.is_active = 1
    `;

    if (chainsWithAddresses.length === 0) {
      this.logger.log('No chains with monitored addresses — skipping polling job creation');
      return;
    }

    for (const chain of chainsWithAddresses) {
      await this.pollingQueue.add(
        'poll-chain',
        { chainId: chain.chain_id },
        {
          repeat: { every: intervalMs },
          jobId: `poll-chain-${chain.chain_id}`,
        },
      );
      this.logger.log(
        `Polling job created for chain ${chain.chain_id} (${chain.name}) every ${intervalMs}ms`,
      );
    }
  }

  /**
   * Remove all existing repeatable polling jobs and re-initialise them based
   * on the current set of chains that have monitored addresses.  Call this
   * whenever a monitored address is added or removed so the polling schedule
   * stays in sync.
   */
  async refreshPollingJobs(): Promise<void> {
    const repeatableJobs = await this.pollingQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.pollingQueue.removeRepeatableByKey(job.key);
    }
    await this.initPollingJobs();
  }

  /**
   * BullMQ worker: process a polling job for a single chain.
   */
  async process(job: Job<PollingJobData>): Promise<void> {
    const { chainId } = job.data;

    try {
      await this.pollChain(chainId);
      this.evmProvider.reportSuccess(chainId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Polling failed for chain ${chainId}: ${msg}`,
      );
      this.evmProvider.reportFailure(chainId);
      throw error;
    }
  }

  /**
   * Poll all monitored addresses on a chain via Multicall3 batch balance queries.
   * Respects per-client monitoring mode: excludes addresses whose
   * client_chain_config.monitoring_mode is set to 'realtime' (polling not wanted).
   */
  async pollChain(chainId: number): Promise<void> {
    const allAddresses = await this.prisma.monitoredAddress.findMany({
      where: { chainId, isActive: true },
    });

    if (allAddresses.length === 0) return;

    // Load client chain configs for this chain to check monitoring mode
    const clientChainConfigs = await this.prisma.$queryRaw<any[]>`
      SELECT client_id AS clientId, chain_id AS chainId, monitoring_mode AS monitoringMode
      FROM cvh_admin.client_chain_config
      WHERE chain_id = ${chainId} AND is_active = 1
    `;
    const configMap = new Map<string, string>();
    for (const cfg of clientChainConfigs) {
      configMap.set(cfg.clientId.toString(), cfg.monitoringMode);
    }

    // Filter out addresses where the client explicitly wants realtime-only
    const addresses = allAddresses.filter((addr) => {
      const mode = configMap.get(addr.clientId.toString()) ?? 'hybrid';
      return mode !== 'realtime';
    });

    if (addresses.length === 0) return;

    const tokens = await this.prisma.token.findMany({
      where: { chainId, isActive: true },
    });

    const provider = await this.evmProvider.getProvider(chainId);
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain) return;

    const multicall3 = new ethers.Contract(
      chain.multicall3Address,
      MULTICALL3_ABI,
      provider,
    );
    const erc20Iface = new ethers.Interface(ERC20_ABI);
    const multicall3Iface = new ethers.Interface(MULTICALL3_ABI);

    // Build batch calls for all addresses x tokens
    const calls: Array<{
      target: string;
      allowFailure: boolean;
      callData: string;
    }> = [];
    const callMeta: Array<{
      address: string;
      tokenAddress: string | null;
      isNative: boolean;
      clientId: bigint;
      walletId: bigint;
    }> = [];

    for (const addr of addresses) {
      // Native balance via Multicall3.getEthBalance
      calls.push({
        target: chain.multicall3Address,
        allowFailure: true,
        callData: multicall3Iface.encodeFunctionData('getEthBalance', [
          addr.address,
        ]),
      });
      callMeta.push({
        address: addr.address,
        tokenAddress: null,
        isNative: true,
        clientId: addr.clientId,
        walletId: addr.walletId,
      });

      // ERC20 balances
      for (const token of tokens) {
        if (token.isNative) continue;
        calls.push({
          target: token.contractAddress,
          allowFailure: true,
          callData: erc20Iface.encodeFunctionData('balanceOf', [
            addr.address,
          ]),
        });
        callMeta.push({
          address: addr.address,
          tokenAddress: token.contractAddress,
          isNative: false,
          clientId: addr.clientId,
          walletId: addr.walletId,
        });
      }
    }

    if (calls.length === 0) return;

    // Execute Multicall3 batch
    const results: Array<{ success: boolean; returnData: string }> =
      await multicall3.aggregate3.staticCall(calls);

    // Compare with cached balances
    const currentBlock = await provider.getBlockNumber();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const meta = callMeta[i];

      if (!result.success || result.returnData === '0x') continue;

      let balance: bigint;
      if (meta.isNative) {
        const [val] = multicall3Iface.decodeFunctionResult(
          'getEthBalance',
          result.returnData,
        );
        balance = val as bigint;
      } else {
        const [val] = erc20Iface.decodeFunctionResult(
          'balanceOf',
          result.returnData,
        );
        balance = val as bigint;
      }

      // Cache key for previous balance
      const cacheKey = `balance:${chainId}:${meta.address}:${meta.tokenAddress ?? 'native'}`;
      const prevBalanceStr = await this.redis.getCache(cacheKey);
      const prevBalance = prevBalanceStr ? BigInt(prevBalanceStr) : 0n;

      // Store current balance
      await this.redis.setCache(cacheKey, balance.toString(), 3600);

      // Detect increase = potential deposit
      if (balance > prevBalance && prevBalanceStr !== null) {
        const increase = balance - prevBalance;
        await this.redis.publishToStream('deposits:detected', {
          chainId: chainId.toString(),
          txHash: `polling:${currentBlock}:${meta.address}:${meta.tokenAddress ?? 'native'}`,
          blockNumber: currentBlock.toString(),
          fromAddress: 'unknown',
          toAddress: meta.address,
          contractAddress: meta.tokenAddress ?? 'native',
          amount: increase.toString(),
          clientId: meta.clientId.toString(),
          walletId: meta.walletId.toString(),
          detectedAt: new Date().toISOString(),
          source: 'polling',
        });

        this.logger.log(
          `Polling detected deposit: ${meta.address} +${increase} ${meta.tokenAddress ?? 'native'} on chain ${chainId}`,
        );
      }
    }
  }
}
