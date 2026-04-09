import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  let controller: WalletController;
  let service: WalletService;

  const mockService = {
    listWallets: jest.fn(),
    getBalances: jest.fn(),
  };

  const mockReq = {
    clientId: 42,
    scopes: ['read'],
    headers: {},
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: WalletService, useValue: mockService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
    service = module.get<WalletService>(WalletService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listWallets', () => {
    it('should return wallets for the authenticated client', async () => {
      const mockWallets = [
        { id: '1', chainId: 1, balance: '1.5' },
        { id: '2', chainId: 137, balance: '100.0' },
      ];

      mockService.listWallets.mockResolvedValueOnce(mockWallets);

      const result = await controller.listWallets(mockReq);

      expect(result).toEqual({ success: true, wallets: mockWallets });
      expect(mockService.listWallets).toHaveBeenCalledWith(42);
    });
  });

  describe('getBalances', () => {
    it('should return balances for a specific chain', async () => {
      const mockBalances = [
        { token: 'ETH', balance: '1.5', usdValue: '2700' },
        { token: 'USDC', balance: '1000.0', usdValue: '1000' },
      ];

      mockService.getBalances.mockResolvedValueOnce(mockBalances);

      const result = await controller.getBalances(1, mockReq);

      expect(result).toEqual({ success: true, balances: mockBalances });
      expect(mockService.getBalances).toHaveBeenCalledWith(42, 1);
    });
  });
});
