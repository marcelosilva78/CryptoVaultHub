import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChainManagementController } from './chain-management.controller';
import { ChainManagementService } from './chain-management.service';
import { ChainLifecycleService } from './chain-lifecycle.service';

describe('ChainManagementController', () => {
  let controller: ChainManagementController;

  const mockChainService = {
    addChain: jest.fn(),
    listChains: jest.fn(),
    getChainHealth: jest.fn(),
    getChainDetail: jest.fn(),
    updateChain: jest.fn(),
    deleteChain: jest.fn(),
    addToken: jest.fn(),
    listTokens: jest.fn(),
  };

  const mockLifecycleService = {
    transition: jest.fn(),
    getAllowedTransitions: jest.fn(),
  };

  const mockReq = {
    user: { userId: 'admin-1', role: 'super_admin' },
    ip: '127.0.0.1',
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChainManagementController],
      providers: [
        { provide: ChainManagementService, useValue: mockChainService },
        { provide: ChainLifecycleService, useValue: mockLifecycleService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-value'),
            getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
          },
        },
      ],
    }).compile();

    controller = module.get(ChainManagementController);
  });

  /* ================================================================ */
  /*  POST /admin/chains                                               */
  /* ================================================================ */

  describe('POST /admin/chains (addChain)', () => {
    it('calls addChain with correct args and returns { success, chain }', async () => {
      const dto = {
        name: 'Ethereum Mainnet',
        symbol: 'ETH',
        chainId: 1,
        rpcUrl: 'https://mainnet.infura.io/v3/key',
      };
      const chainResult = { id: 1, ...dto, status: 'active' };
      mockChainService.addChain.mockResolvedValue(chainResult);

      const result = await controller.addChain(dto as any, mockReq);

      expect(result).toEqual({ success: true, chain: chainResult });
      expect(mockChainService.addChain).toHaveBeenCalledWith(
        dto,
        'admin-1',
        '127.0.0.1',
      );
    });
  });

  /* ================================================================ */
  /*  GET /admin/chains                                                */
  /* ================================================================ */

  describe('GET /admin/chains (listChains)', () => {
    it('calls listChains and returns { success, chains }', async () => {
      const chains = [
        { id: 1, name: 'Ethereum', chainId: 1 },
        { id: 2, name: 'Polygon', chainId: 137 },
      ];
      mockChainService.listChains.mockResolvedValue(chains);

      const result = await controller.listChains();

      expect(result).toEqual({ success: true, chains });
      expect(mockChainService.listChains).toHaveBeenCalledTimes(1);
    });
  });

  /* ================================================================ */
  /*  GET /admin/chains/health                                         */
  /* ================================================================ */

  describe('GET /admin/chains/health (getChainHealth)', () => {
    it('calls getChainHealth and returns result directly', async () => {
      const healthData = {
        chains: [{ chainId: 1, health: { overall: 'syncing' } }],
        updatedAt: '2026-04-23T00:00:00Z',
      };
      mockChainService.getChainHealth.mockResolvedValue(healthData);

      const result = await controller.getChainHealth();

      expect(result).toEqual(healthData);
      expect(mockChainService.getChainHealth).toHaveBeenCalledTimes(1);
    });
  });

  /* ================================================================ */
  /*  PATCH /admin/chains/:chainId                                     */
  /* ================================================================ */

  describe('PATCH /admin/chains/:chainId (updateChain)', () => {
    it('calls updateChain with chainId, dto, and adminUserId', async () => {
      const dto = { name: 'Ethereum Updated', confirmationsRequired: 20 };
      const updated = { chainId: 1, ...dto };
      mockChainService.updateChain.mockResolvedValue(updated);

      const result = await controller.updateChain(1, dto as any, mockReq);

      expect(result).toEqual(updated);
      expect(mockChainService.updateChain).toHaveBeenCalledWith(1, dto, 'admin-1');
    });
  });

  /* ================================================================ */
  /*  DELETE /admin/chains/:chainId                                    */
  /* ================================================================ */

  describe('DELETE /admin/chains/:chainId (deleteChain)', () => {
    it('calls deleteChain with chainId and adminUserId', async () => {
      mockChainService.deleteChain.mockResolvedValue({ deleted: true });

      const result = await controller.deleteChain(1, mockReq);

      expect(result).toEqual({ deleted: true });
      expect(mockChainService.deleteChain).toHaveBeenCalledWith(1, 'admin-1');
    });
  });

  /* ================================================================ */
  /*  POST /admin/chains/:chainId/lifecycle                            */
  /* ================================================================ */

  describe('POST /admin/chains/:chainId/lifecycle (lifecycleTransition)', () => {
    it('calls lifecycleService.transition with correct arguments', async () => {
      const dto = { action: 'drain', reason: 'Scheduled maintenance' };
      const transitionResult = {
        previousStatus: 'active',
        newStatus: 'draining',
        reason: 'Scheduled maintenance',
        transitionedAt: '2026-04-23T10:00:00Z',
        warnings: [],
      };
      mockLifecycleService.transition.mockResolvedValue(transitionResult);

      const result = await controller.lifecycleTransition(1, dto as any, mockReq);

      expect(result).toEqual(transitionResult);
      expect(mockLifecycleService.transition).toHaveBeenCalledWith(
        1,
        'drain',
        'Scheduled maintenance',
        'admin-1',
      );
    });
  });
});
