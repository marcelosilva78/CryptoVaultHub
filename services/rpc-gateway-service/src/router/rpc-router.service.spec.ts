import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { RpcRouterService } from './rpc-router.service';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

// Mock ethers to control JsonRpcProvider behavior
jest.mock('ethers', () => {
  const mockSend = jest.fn().mockResolvedValue('0x1234');
  return {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    FetchRequest: jest.fn().mockImplementation((url: string) => ({
      url,
      setHeader: jest.fn(),
    })),
    __mockSend: mockSend, // expose for test access
  };
});

describe('RpcRouterService', () => {
  let service: RpcRouterService;
  let mockPrisma: any;
  let mockRateLimiter: Partial<RateLimiterService>;
  let mockCircuitBreaker: Partial<CircuitBreakerService>;
  let mockConfig: Partial<ConfigService>;
  let mockSend: jest.Mock;

  const NODE_A = {
    id: BigInt(1),
    providerId: BigInt(10),
    chainId: 1,
    endpointUrl: 'https://rpc-a.example.com',
    priority: 1,
    weight: 100,
    status: 'active',
    maxRequestsPerSecond: 10,
    maxRequestsPerMinute: 100,
    timeoutMs: 5000,
    healthScore: 100,
    consecutiveFailures: 0,
    provider: null,
  };

  const NODE_B = {
    id: BigInt(2),
    providerId: BigInt(20),
    chainId: 1,
    endpointUrl: 'https://rpc-b.example.com',
    priority: 2,
    weight: 80,
    status: 'active',
    maxRequestsPerSecond: 10,
    maxRequestsPerMinute: 100,
    timeoutMs: 5000,
    healthScore: 90,
    consecutiveFailures: 0,
    provider: null,
  };

  const AUTHED_NODE = {
    ...NODE_A,
    id: BigInt(3),
    provider: {
      authMethod: 'api_key',
      authHeaderName: 'x-api-key',
      apiKeyEncrypted: 'deadbeef:cafebabe:encrypted_key',
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Get the mock send from ethers mock
    mockSend = require('ethers').__mockSend;
    mockSend.mockReset().mockResolvedValue('0x1234');

    mockPrisma = {
      rpcNode: {
        findMany: jest.fn().mockResolvedValue([NODE_A, NODE_B]),
        update: jest.fn().mockResolvedValue({}),
      },
      providerSwitchLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    mockRateLimiter = {
      checkAndRecord: jest.fn().mockResolvedValue(true),
      isQuotaExhausted: jest.fn().mockResolvedValue(false),
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };

    mockCircuitBreaker = {
      isAllowed: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };

    mockConfig = {
      get: jest.fn().mockReturnValue(''),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RpcRouterService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RateLimiterService, useValue: mockRateLimiter },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<RpcRouterService>(RpcRouterService);
  });

  describe('selectNode', () => {
    it('should select node with highest health score', async () => {
      mockPrisma.rpcNode.findMany.mockResolvedValue([NODE_A, NODE_B]);

      const selected = await service.selectNode(1);

      // NODE_A has priority 1 (lower = better), so it should be selected first
      expect(selected).toBeDefined();
      expect(selected!.id).toBe(NODE_A.id);
    });

    it('should skip nodes rejected by circuit breaker', async () => {
      mockPrisma.rpcNode.findMany.mockResolvedValue([NODE_A, NODE_B]);
      (mockCircuitBreaker.isAllowed as jest.Mock).mockImplementation(
        (nodeId: string) => nodeId !== '1', // Reject NODE_A
      );

      const selected = await service.selectNode(1);

      expect(selected).toBeDefined();
      expect(selected!.id).toBe(NODE_B.id);
    });

    it('should skip nodes rejected by rate limiter', async () => {
      mockPrisma.rpcNode.findMany.mockResolvedValue([NODE_A, NODE_B]);
      (mockRateLimiter.checkAndRecord as jest.Mock).mockImplementation(
        async (nodeId: bigint) => nodeId !== BigInt(1), // Reject NODE_A
      );

      const selected = await service.selectNode(1);

      expect(selected).toBeDefined();
      expect(selected!.id).toBe(NODE_B.id);
    });
  });

  describe('callNode', () => {
    it('should inject auth headers for authenticated providers', async () => {
      // Spy on createAuthProvider to verify it receives the provider auth config
      const spy = jest.spyOn(service as any, 'createAuthProvider');

      await (service as any).callNode(AUTHED_NODE, 'eth_blockNumber', []);

      expect(spy).toHaveBeenCalledWith(
        AUTHED_NODE.endpointUrl,
        expect.objectContaining({
          authMethod: 'api_key',
          authHeaderName: 'x-api-key',
          apiKeyEncrypted: expect.any(String),
        }),
      );
    });

    it('should use plain provider for non-authenticated nodes', async () => {
      const spy = jest.spyOn(service as any, 'createAuthProvider');

      await (service as any).callNode(NODE_A, 'eth_blockNumber', []);

      // Should be called with null provider (no auth)
      expect(spy).toHaveBeenCalledWith(NODE_A.endpointUrl, null);
    });
  });

  describe('executeRpcCall', () => {
    it('should retry on failure with next available node', async () => {
      // First call fails, second succeeds
      mockSend
        .mockRejectedValueOnce(new Error('RPC timeout'))
        .mockResolvedValueOnce('0xblock');

      const result = await service.executeRpcCall(1, 'eth_blockNumber', []);

      expect(result.result).toBe('0xblock');
      // Circuit breaker should have recorded failure for first node
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
      // And success for second node
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
    });

    it('should report failure to circuit breaker on error', async () => {
      mockSend.mockRejectedValue(new Error('All nodes down'));
      // Return NODE_A on first query, then empty on subsequent queries (since NODE_A is excluded)
      mockPrisma.rpcNode.findMany
        .mockResolvedValueOnce([NODE_A])
        .mockResolvedValue([]);

      await expect(
        service.executeRpcCall(1, 'eth_blockNumber', []),
      ).rejects.toThrow(BadRequestException);

      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith(
        NODE_A.id.toString(),
      );
    });
  });
});
