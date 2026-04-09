import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { DepositAddressService } from './deposit-address.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

describe('DepositAddressService', () => {
  let service: DepositAddressService;
  let mockPrisma: any;
  let mockContractService: Partial<ContractService>;

  const TEST_HOT_WALLET = {
    id: BigInt(1),
    clientId: BigInt(1),
    chainId: 1,
    address: '0x1111111111111111111111111111111111111111',
    walletType: 'hot',
    isActive: true,
    createdAt: new Date(),
  };

  const TEST_GAS_TANK = {
    id: BigInt(2),
    clientId: BigInt(1),
    chainId: 1,
    address: '0x2222222222222222222222222222222222222222',
    walletType: 'gas_tank',
    isActive: true,
    createdAt: new Date(),
  };

  const EXPECTED_FORWARDER_ADDRESS =
    '0x3333333333333333333333333333333333333333';

  beforeEach(async () => {
    mockPrisma = {
      depositAddress: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((data) =>
          Promise.resolve({
            id: BigInt(1),
            ...data.data,
            createdAt: new Date(),
          }),
        ),
      },
      wallet: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.uq_client_chain_type) {
            if (where.uq_client_chain_type.walletType === 'hot') {
              return Promise.resolve(TEST_HOT_WALLET);
            }
            if (where.uq_client_chain_type.walletType === 'gas_tank') {
              return Promise.resolve(TEST_GAS_TANK);
            }
          }
          return Promise.resolve(null);
        }),
      },
    };

    mockContractService = {
      computeForwarderAddress: jest
        .fn()
        .mockResolvedValue(EXPECTED_FORWARDER_ADDRESS),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositAddressService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContractService, useValue: mockContractService },
      ],
    }).compile();

    service = module.get<DepositAddressService>(DepositAddressService);
  });

  describe('computeSalt', () => {
    it('should produce a deterministic bytes32 salt', () => {
      const salt1 = service.computeSalt(1, 1, 'user-123');
      const salt2 = service.computeSalt(1, 1, 'user-123');
      expect(salt1).toBe(salt2);
      expect(salt1).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('should produce different salts for different externalIds', () => {
      const salt1 = service.computeSalt(1, 1, 'user-123');
      const salt2 = service.computeSalt(1, 1, 'user-456');
      expect(salt1).not.toBe(salt2);
    });

    it('should produce different salts for different clientIds', () => {
      const salt1 = service.computeSalt(1, 1, 'user-123');
      const salt2 = service.computeSalt(2, 1, 'user-123');
      expect(salt1).not.toBe(salt2);
    });

    it('should produce different salts for different chainIds', () => {
      const salt1 = service.computeSalt(1, 1, 'user-123');
      const salt2 = service.computeSalt(1, 137, 'user-123');
      expect(salt1).not.toBe(salt2);
    });

    it('should use keccak256 of ABI-encoded params', () => {
      const salt = service.computeSalt(1, 1, 'user-123');
      const expected = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'uint256', 'string'],
          [1, 1, 'user-123'],
        ),
      );
      expect(salt).toBe(expected);
    });
  });

  describe('generateAddress', () => {
    it('should generate a deposit address and save to DB', async () => {
      const result = await service.generateAddress(
        1,
        1,
        'user-123',
        'Test User',
      );

      expect(result.address).toBe(EXPECTED_FORWARDER_ADDRESS);
      expect(result.externalId).toBe('user-123');
      expect(result.label).toBe('Test User');
      expect(result.isDeployed).toBe(false);
      expect(result.salt).toMatch(/^0x[0-9a-fA-F]{64}$/);

      expect(mockPrisma.depositAddress.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: BigInt(1),
          chainId: 1,
          walletId: TEST_HOT_WALLET.id,
          address: EXPECTED_FORWARDER_ADDRESS,
          externalId: 'user-123',
          label: 'Test User',
          isDeployed: false,
        }),
      });
    });

    it('should call computeForwarderAddress with correct params', async () => {
      const salt = service.computeSalt(1, 1, 'user-123');

      await service.generateAddress(1, 1, 'user-123');

      expect(
        mockContractService.computeForwarderAddress,
      ).toHaveBeenCalledWith(
        1,
        TEST_HOT_WALLET.address,
        TEST_GAS_TANK.address,
        salt,
      );
    });

    it('should throw ConflictException if address already exists', async () => {
      mockPrisma.depositAddress.findUnique.mockResolvedValueOnce({
        id: BigInt(1),
      });

      await expect(
        service.generateAddress(1, 1, 'user-123'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if hot wallet not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      await expect(
        service.generateAddress(1, 1, 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set label to null when not provided', async () => {
      const result = await service.generateAddress(1, 1, 'user-123');
      expect(result.label).toBeNull();
    });
  });

  describe('generateBatch', () => {
    it('should generate multiple addresses', async () => {
      const items = [
        { externalId: 'user-1', label: 'User 1' },
        { externalId: 'user-2', label: 'User 2' },
        { externalId: 'user-3' },
      ];

      const results = await service.generateBatch(1, 1, items);

      expect(results).toHaveLength(3);
      expect(results[0].externalId).toBe('user-1');
      expect(results[1].externalId).toBe('user-2');
      expect(results[2].externalId).toBe('user-3');
      expect(results[2].label).toBeNull();
    });
  });
});
