import { Test, TestingModule } from '@nestjs/testing';
import { ChainDependencyService } from './chain-dependency.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChainDependencyService', () => {
  let service: ChainDependencyService;

  const mockPrisma = {
    rpcNode: { count: jest.fn() },
    clientChainConfig: { count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainDependencyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'CHAIN_INDEXER_URL', useValue: 'http://localhost:3006' },
      ],
    }).compile();
    service = module.get(ChainDependencyService);
  });

  it('should return dependency counts for a chain', async () => {
    mockPrisma.rpcNode.count.mockResolvedValue(3);
    mockPrisma.clientChainConfig.count.mockResolvedValue(2);
    jest.spyOn(service as any, 'fetchIndexerDependencies').mockResolvedValue({
      tokens: 12, wallets: 45,
      depositAddresses: { total: 1230, deployed: 980 },
      deposits: { total: 5600, pending: 3 },
      withdrawals: { total: 890, pending: 1 },
      flushOperations: { total: 340, pending: 2 },
      gasTanks: 8,
    });
    const result = await service.getDependencies(1);
    expect(result.rpcNodes.total).toBe(3);
    expect(result.clients.total).toBe(2);
    expect(result.tokens.total).toBe(12);
    expect(result.deposits.pending).toBe(3);
    expect(result.hasPendingOperations).toBe(true);
    expect(result.hasAnyDependency).toBe(true);
    expect(result.canPhysicalDelete).toBe(false);
  });

  it('should allow physical delete when zero dependencies', async () => {
    mockPrisma.rpcNode.count.mockResolvedValue(0);
    mockPrisma.clientChainConfig.count.mockResolvedValue(0);
    jest.spyOn(service as any, 'fetchIndexerDependencies').mockResolvedValue({
      tokens: 0, wallets: 0,
      depositAddresses: { total: 0, deployed: 0 },
      deposits: { total: 0, pending: 0 },
      withdrawals: { total: 0, pending: 0 },
      flushOperations: { total: 0, pending: 0 },
      gasTanks: 0,
    });
    const result = await service.getDependencies(1);
    expect(result.hasAnyDependency).toBe(false);
    expect(result.canPhysicalDelete).toBe(true);
    expect(result.hasPendingOperations).toBe(false);
  });
});
