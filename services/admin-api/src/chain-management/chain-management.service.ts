import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuditLogService } from '../common/audit-log.service';
import { ChainDependencyService } from './chain-dependency.service';
import { ChainLifecycleService } from './chain-lifecycle.service';

@Injectable()
export class ChainManagementService {
  private readonly logger = new Logger(ChainManagementService.name);
  private readonly chainIndexerUrl: string;

  constructor(
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
    private readonly depService: ChainDependencyService,
    private readonly lifecycleService: ChainLifecycleService,
  ) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  async addChain(
    data: {
      name: string;
      symbol: string;
      chainId: number;
      rpcUrl: string;
      explorerUrl?: string;
      confirmationsRequired?: number;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    // RPC probe before creation
    let rpcProbeResult: any = null;
    try {
      const { JsonRpcProvider } = await import('ethers');
      const provider = new JsonRpcProvider(data.rpcUrl, undefined, {
        staticNetwork: true,
        batchMaxCount: 1,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RPC probe timeout')), 10000)
      );

      const [network, blockNumber] = await Promise.race([
        Promise.all([provider.getNetwork(), provider.getBlockNumber()]),
        timeoutPromise,
      ]) as [any, number];

      const actualChainId = Number(network.chainId);

      if (actualChainId !== data.chainId) {
        throw new BadRequestException(
          `RPC endpoint returns chainId ${actualChainId}, but expected ${data.chainId}`,
        );
      }
      rpcProbeResult = { reachable: true, chainIdMatch: true, latestBlock: blockNumber };
      provider.destroy();
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      rpcProbeResult = { reachable: false, error: err.message };
    }

    const chainData: any = {
      ...data,
      status: rpcProbeResult?.reachable ? 'active' : 'inactive',
      isActive: rpcProbeResult?.reachable ? (data.isActive ?? true) : false,
    };

    try {
      const { data: responseData } = await axios.post(
        `${this.chainIndexerUrl}/chains`,
        chainData,
        { timeout: 10000 },
      );

      await this.auditLog.log({
        adminUserId,
        action: 'chain.add',
        entityType: 'chain',
        entityId: data.chainId.toString(),
        details: { name: data.name, symbol: data.symbol, rpcProbeResult },
        ipAddress,
      });

      this.logger.log(`Chain added: ${data.name} (chainId: ${data.chainId})`);

      return {
        ...responseData,
        rpcProbe: rpcProbeResult,
        warnings: rpcProbeResult?.reachable
          ? []
          : ['RPC endpoint unreachable — chain created as inactive'],
      };
    } catch (err: any) {
      if (
        err.response?.status === 409 ||
        (err.response?.data?.message && err.response.data.message.includes('already exists'))
      ) {
        throw new ConflictException(`Chain with ID ${data.chainId} already exists`);
      }
      throw err;
    }
  }

  async listChains() {
    const response = await axios.get(
      `${this.chainIndexerUrl}/chains`,
      { timeout: 10000 },
    );
    // chain-indexer returns { chains: [...] } — extract the array so the
    // controller can wrap it cleanly as { success: true, chains: [...] }
    return response.data?.chains ?? response.data;
  }

  async addToken(
    data: {
      name: string;
      symbol: string;
      chainId: number;
      contractAddress: string;
      decimals: number;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const response = await axios.post(
      `${this.chainIndexerUrl}/tokens`,
      data,
      { timeout: 10000 },
    );

    await this.auditLog.log({
      adminUserId,
      action: 'token.add',
      entityType: 'token',
      entityId: data.contractAddress,
      details: { name: data.name, symbol: data.symbol, chainId: data.chainId },
      ipAddress,
    });

    this.logger.log(`Token added: ${data.symbol} on chain ${data.chainId}`);
    return response.data;
  }

  async listTokens() {
    const response = await axios.get(
      `${this.chainIndexerUrl}/tokens`,
      { timeout: 10000 },
    );
    // chain-indexer returns { tokens: [...] } — extract the array so the
    // controller can wrap it cleanly as { success: true, tokens: [...] }
    return response.data?.tokens ?? response.data;
  }

  async getChainDetail(chainId: number) {
    const [chainData, dependencies] = await Promise.all([
      this.getChainById(chainId),
      this.depService.getDependencies(chainId),
    ]);

    return {
      chain: chainData,
      dependencies,
      canTransitionTo: this.lifecycleService.getAllowedTransitions(chainData.status || 'active'),
    };
  }

  async updateChain(chainId: number, dto: any, adminUserId: string) {
    const { data } = await axios.patch(`${this.chainIndexerUrl}/chains/${chainId}`, dto);
    await this.auditLog.log({
      adminUserId,
      action: 'chain.update',
      entityType: 'chain',
      entityId: String(chainId),
      details: dto,
    });
    return data;
  }

  async deleteChain(chainId: number, adminUserId: string) {
    const deps = await this.depService.getDependencies(chainId);
    if (!deps.canPhysicalDelete) {
      throw new ConflictException({
        error: 'DELETE_BLOCKED',
        message: 'Cannot delete chain with existing dependencies. Use lifecycle transitions instead.',
        dependencies: deps,
      });
    }
    const { data } = await axios.delete(`${this.chainIndexerUrl}/chains/${chainId}`);
    await this.auditLog.log({
      adminUserId,
      action: 'chain.delete',
      entityType: 'chain',
      entityId: String(chainId),
    });
    return data;
  }

  async getChainHealth() {
    const [chainsRes, syncHealthRes] = await Promise.all([
      axios.get(`${this.chainIndexerUrl}/chains`),
      axios.get(`${this.chainIndexerUrl}/sync-health`).catch(() => ({ data: [] })),
    ]);

    const chains = chainsRes.data.chains || chainsRes.data.data || chainsRes.data;
    const syncHealth = Array.isArray(syncHealthRes.data) ? syncHealthRes.data : syncHealthRes.data.chains || [];

    return {
      chains: chains.map((chain: any) => {
        const chainId = chain.chainId || chain.id;
        const sync = syncHealth.find((s: any) => s.chainId === chainId);

        return {
          chainId,
          name: chain.name,
          shortName: chain.shortName || chain.symbol,
          symbol: chain.symbol,
          status: chain.status || (chain.isActive ? 'active' : 'inactive'),
          blockTimeSeconds: chain.blockTimeSeconds,
          health: {
            overall: sync?.status || 'unknown',
            lastBlock: sync?.lastBlock || null,
            blocksBehind: sync?.blocksBehind || null,
            lastCheckedAt: sync?.lastCheckedAt || null,
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    };
  }

  private async getChainById(chainId: number) {
    const { data } = await axios.get(`${this.chainIndexerUrl}/chains`);
    const chains = data.chains || data.data || data;
    const chain = chains.find((c: any) => (c.chainId || c.id) === chainId);
    if (!chain) throw new NotFoundException(`Chain ${chainId} not found`);
    return chain;
  }
}
