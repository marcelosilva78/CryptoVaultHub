import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';

// Mock ethers JsonRpcProvider
jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    getBlockNumber: jest.fn().mockResolvedValue(12345),
  })),
}));

describe('HealthService', () => {
  let service: HealthService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      rpcNode: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      rpcProviderHealth: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RateLimiterService, useValue: { registerNode: jest.fn(), getQuotaUsage: jest.fn().mockResolvedValue({ dailyUsed: 0, monthlyUsed: 0, dailyLimit: null, monthlyLimit: null }) } },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should increase health_score on successful check', async () => {
    const node = {
      id: 1n,
      endpointUrl: 'http://localhost:8545',
      timeoutMs: 5000,
      consecutiveFailures: 2,
      healthScore: 50,
    };

    await service.checkNode(node);

    expect(prisma.rpcNode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1n },
        data: expect.objectContaining({
          consecutiveFailures: 0,
          lastHealthCheckAt: expect.any(Date),
          lastHealthyAt: expect.any(Date),
        }),
      }),
    );

    // New score = 50 * 0.7 + 100 * 0.3 = 35 + 30 = 65
    const updateCall = prisma.rpcNode.update.mock.calls[0][0];
    const score = Number(updateCall.data.healthScore);
    expect(score).toBeCloseTo(65, 0);
  });

  it('should decrease health_score on failure', async () => {
    const { JsonRpcProvider } = require('ethers');
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockRejectedValue(new Error('Connection refused')),
    }));

    const node = {
      id: 2n,
      endpointUrl: 'http://bad-node:8545',
      timeoutMs: 5000,
      consecutiveFailures: 0,
      healthScore: 80,
    };

    await service.checkNode(node);

    expect(prisma.rpcNode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2n },
        data: expect.objectContaining({
          consecutiveFailures: 1,
        }),
      }),
    );

    // penalty = min(30, 1 * 10) = 10; newScore = max(0, 80 - 10) = 70
    const updateCall = prisma.rpcNode.update.mock.calls[0][0];
    const score = Number(updateCall.data.healthScore);
    expect(score).toBeCloseTo(70, 0);

    // Reset mock
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(12345),
    }));
  });

  it('should transition node to unhealthy after 3 consecutive failures', async () => {
    const { JsonRpcProvider } = require('ethers');
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockRejectedValue(new Error('Timeout')),
    }));

    const node = {
      id: 3n,
      endpointUrl: 'http://flaky:8545',
      timeoutMs: 5000,
      consecutiveFailures: 2, // will become 3
      healthScore: 40,
    };

    await service.checkNode(node);

    const updateCall = prisma.rpcNode.update.mock.calls[0][0];
    expect(updateCall.data.consecutiveFailures).toBe(3);
    expect(updateCall.data.status).toBe('unhealthy');

    // Reset mock
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(12345),
    }));
  });

  it('should recover node to active after successful check with high score', async () => {
    const { JsonRpcProvider } = require('ethers');
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(99999),
    }));

    const node = {
      id: 4n,
      endpointUrl: 'http://recovering:8545',
      timeoutMs: 5000,
      consecutiveFailures: 0,
      healthScore: 90, // newScore = 90*0.7 + 100*0.3 = 63+30 = 93 (>= 70 and failures=0)
    };

    await service.checkNode(node);

    const updateCall = prisma.rpcNode.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('active');
    expect(updateCall.data.consecutiveFailures).toBe(0);
  });

  it('should not change status when score is in intermediate range', async () => {
    const { JsonRpcProvider } = require('ethers');
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(12345),
    }));

    const node = {
      id: 5n,
      endpointUrl: 'http://middling:8545',
      timeoutMs: 5000,
      consecutiveFailures: 0,
      healthScore: 30, // newScore = 30*0.7 + 100*0.3 = 21+30 = 51 (< 70)
    };

    await service.checkNode(node);

    const updateCall = prisma.rpcNode.update.mock.calls[0][0];
    // Score is 51, which is between 20 and 70 with 0 failures -> no status change
    expect(updateCall.data.status).toBeUndefined();
  });

  it('should transition to unhealthy when score drops below 20', async () => {
    const { JsonRpcProvider } = require('ethers');
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockRejectedValue(new Error('Dead')),
    }));

    const node = {
      id: 6n,
      endpointUrl: 'http://dying:8545',
      timeoutMs: 5000,
      consecutiveFailures: 1, // will become 2
      healthScore: 25, // penalty = min(30, 2*10) = 20; newScore = max(0, 25-20) = 5 (< 20)
    };

    await service.checkNode(node);

    const updateCall = prisma.rpcNode.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('unhealthy');

    // Reset mock
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(12345),
    }));
  });

  it('should record latency and block height metrics on success', async () => {
    const { JsonRpcProvider } = require('ethers');
    JsonRpcProvider.mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(55555),
    }));

    const node = {
      id: 7n,
      endpointUrl: 'http://fast:8545',
      timeoutMs: 5000,
      consecutiveFailures: 0,
      healthScore: 100,
    };

    await service.checkNode(node);

    // Should record two metrics: latency and block_height
    expect(prisma.rpcProviderHealth.create).toHaveBeenCalledTimes(2);
    expect(prisma.rpcProviderHealth.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nodeId: 7n,
          checkType: 'latency',
        }),
      }),
    );
    expect(prisma.rpcProviderHealth.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nodeId: 7n,
          checkType: 'block_height',
        }),
      }),
    );
  });
});
