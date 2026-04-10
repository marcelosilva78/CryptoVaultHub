import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ethers } from 'ethers';
import { AddressGroupService } from './address-group.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

describe('AddressGroupService', () => {
  let service: AddressGroupService;
  let prisma: any;
  let contractService: any;

  const now = new Date('2026-04-09');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressGroupService,
        {
          provide: PrismaService,
          useValue: {
            addressGroup: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            groupAddress: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: ContractService,
          useValue: {
            computeForwarderAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AddressGroupService>(AddressGroupService);
    prisma = module.get(PrismaService);
    contractService = module.get(ContractService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('computeSalt', () => {
    it('should create a group with deterministic salt', () => {
      const salt1 = service.computeSalt(10, 'my-group');
      const salt2 = service.computeSalt(10, 'my-group');

      expect(salt1).toBe(salt2);
      expect(salt1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should compute the same CREATE2 address for the same inputs', () => {
      const salt1 = service.computeSalt(10, 'deposit-pool');
      const salt2 = service.computeSalt(10, 'deposit-pool');

      expect(salt1).toBe(salt2);

      // Different inputs yield different salts
      const salt3 = service.computeSalt(10, 'different-group');
      expect(salt3).not.toBe(salt1);

      const salt4 = service.computeSalt(11, 'deposit-pool');
      expect(salt4).not.toBe(salt1);
    });
  });

  describe('createGroup', () => {
    it('should create a group successfully', async () => {
      prisma.addressGroup.findUnique.mockResolvedValue(null);
      prisma.addressGroup.create.mockResolvedValue({
        id: 1n,
        clientId: 10n,
        name: 'my-group',
        salt: service.computeSalt(10, 'my-group'),
        createdAt: now,
      });

      const result = await service.createGroup(10, 'my-group');

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.clientId).toBe(10);
      expect(result.name).toBe('my-group');
      expect(result.salt).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.addresses).toEqual([]);
    });

    it('should prevent duplicate group for same client + salt', async () => {
      prisma.addressGroup.findUnique.mockResolvedValue({
        id: 1n,
        clientId: 10n,
        name: 'my-group',
        salt: 'existing-salt',
      });

      await expect(
        service.createGroup(10, 'my-group'),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createGroup(10, 'my-group'),
      ).rejects.toThrow('Address group with same client and salt already exists');

      expect(prisma.addressGroup.create).not.toHaveBeenCalled();
    });
  });

  describe('provisionAddress', () => {
    it('should provision an address on a specific chain', async () => {
      const salt = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'string'],
          [10, 'group-1'],
        ),
      );

      prisma.addressGroup.findUnique.mockResolvedValue({
        id: 1n,
        clientId: 10n,
        name: 'group-1',
        salt,
      });

      const computedAddress = '0x1234567890abcdef1234567890abcdef12345678';
      contractService.computeForwarderAddress.mockResolvedValue(
        computedAddress,
      );
      prisma.groupAddress.create.mockResolvedValue({} as any);

      const result = await service.provisionAddress(
        1,
        1, // chainId
        '0xParentAddr',
        '0xFeeAddr',
      );

      expect(result).toBeDefined();
      expect(result.chainId).toBe(1);
      expect(result.address).toBe(computedAddress);
      expect(result.isDeployed).toBe(false);

      expect(contractService.computeForwarderAddress).toHaveBeenCalledWith(
        1,
        '0xParentAddr',
        '0xFeeAddr',
        salt,
      );

      expect(prisma.groupAddress.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          groupId: 1n,
          chainId: 1,
          address: computedAddress,
          isDeployed: false,
        }),
      });
    });

    it('should throw when group does not exist', async () => {
      prisma.addressGroup.findUnique.mockResolvedValue(null);

      await expect(
        service.provisionAddress(999, 1, '0xParent', '0xFee'),
      ).rejects.toThrow('Address group 999 not found');
    });
  });
});
