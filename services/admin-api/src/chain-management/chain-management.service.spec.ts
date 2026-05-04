import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChainManagementService } from './chain-management.service';
import { AuditLogService } from '../common/audit-log.service';
import { ChainDependencyService } from './chain-dependency.service';
import { ChainLifecycleService } from './chain-lifecycle.service';

/* ------------------------------------------------------------------ */
/*  Mock external modules                                              */
/* ------------------------------------------------------------------ */

// Mock axios at the module level
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
}));
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

// Mock ioredis — return a fake Redis instance
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn().mockResolvedValue(1);
const mockRedisConnect = jest.fn().mockResolvedValue(undefined);
const mockRedisDisconnect = jest.fn().mockResolvedValue(undefined);
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    connect: mockRedisConnect,
    disconnect: mockRedisDisconnect,
    quit: mockRedisDisconnect,
  }));
});

// Mock ethers — we control the JsonRpcProvider behaviour per test
const mockGetNetwork = jest.fn();
const mockGetBlockNumber = jest.fn();
const mockDestroy = jest.fn();
jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    getNetwork: mockGetNetwork,
    getBlockNumber: mockGetBlockNumber,
    destroy: mockDestroy,
  })),
}));

// Mock @cvh/event-bus so the optional injection does not break
jest.mock('@cvh/event-bus', () => ({
  EventBusService: jest.fn(),
  TOPICS: { CHAIN_STATUS: 'chain.status' },
}));

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */

describe('ChainManagementService', () => {
  let service: ChainManagementService;
  let auditLog: any;
  let depService: any;
  let lifecycleService: any;

  const CHAIN_INDEXER_URL = 'http://localhost:3006';
  const RPC_GATEWAY_URL = 'http://rpc-gateway-service:3009';

  const baseChainDto = {
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    chainId: 1,
    rpcUrl: 'https://mainnet.infura.io/v3/key',
    explorerUrl: 'https://etherscan.io',
    confirmationsRequired: 12,
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    depService = {
      getDependencies: jest.fn(),
      getRpcNodeCounts: jest.fn(),
    };
    lifecycleService = {
      getAllowedTransitions: jest.fn().mockReturnValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainManagementService,
        { provide: AuditLogService, useValue: auditLog },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => {
              const map: Record<string, any> = {
                CHAIN_INDEXER_URL: CHAIN_INDEXER_URL,
                RPC_GATEWAY_URL: RPC_GATEWAY_URL,
                INTERNAL_SERVICE_KEY: 'test-key',
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: undefined,
              };
              return map[key] ?? fallback;
            }),
          },
        },
        { provide: ChainDependencyService, useValue: depService },
        { provide: ChainLifecycleService, useValue: lifecycleService },
        { provide: 'RPC_GATEWAY_URL', useValue: RPC_GATEWAY_URL },
      ],
    }).compile();

    service = module.get(ChainManagementService);
  });

  /* ================================================================ */
  /*  addChain                                                         */
  /* ================================================================ */

  describe('addChain', () => {
    it('happy path: creates chain with RPC probe success', async () => {
      // RPC probe succeeds — chainId matches
      mockGetNetwork.mockResolvedValue({ chainId: BigInt(1) });
      mockGetBlockNumber.mockResolvedValue(19_000_000);

      // chain-indexer accepts creation
      const createdChain = { id: 1, ...baseChainDto, status: 'active', createdAt: '2026-04-23T00:00:00Z' };
      mockAxios.post.mockResolvedValue({ data: createdChain });

      const result = await service.addChain(baseChainDto, 'admin-1', '127.0.0.1');

      expect(result.rpcProbe).toEqual(
        expect.objectContaining({ reachable: true, chainIdMatch: true, latestBlock: 19_000_000 }),
      );
      expect(result.warnings).toEqual([]);
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${CHAIN_INDEXER_URL}/chains`,
        expect.objectContaining({ chainId: 1, status: 'active', isActive: true }),
        expect.any(Object),
      );
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'chain.add', entityId: '1', adminUserId: 'admin-1' }),
      );
    });

    it('chainId mismatch: RPC returns different chainId -> throws BadRequestException', async () => {
      mockGetNetwork.mockResolvedValue({ chainId: BigInt(56) }); // BSC instead of 1
      mockGetBlockNumber.mockResolvedValue(100);

      await expect(service.addChain(baseChainDto, 'admin-1')).rejects.toThrow(BadRequestException);
      // Should NOT have called the indexer
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('RPC unreachable: chain created as inactive with warning', async () => {
      // RPC probe times out / errors
      mockGetNetwork.mockRejectedValue(new Error('ECONNREFUSED'));

      const createdChain = { id: 2, ...baseChainDto, status: 'inactive', isActive: false };
      mockAxios.post.mockResolvedValue({ data: createdChain });

      const result = await service.addChain(baseChainDto, 'admin-1');

      expect(result.rpcProbe).toEqual(
        expect.objectContaining({ reachable: false }),
      );
      expect(result.warnings).toContain('RPC endpoint unreachable — chain created as inactive');
      // Indexer should receive status: inactive, isActive: false
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${CHAIN_INDEXER_URL}/chains`,
        expect.objectContaining({ status: 'inactive', isActive: false }),
        expect.any(Object),
      );
    });

    it('duplicate chainId: indexer returns 409 -> throws ConflictException', async () => {
      // RPC probe OK
      mockGetNetwork.mockResolvedValue({ chainId: BigInt(1) });
      mockGetBlockNumber.mockResolvedValue(19_000_000);

      // Indexer returns 409
      const axiosError: any = new Error('Request failed with status code 409');
      axiosError.response = { status: 409, data: { message: 'already exists' } };
      mockAxios.post.mockRejectedValue(axiosError);

      await expect(service.addChain(baseChainDto, 'admin-1')).rejects.toThrow(ConflictException);
    });
  });

  /* ================================================================ */
  /*  deleteChain                                                      */
  /* ================================================================ */

  describe('deleteChain', () => {
    /** Helper: mock getChainById to return a chain with a given status */
    const mockChainLookup = (status: string) => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          chains: [{ chainId: 1, name: 'Ethereum', status, isActive: status === 'active' }],
        },
      });
    };

    it('blocked when chain is not archived (new requirement)', async () => {
      mockChainLookup('active');

      try {
        await service.deleteChain(1, 'admin-1');
        fail('Expected BadRequestException');
      } catch (e: any) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect(e.message).toMatch(/archived/i);
      }
      // Should NOT check dependencies or call delete
      expect(depService.getDependencies).not.toHaveBeenCalled();
      expect(mockAxios.delete).not.toHaveBeenCalled();
    });

    it('blocked when dependencies exist (canPhysicalDelete = false)', async () => {
      mockChainLookup('archived');
      depService.getDependencies.mockResolvedValue({
        canPhysicalDelete: false,
        hasPendingOperations: true,
        hasAnyDependency: true,
        rpcNodes: { total: 2, active: 1 },
        deposits: { total: 500, pending: 3 },
        withdrawals: { total: 100, pending: 0 },
        flushOperations: { total: 50, pending: 0 },
      });

      await expect(service.deleteChain(1, 'admin-1')).rejects.toThrow(ConflictException);
      expect(mockAxios.delete).not.toHaveBeenCalled();
      expect(auditLog.log).not.toHaveBeenCalled();
    });

    it('allowed when archived with zero dependencies', async () => {
      mockChainLookup('archived');
      depService.getDependencies.mockResolvedValue({
        canPhysicalDelete: true,
        hasPendingOperations: false,
        hasAnyDependency: false,
        rpcNodes: { total: 0, active: 0 },
        deposits: { total: 0, pending: 0 },
        withdrawals: { total: 0, pending: 0 },
        flushOperations: { total: 0, pending: 0 },
      });
      mockAxios.delete.mockResolvedValue({ data: { deleted: true } });

      const result = await service.deleteChain(1, 'admin-1');

      expect(result).toEqual({ deleted: true });
      expect(mockAxios.delete).toHaveBeenCalledWith(
        `${CHAIN_INDEXER_URL}/chains/1`,
        expect.objectContaining({ headers: expect.any(Object) }),
      );
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'chain.delete', entityId: '1' }),
      );
    });

    it('blocked when chain has dependencies even without pending ops', async () => {
      mockChainLookup('archived');
      depService.getDependencies.mockResolvedValue({
        canPhysicalDelete: false,
        hasPendingOperations: false,
        hasAnyDependency: true,
        rpcNodes: { total: 1, active: 0 },
        tokens: { total: 2 },
        deposits: { total: 100, pending: 0 },
        withdrawals: { total: 50, pending: 0 },
        flushOperations: { total: 10, pending: 0 },
      });

      try {
        await service.deleteChain(1, 'admin-1');
        fail('Expected ConflictException');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ConflictException);
        expect(e.getResponse().error).toBe('DELETE_BLOCKED');
      }
      expect(mockAxios.delete).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  getChainHealth                                                   */
  /* ================================================================ */

  describe('getChainHealth', () => {
    const fakeChainsResponse = {
      data: {
        chains: [
          { chainId: 1, name: 'Ethereum', symbol: 'ETH', status: 'active' },
        ],
      },
    };
    const fakeSyncHealth = {
      data: [{ chainId: 1, status: 'syncing', lastBlock: 19_000_000, blocksBehind: 2 }],
    };
    const fakeRpcHealth = {
      data: {
        nodes: [
          { chainId: 1, status: 'active', healthScore: 90, lastLatencyMs: 50 },
        ],
      },
    };
    const fakeDepResponse = {
      data: {
        deposits: { pending: 1 },
        withdrawals: { pending: 0 },
        flushOperations: { pending: 0 },
      },
    };

    it('Redis cache hit returns cached data', async () => {
      const cachedPayload = { chains: [{ chainId: 1, name: 'cached' }], updatedAt: '2026-01-01' };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedPayload));

      const result = await service.getChainHealth();

      expect(result).toEqual(cachedPayload);
      // No HTTP calls should have been made
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('Redis cache miss triggers fan-out to 4 services', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');

      depService.getRpcNodeCounts.mockResolvedValue(
        new Map([[1, { total: 1, active: 1 }]]),
      );

      // Setup all 4 fan-out calls (chains, sync-health, rpc-health, per-chain deps)
      mockAxios.get
        .mockResolvedValueOnce(fakeChainsResponse)     // chains
        .mockResolvedValueOnce(fakeSyncHealth)          // sync-health
        .mockResolvedValueOnce(fakeRpcHealth)           // rpc-health
        .mockResolvedValueOnce(fakeDepResponse);        // chains/:chainId/dependencies

      const result = await service.getChainHealth();

      // Verify the fan-out happened
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${CHAIN_INDEXER_URL}/chains`,
        expect.any(Object),
      );
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${CHAIN_INDEXER_URL}/sync-health`,
        expect.any(Object),
      );
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${RPC_GATEWAY_URL}/rpc/health`,
      );

      // Verify result structure
      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].chainId).toBe(1);
      expect(result.chains[0].health).toBeDefined();
      expect(result.chains[0].rpc).toBeDefined();
      expect(result.chains[0].operations).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // Verify cache was set with 15-second TTL
      expect(mockRedisSet).toHaveBeenCalledWith(
        'admin:chains:health',
        expect.any(String),
        'EX',
        15,
      );
    });
  });
});
