import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
              findFirst: jest.fn(),
              create: jest.fn(),
            },
            depositAddress: {
              findFirst: jest.fn(),
              create: jest.fn(),
            },
            wallet: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
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

  describe('createGroup', () => {
    it('should create a group successfully', async () => {
      prisma.addressGroup.findUnique.mockResolvedValue(null);
      prisma.wallet.findFirst.mockResolvedValue(null);
      prisma.addressGroup.create.mockResolvedValue({
        id: 1n,
        groupUid: 'ag_test123',
        clientId: 10n,
        projectId: 1n,
        externalId: null,
        label: null,
        derivationSalt: '0x' + 'ab'.repeat(32),
        computedAddress: '0x1234567890abcdef1234567890abcdef12345678',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.createGroup({
        clientId: 10,
        projectId: 1,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.clientId).toBe(10);
      expect(result.status).toBe('active');
    });

    it('should prevent duplicate group for same client + derivation salt', async () => {
      prisma.addressGroup.findUnique.mockResolvedValue({
        id: 1n,
        clientId: 10n,
        derivationSalt: 'existing-salt',
      });

      await expect(
        service.createGroup({ clientId: 10, projectId: 1 }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.addressGroup.create).not.toHaveBeenCalled();
    });
  });

  describe('provisionOnChains', () => {
    it('should provision addresses on specific chains', async () => {
      prisma.addressGroup.findFirst.mockResolvedValue({
        id: 1n,
        clientId: 10n,
        groupUid: 'ag_test',
        derivationSalt: '0x' + 'ab'.repeat(32),
        externalId: null,
        label: null,
      });

      prisma.depositAddress.findFirst.mockResolvedValue(null);

      const computedAddress = '0x1234567890abcdef1234567890abcdef12345678';
      contractService.computeForwarderAddress.mockResolvedValue(computedAddress);

      prisma.wallet.findUnique.mockImplementation((args: any) => {
        const { walletType } = args.where.uq_client_chain_type;
        if (walletType === 'hot') {
          return Promise.resolve({
            id: 10n, address: '0xHotWallet', clientId: 10n, chainId: 1, walletType: 'hot', projectId: 1n,
          });
        }
        if (walletType === 'gas_tank') {
          return Promise.resolve({
            id: 20n, address: '0xGasTank', clientId: 10n, chainId: 1, walletType: 'gas_tank',
          });
        }
        return Promise.resolve(null);
      });

      prisma.depositAddress.create.mockResolvedValue({} as any);

      const result = await service.provisionOnChains({
        clientId: 10,
        groupId: 1,
        chainIds: [1],
      });

      expect(result).toBeDefined();
      expect(result.provisions).toHaveLength(1);
      expect(result.provisions[0].chainId).toBe(1);
      expect(result.provisions[0].address).toBe(computedAddress);
      expect(result.provisions[0].status).toBe('created');

      expect(contractService.computeForwarderAddress).toHaveBeenCalledWith(
        1,
        '0xHotWallet',
        '0xGasTank',
        '0x' + 'ab'.repeat(32),
      );
    });

    it('should throw when group does not exist', async () => {
      prisma.addressGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.provisionOnChains({ clientId: 10, groupId: 999, chainIds: [1] }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
