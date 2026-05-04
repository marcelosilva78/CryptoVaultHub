import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Redis from 'ioredis';
import { AuditLogService } from '../common/audit-log.service';
import { ChainDependencyService } from './chain-dependency.service';
import { ChainLifecycleService } from './chain-lifecycle.service';

@Injectable()
export class ChainManagementService {
  private readonly logger = new Logger(ChainManagementService.name);
  private readonly chainIndexerUrl: string;
  private readonly rpcGatewayUrl: string;
  private readonly redis: Redis;

  private get internalHeaders() {
    return { 'X-Internal-Service-Key': this.configService.get<string>('INTERNAL_SERVICE_KEY', '') };
  }

  constructor(
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
    private readonly depService: ChainDependencyService,
    private readonly lifecycleService: ChainLifecycleService,
    @Optional() @Inject('RPC_GATEWAY_URL') rpcGatewayUrl?: string,
  ) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
    this.rpcGatewayUrl = rpcGatewayUrl
      ?? this.configService.get<string>('RPC_GATEWAY_URL', 'http://rpc-gateway-service:3009');
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    this.redis.connect().catch((err) => {
      this.logger.warn(`Redis connection failed (chain-management cache disabled): ${err.message}`);
    });
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
        { timeout: 10000, headers: this.internalHeaders },
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
      { timeout: 10000, headers: this.internalHeaders },
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
    // On-chain ERC-20 validation: verify submitted metadata matches the contract
    await this.validateTokenOnChain(data);

    const response = await axios.post(
      `${this.chainIndexerUrl}/tokens`,
      data,
      { timeout: 10000, headers: this.internalHeaders },
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
      { timeout: 10000, headers: this.internalHeaders },
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
    const { data } = await axios.patch(`${this.chainIndexerUrl}/chains/${chainId}`, dto, { headers: this.internalHeaders });
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
    const { data } = await axios.delete(`${this.chainIndexerUrl}/chains/${chainId}`, { headers: this.internalHeaders });
    await this.auditLog.log({
      adminUserId,
      action: 'chain.delete',
      entityType: 'chain',
      entityId: String(chainId),
    });
    return data;
  }

  /**
   * Validate token metadata on-chain by calling symbol(), decimals(), name()
   * on the ERC-20 contract. Throws BadRequestException on mismatch or if
   * the address is not a valid ERC-20 contract.
   */
  private async validateTokenOnChain(data: {
    name: string;
    symbol: string;
    chainId: number;
    contractAddress: string;
    decimals: number;
  }): Promise<void> {
    // Resolve an RPC endpoint for the chain from the chain-indexer
    let rpcUrl: string;
    try {
      const { data: chainsData } = await axios.get(
        `${this.chainIndexerUrl}/chains`,
        { timeout: 10000, headers: this.internalHeaders },
      );
      const chains = chainsData?.chains ?? chainsData;
      const chain = chains.find(
        (c: any) => (c.chainId || c.id) === data.chainId,
      );
      if (!chain) {
        throw new BadRequestException(
          `Chain ${data.chainId} not found — register the chain before adding tokens`,
        );
      }

      // rpcEndpoints can be string[] or object[]
      const endpoints = chain.rpcEndpoints ?? [];
      const firstEndpoint = endpoints[0];
      if (!firstEndpoint) {
        this.logger.warn(
          `No RPC endpoint for chain ${data.chainId}, skipping on-chain token validation`,
        );
        return;
      }
      rpcUrl = typeof firstEndpoint === 'string' ? firstEndpoint : firstEndpoint.url;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Could not fetch chain data for on-chain validation: ${err.message}`);
      return; // non-blocking: if chain-indexer is unreachable, skip validation
    }

    const ERC20_METADATA_ABI = [
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function name() view returns (string)',
    ];

    try {
      const { JsonRpcProvider, Contract } = await import('ethers');
      const provider = new JsonRpcProvider(rpcUrl, undefined, {
        staticNetwork: true,
        batchMaxCount: 1,
      });

      const contract = new Contract(
        data.contractAddress,
        ERC20_METADATA_ABI,
        provider,
      );

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('On-chain validation timeout')), 15000),
      );

      const [onChainSymbol, onChainDecimals, onChainName] = await Promise.race([
        Promise.all([
          contract.symbol() as Promise<string>,
          contract.decimals() as Promise<number>,
          contract.name() as Promise<string>,
        ]),
        timeoutPromise,
      ]);

      const mismatches: string[] = [];

      if (onChainSymbol !== data.symbol) {
        mismatches.push(
          `symbol: submitted "${data.symbol}", on-chain "${onChainSymbol}"`,
        );
      }

      if (Number(onChainDecimals) !== data.decimals) {
        mismatches.push(
          `decimals: submitted ${data.decimals}, on-chain ${onChainDecimals}`,
        );
      }

      if (onChainName !== data.name) {
        mismatches.push(
          `name: submitted "${data.name}", on-chain "${onChainName}"`,
        );
      }

      if (mismatches.length > 0) {
        throw new BadRequestException(
          `Token metadata mismatch with on-chain contract: ${mismatches.join('; ')}`,
        );
      }

      provider.destroy();
      this.logger.log(
        `On-chain validation passed for ${data.symbol} at ${data.contractAddress}`,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;

      // Reverts or call exceptions indicate the address is not a valid ERC-20
      if (
        err.code === 'CALL_EXCEPTION' ||
        err.code === 'BAD_DATA' ||
        err.message?.includes('revert') ||
        err.message?.includes('could not decode')
      ) {
        throw new BadRequestException(
          `Address ${data.contractAddress} is not a valid ERC-20 contract on chain ${data.chainId}`,
        );
      }

      // Network/timeout errors — log warning but don't block token creation
      this.logger.warn(
        `On-chain token validation failed (non-blocking): ${err.message}`,
      );
    }
  }

  async getChainHealth() {
    // Check Redis cache first (15s TTL)
    const cacheKey = 'admin:chains:health';
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable — proceed without cache
    }

    const [chainsRes, syncHealthRes, rpcHealthRes, rpcNodes] = await Promise.all([
      axios.get(`${this.chainIndexerUrl}/chains`, { headers: this.internalHeaders }),
      axios.get(`${this.chainIndexerUrl}/sync-health`, { headers: this.internalHeaders }).catch((err) => {
        this.logger.warn(`Failed to fetch sync-health: ${err.message}`);
        return { data: [] };
      }),
      axios.get(`${this.rpcGatewayUrl}/rpc/health`).catch((err) => {
        this.logger.warn(`Failed to fetch rpc-health: ${err.message}`);
        return { data: { nodes: [] } };
      }),
      this.depService.getRpcNodeCounts().catch(
        () => new Map<number, { total: number; active: number }>(),
      ),
    ]);

    const chains = chainsRes.data.chains || chainsRes.data.data || chainsRes.data;
    const syncHealth = Array.isArray(syncHealthRes.data)
      ? syncHealthRes.data
      : syncHealthRes.data.chains || [];
    const rpcNodesHealth = rpcHealthRes.data.nodes || [];

    // Fetch pending operations for all chains in parallel
    const chainIds = chains.map((c: any) => c.chainId || c.id);
    const depsResults = await Promise.all(
      chainIds.map((cid: number) =>
        axios
          .get(`${this.chainIndexerUrl}/chains/${cid}/dependencies`, {
            timeout: 5000,
            headers: this.internalHeaders,
          })
          .then((res) => ({ chainId: cid, data: res.data }))
          .catch(() => ({ chainId: cid, data: null })),
      ),
    );
    const depsMap = new Map<number, any>();
    for (const d of depsResults) {
      if (d.data) depsMap.set(d.chainId, d.data);
    }

    // Group RPC nodes by chainId
    const rpcByChain = new Map<number, any[]>();
    for (const node of rpcNodesHealth) {
      const list = rpcByChain.get(node.chainId) ?? [];
      list.push(node);
      rpcByChain.set(node.chainId, list);
    }

    const result = {
      chains: chains.map((chain: any) => {
        const chainId = chain.chainId || chain.id;
        const sync = syncHealth.find((s: any) => s.chainId === chainId);
        const rpc = rpcNodes instanceof Map ? rpcNodes.get(chainId) : undefined;
        const rpcHealth = rpcByChain.get(chainId) ?? [];
        const deps = depsMap.get(chainId);

        const healthyNodes = rpcHealth.filter(
          (n: any) => n.status === 'active' && n.healthScore >= 70,
        ).length;

        // Derive quota status from worst-case node
        let quotaStatus: string = 'available';
        for (const node of rpcHealth) {
          if (node.quota) {
            const { dailyUsed, dailyLimit, monthlyUsed, monthlyLimit } = node.quota;
            if (monthlyLimit && monthlyUsed >= monthlyLimit) {
              quotaStatus = 'monthly_exhausted';
              break;
            }
            if (dailyLimit && dailyUsed >= dailyLimit) {
              quotaStatus = 'daily_exhausted';
              break;
            }
            if (
              (dailyLimit && dailyUsed >= dailyLimit * 0.8) ||
              (monthlyLimit && monthlyUsed >= monthlyLimit * 0.8)
            ) {
              quotaStatus = 'approaching';
            }
          }
        }

        const nodesWithLatency = rpcHealth.filter(
          (n: any) => n.lastLatencyMs != null,
        );
        const avgLatencyMs =
          nodesWithLatency.length > 0
            ? Math.round(
                nodesWithLatency.reduce(
                  (sum: number, n: any) => sum + n.lastLatencyMs,
                  0,
                ) / nodesWithLatency.length,
              )
            : null;

        return {
          chainId,
          name: chain.name,
          shortName: chain.shortName || chain.symbol,
          symbol: chain.symbol,
          status: chain.status ?? (chain.isActive ? 'active' : 'inactive'),
          blockTimeSeconds: chain.blockTimeSeconds
            ? Number(chain.blockTimeSeconds)
            : null,
          health: {
            overall: sync?.status ?? 'unknown',
            lastBlock: sync?.lastBlock ?? null,
            blocksBehind: sync?.blocksBehind ?? null,
            lastCheckedAt: sync?.lastUpdated ?? sync?.lastCheckedAt ?? null,
            staleSince: sync?.status === 'error' ? sync?.lastUpdated : null,
          },
          rpc: {
            totalNodes: rpc?.total ?? rpcHealth.length,
            activeNodes: rpc?.active ?? rpcHealth.filter((n: any) => n.status === 'active').length,
            healthyNodes,
            avgLatencyMs,
            quotaStatus,
          },
          operations: {
            pendingDeposits: deps?.deposits?.pending ?? 0,
            pendingWithdrawals: deps?.withdrawals?.pending ?? 0,
            pendingFlushes: deps?.flushOperations?.pending ?? 0,
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    };

    // Cache for 15 seconds
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 15);
    } catch {
      // Redis unavailable — skip caching
    }

    return result;
  }

  private async getChainById(chainId: number) {
    const { data } = await axios.get(`${this.chainIndexerUrl}/chains`, { headers: this.internalHeaders });
    const chains = data.chains || data.data || data;
    const chain = chains.find((c: any) => (c.chainId || c.id) === chainId);
    if (!chain) throw new NotFoundException(`Chain ${chainId} not found`);
    return chain;
  }
}
