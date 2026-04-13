import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { ChainLifecycleService } from './chain-lifecycle.service';
import { ChainDependencyService } from './chain-dependency.service';
import { AuditLogService } from '../common/audit-log.service';

describe('ChainLifecycleService', () => {
  let service: ChainLifecycleService;
  let depService: any;
  let auditService: any;

  const noDeps = {
    hasPendingOperations: false, hasAnyDependency: false, canPhysicalDelete: true,
    rpcNodes: { total: 0, active: 0 },
    deposits: { total: 0, pending: 0 },
    withdrawals: { total: 0, pending: 0 },
    flushOperations: { total: 0, pending: 0 },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    depService = { getDependencies: jest.fn() };
    auditService = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChainLifecycleService,
        { provide: ChainDependencyService, useValue: depService },
        { provide: AuditLogService, useValue: auditService },
        { provide: 'CHAIN_INDEXER_URL', useValue: 'http://localhost:3006' },
      ],
    }).compile();
    service = module.get(ChainLifecycleService);
  });

  it('should allow active → draining always', async () => {
    depService.getDependencies.mockResolvedValue(noDeps);
    jest.spyOn(service as any, 'getCurrentStatus').mockResolvedValue('active');
    jest.spyOn(service as any, 'updateChainStatus').mockResolvedValue(undefined);

    const result = await service.transition(1, 'drain', 'Maintenance window', 1);
    expect(result.newStatus).toBe('draining');
    expect(auditService.log).toHaveBeenCalled();
  });

  it('should block draining → inactive when pending deposits', async () => {
    depService.getDependencies.mockResolvedValue({
      ...noDeps, hasPendingOperations: true,
      deposits: { total: 100, pending: 3 },
      withdrawals: { total: 50, pending: 0 },
      flushOperations: { total: 30, pending: 0 },
    });
    jest.spyOn(service as any, 'getCurrentStatus').mockResolvedValue('draining');

    await expect(service.transition(1, 'deactivate', 'Want to deactivate', 1))
      .rejects.toThrow(ConflictException);
  });

  it('should allow active → inactive (emergency) with warnings', async () => {
    depService.getDependencies.mockResolvedValue({
      ...noDeps, hasPendingOperations: true, hasAnyDependency: true,
      deposits: { total: 100, pending: 3 },
      withdrawals: { total: 0, pending: 0 },
      flushOperations: { total: 0, pending: 0 },
    });
    jest.spyOn(service as any, 'getCurrentStatus').mockResolvedValue('active');
    jest.spyOn(service as any, 'updateChainStatus').mockResolvedValue(undefined);

    const result = await service.transition(1, 'deactivate', 'Emergency shutdown', 1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.newStatus).toBe('inactive');
  });

  it('should reject invalid transition', async () => {
    depService.getDependencies.mockResolvedValue(noDeps);
    jest.spyOn(service as any, 'getCurrentStatus').mockResolvedValue('archived');

    await expect(service.transition(1, 'drain', 'Want to drain', 1))
      .rejects.toThrow(BadRequestException);
  });

  it('should return correct allowed transitions per status', () => {
    expect(service.getAllowedTransitions('active')).toEqual(['drain', 'deactivate']);
    expect(service.getAllowedTransitions('draining')).toEqual(['deactivate']);
    expect(service.getAllowedTransitions('inactive')).toEqual(['archive', 'reactivate']);
    expect(service.getAllowedTransitions('archived')).toEqual(['reactivate']);
  });
});
