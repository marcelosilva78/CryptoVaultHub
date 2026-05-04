import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

export interface ChainDependencies {
  rpcNodes: { total: number; active: number };
  clients: { total: number };
  tokens: { total: number };
  wallets: { total: number };
  depositAddresses: { total: number; deployed: number };
  deposits: { total: number; pending: number };
  withdrawals: { total: number; pending: number };
  flushOperations: { total: number; pending: number };
  gasTanks: { total: number };
  monitoredAddresses: { total: number };
  indexedBlocks: { total: number };
  indexedEvents: { total: number };
  syncGaps: { total: number };
  projectChains: { total: number };
  hasPendingOperations: boolean;
  hasAnyDependency: boolean;
  canPhysicalDelete: boolean;
}

@Injectable()
export class ChainDependencyService {
  private readonly internalKey: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('CHAIN_INDEXER_URL') private readonly chainIndexerUrl: string,
    private readonly configService: ConfigService,
  ) {
    this.internalKey = this.configService.get<string>('INTERNAL_SERVICE_KEY', '');
  }

  async getDependencies(chainId: number): Promise<ChainDependencies> {
    const [rpcTotal, rpcActive, clientCount, indexerDeps] = await Promise.all([
      this.prisma.rpcNode.count({ where: { chainId } }),
      this.prisma.rpcNode.count({ where: { chainId, status: { in: ['active', 'standby'] } } }),
      this.prisma.clientChainConfig.count({ where: { chainId } }),
      this.fetchIndexerDependencies(chainId),
    ]);

    const hasPendingOperations =
      indexerDeps.deposits.pending > 0 ||
      indexerDeps.withdrawals.pending > 0 ||
      indexerDeps.flushOperations.pending > 0;

    const totalDeps =
      rpcTotal + clientCount + indexerDeps.tokens +
      indexerDeps.wallets + indexerDeps.depositAddresses.total +
      indexerDeps.deposits.total + indexerDeps.withdrawals.total +
      indexerDeps.flushOperations.total + indexerDeps.gasTanks +
      (indexerDeps.monitoredAddresses || 0) +
      (indexerDeps.indexedBlocks || 0) +
      (indexerDeps.indexedEvents || 0) +
      (indexerDeps.syncGaps || 0) +
      (indexerDeps.projectChains || 0);

    return {
      rpcNodes: { total: rpcTotal, active: rpcActive },
      clients: { total: clientCount },
      tokens: { total: indexerDeps.tokens },
      wallets: { total: indexerDeps.wallets },
      depositAddresses: indexerDeps.depositAddresses,
      deposits: indexerDeps.deposits,
      withdrawals: indexerDeps.withdrawals,
      flushOperations: indexerDeps.flushOperations,
      gasTanks: { total: indexerDeps.gasTanks },
      monitoredAddresses: { total: indexerDeps.monitoredAddresses || 0 },
      indexedBlocks: { total: indexerDeps.indexedBlocks || 0 },
      indexedEvents: { total: indexerDeps.indexedEvents || 0 },
      syncGaps: { total: indexerDeps.syncGaps || 0 },
      projectChains: { total: indexerDeps.projectChains || 0 },
      hasPendingOperations,
      hasAnyDependency: totalDeps > 0,
      canPhysicalDelete: totalDeps === 0,
    };
  }

  async getRpcNodeCounts(): Promise<Map<number, { total: number; active: number }>> {
    const nodes = await this.prisma.rpcNode.findMany({
      select: { chainId: true, status: true },
    });
    const map = new Map<number, { total: number; active: number }>();
    for (const node of nodes) {
      const entry = map.get(node.chainId) || { total: 0, active: 0 };
      entry.total++;
      if (node.status === 'active' || node.status === 'standby') entry.active++;
      map.set(node.chainId, entry);
    }
    return map;
  }

  private async fetchIndexerDependencies(chainId: number) {
    try {
      const { data } = await axios.get(`${this.chainIndexerUrl}/chains/${chainId}/dependencies`, { headers: { 'X-Internal-Service-Key': this.internalKey } });
      return data;
    } catch {
      return {
        tokens: 1, wallets: 1,
        depositAddresses: { total: 1, deployed: 0 },
        deposits: { total: 1, pending: 1 },
        withdrawals: { total: 1, pending: 1 },
        flushOperations: { total: 1, pending: 1 },
        gasTanks: 1,
        monitoredAddresses: 1,
        indexedBlocks: 1,
        indexedEvents: 1,
        syncGaps: 1,
        projectChains: 1,
      };
    }
  }
}
