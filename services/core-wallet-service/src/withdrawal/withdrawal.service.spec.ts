import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { NonceService } from '../blockchain/nonce.service';
import { ComplianceService } from '../compliance/compliance.service';

describe('WithdrawalService', () => {
  let service: WithdrawalService;
  let mockPrisma: any;
  let mockContractService: any;
  let mockNonceService: any;
  let mockComplianceService: any;

  const baseParams = {
    clientId: 1,
    chainId: 137,
    tokenId: 1,
    toAddressId: 10,
    amount: '1.5',
    idempotencyKey: 'unique-key-123',
  };

  const mockWhitelisted = {
    id: BigInt(10),
    clientId: BigInt(1),
    chainId: 137,
    address: '0xRecipientAddress',
    label: 'Test Wallet',
    status: 'active',
  };

  const mockToken = {
    id: BigInt(1),
    chainId: 137,
    symbol: 'USDC',
    decimals: 6,
    isActive: true,
    isNative: false,
    contractAddress: '0xUSDCContract',
  };

  const mockHotWallet = {
    address: '0xHotWalletAddress',
  };

  const mockWithdrawalRecord = {
    id: BigInt(1),
    clientId: BigInt(1),
    chainId: 137,
    tokenId: BigInt(1),
    fromWallet: '0xHotWalletAddress',
    toAddressId: BigInt(10),
    toAddress: '0xRecipientAddress',
    toLabel: 'Test Wallet',
    amount: '1.5',
    amountRaw: '1500000',
    txHash: null,
    status: 'pending_approval',
    sequenceId: null,
    gasCost: null,
    kytResult: null,
    idempotencyKey: 'unique-key-123',
    createdAt: new Date(),
    submittedAt: null,
    confirmedAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      withdrawal: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockWithdrawalRecord),
        update: jest.fn(),
      },
      whitelistedAddress: {
        findFirst: jest.fn().mockResolvedValue(mockWhitelisted),
      },
      token: {
        findUnique: jest.fn().mockResolvedValue(mockToken),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue(mockHotWallet),
      },
    };

    mockContractService = {
      getNativeBalance: jest.fn().mockResolvedValue(BigInt('10000000000000000000')),
      getERC20Balance: jest.fn().mockResolvedValue(BigInt('100000000')), // 100 USDC
    };

    mockNonceService = {};

    mockComplianceService = {
      screenWithdrawal: jest.fn().mockResolvedValue({
        result: 'clear',
        action: 'allowed',
        listsChecked: ['OFAC_SDN'],
        matchDetails: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContractService, useValue: mockContractService },
        { provide: NonceService, useValue: mockNonceService },
        { provide: ComplianceService, useValue: mockComplianceService },
      ],
    }).compile();

    service = module.get<WithdrawalService>(WithdrawalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWithdrawal', () => {
    it('should reject negative amounts', async () => {
      // ethers.parseUnits will parse '-1.0' but result will be <= 0n
      await expect(
        service.createWithdrawal({ ...baseParams, amount: '-1.0' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-numeric amounts', async () => {
      // ethers.parseUnits throws on non-numeric strings
      await expect(
        service.createWithdrawal({ ...baseParams, amount: 'not-a-number' }),
      ).rejects.toThrow();
    });

    it('should throw ServiceUnavailableException on RPC balance check failure', async () => {
      mockContractService.getERC20Balance.mockRejectedValue(
        new Error('RPC connection timeout'),
      );

      await expect(
        service.createWithdrawal(baseParams),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should reject when balance is insufficient', async () => {
      // Set balance to less than requested amount (1.5 USDC = 1500000 units)
      mockContractService.getERC20Balance.mockResolvedValue(BigInt('500000')); // 0.5 USDC

      await expect(
        service.createWithdrawal(baseParams),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createWithdrawal(baseParams),
      ).rejects.toThrow('Insufficient balance');
    });

    it('should create withdrawal with valid data and passing balance check', async () => {
      const result = await service.createWithdrawal(baseParams);

      expect(result.isIdempotent).toBe(false);
      expect(result.withdrawal).toHaveProperty('id');
      expect(result.withdrawal.status).toBe('pending_approval');
      expect(result.withdrawal.amount).toBe('1.5');

      // Verify the withdrawal was created in the database
      expect(mockPrisma.withdrawal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: BigInt(1),
            chainId: 137,
            status: 'pending_approval',
            amount: '1.5',
          }),
        }),
      );
    });

    it('should call compliance screening before creating', async () => {
      await service.createWithdrawal(baseParams);

      expect(mockComplianceService.screenWithdrawal).toHaveBeenCalledWith({
        clientId: 1,
        toAddress: '0xRecipientAddress',
      });

      // Compliance should be called before the withdrawal create
      const screeningCallOrder =
        mockComplianceService.screenWithdrawal.mock.invocationCallOrder[0];
      const createCallOrder =
        mockPrisma.withdrawal.create.mock.invocationCallOrder[0];
      expect(screeningCallOrder).toBeLessThan(createCallOrder);
    });
  });

  describe('approveWithdrawal', () => {
    it('should transition pending_approval to approved', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        ...mockWithdrawalRecord,
        status: 'pending_approval',
      });

      const updatedRecord = {
        ...mockWithdrawalRecord,
        status: 'approved',
      };
      mockPrisma.withdrawal.update.mockResolvedValue(updatedRecord);

      const result = await service.approveWithdrawal(1);

      expect(result.withdrawal.status).toBe('approved');
      expect(mockPrisma.withdrawal.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { status: 'approved' },
      });
    });

    it('should reject transition from non-pending_approval status', async () => {
      const statuses = ['approved', 'submitted', 'confirmed', 'cancelled', 'rejected'];

      for (const status of statuses) {
        mockPrisma.withdrawal.findUnique.mockResolvedValue({
          ...mockWithdrawalRecord,
          status,
        });

        await expect(
          service.approveWithdrawal(1),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('cancelWithdrawal', () => {
    it('should work for pending_approval and approved statuses', async () => {
      for (const status of ['pending_approval', 'approved']) {
        mockPrisma.withdrawal.findUnique.mockResolvedValue({
          ...mockWithdrawalRecord,
          status,
        });
        mockPrisma.withdrawal.update.mockResolvedValue({
          ...mockWithdrawalRecord,
          status: 'cancelled',
        });

        const result = await service.cancelWithdrawal(1);
        expect(result.withdrawal.status).toBe('cancelled');
      }
    });

    it('should reject cancellation for non-cancellable statuses', async () => {
      const nonCancellable = ['submitted', 'confirmed', 'cancelled', 'rejected'];

      for (const status of nonCancellable) {
        mockPrisma.withdrawal.findUnique.mockResolvedValue({
          ...mockWithdrawalRecord,
          status,
        });

        await expect(
          service.cancelWithdrawal(1),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('should throw NotFoundException for non-existent withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelWithdrawal(999),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
