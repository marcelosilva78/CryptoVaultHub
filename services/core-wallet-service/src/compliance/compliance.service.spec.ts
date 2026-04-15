import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { POSTHOG_SERVICE } from '@cvh/posthog';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let mockPrisma: any;

  const ACTIVE_CLIENT_FULL = {
    id: BigInt(1),
    name: 'Full KYT Client',
    slug: 'full-kyt',
    status: 'active',
    tierId: BigInt(1),
    custodyMode: 'full_custody',
    kytEnabled: true,
    kytLevel: 'full',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const ACTIVE_CLIENT_BASIC = {
    ...ACTIVE_CLIENT_FULL,
    id: BigInt(2),
    name: 'Basic KYT Client',
    slug: 'basic-kyt',
    kytLevel: 'basic',
  };

  const ACTIVE_CLIENT_OFF = {
    ...ACTIVE_CLIENT_FULL,
    id: BigInt(3),
    name: 'No KYT Client',
    slug: 'no-kyt',
    kytEnabled: false,
    kytLevel: 'off',
  };

  const ACTIVE_CLIENT_ENHANCED = {
    ...ACTIVE_CLIENT_FULL,
    id: BigInt(4),
    name: 'Enhanced KYT Client',
    slug: 'enhanced-kyt',
    kytLevel: 'enhanced',
  };

  const OFAC_SANCTIONS_ENTRY = {
    id: BigInt(1),
    listSource: 'OFAC_SDN',
    address: '0xbadaddress0000000000000000000000000000001',
    addressType: 'ETH',
    entityName: 'Bad Actor LLC',
    entityId: 'SDN-12345',
    isActive: true,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
  };

  const EU_SANCTIONS_ENTRY = {
    id: BigInt(2),
    listSource: 'EU',
    address: '0xbadaddress0000000000000000000000000000001',
    addressType: 'ETH',
    entityName: 'Bad Actor LLC',
    entityId: 'EU-67890',
    isActive: true,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue(ACTIVE_CLIENT_FULL),
      },
      sanctionsEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      screeningResult: {
        create: jest.fn().mockImplementation((data) =>
          Promise.resolve({
            id: BigInt(1),
            ...data.data,
            screenedAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      complianceAlert: {
        create: jest.fn().mockImplementation((data) =>
          Promise.resolve({
            id: BigInt(1),
            ...data.data,
            createdAt: new Date(),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            clientId: BigInt(1),
            severity: 'critical',
            alertType: 'sanctions_deposit_inbound',
            address: '0xabc',
            matchedEntity: null,
            matchedList: null,
            amount: null,
            tokenSymbol: null,
            ...data,
            createdAt: new Date(),
          }),
        ),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: POSTHOG_SERVICE, useValue: null },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
  });

  describe('screenWithdrawal', () => {
    it('should return clear when no sanctions match', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_BASIC);
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([]);

      const result = await service.screenWithdrawal({
        clientId: 2,
        toAddress: '0xCleanAddress',
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');
      expect(result.matchDetails).toBeNull();
    });

    it('should return hit when address matches sanctions list', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_BASIC);
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([
        OFAC_SANCTIONS_ENTRY,
      ]);

      const result = await service.screenWithdrawal({
        clientId: 2,
        toAddress: '0xBADaddress0000000000000000000000000000001',
      });

      expect(result.result).toBe('hit');
      expect(result.action).toBe('blocked');
      expect(result.matchDetails).not.toBeNull();
      expect(result.matchDetails).toHaveLength(1);
      expect(result.matchDetails![0].listSource).toBe('OFAC_SDN');
      expect(result.matchDetails![0].entityName).toBe('Bad Actor LLC');
    });

    it('should throw NotFoundException when client not found (fail-closed)', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.screenWithdrawal({
          clientId: 999,
          toAddress: '0xAnyAddress',
        }),
      ).rejects.toThrow(NotFoundException);

      // Reset mock for second assertion
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.screenWithdrawal({
          clientId: 999,
          toAddress: '0xAnyAddress',
        }),
      ).rejects.toThrow('Client 999 not found');
    });

    it('should skip screening when KYT level is off', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_OFF);

      const result = await service.screenWithdrawal({
        clientId: 3,
        toAddress: '0xAnyAddress',
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');
      expect(result.listsChecked).toEqual([]);

      // Should NOT check sanctions entries
      expect(mockPrisma.sanctionsEntry.findMany).not.toHaveBeenCalled();

      // Should still save the screening result for audit trail
      expect(mockPrisma.screeningResult.create).toHaveBeenCalled();
    });

    it('should check only OFAC_SDN for basic level', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_BASIC);
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([]);

      const result = await service.screenWithdrawal({
        clientId: 2,
        toAddress: '0xSomeAddress',
      });

      expect(result.listsChecked).toEqual(['OFAC_SDN']);

      // Verify sanctions query was scoped to only OFAC_SDN
      expect(mockPrisma.sanctionsEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listSource: { in: ['OFAC_SDN'] },
          }),
        }),
      );
    });

    it('should run N-hop trace for full level', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_FULL);
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([]);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.screenWithdrawal({
        clientId: 1,
        toAddress: '0xCleanAddress',
      });

      expect(result.result).toBe('clear');

      // Verify the full sanctions list was used
      expect(result.listsChecked).toEqual([
        'OFAC_SDN',
        'OFAC_CONSOLIDATED',
        'EU',
        'UN',
        'UK_OFSI',
      ]);

      // Verify the N-hop tracing raw query was executed
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should return possible_match when N-hop trace finds flagged counterparties', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_FULL);

      // Base screening: clean (no direct match)
      // Then hop tracing finds a sanctioned counterparty
      mockPrisma.sanctionsEntry.findMany
        .mockResolvedValueOnce([]) // screenAddress: direct check
        .mockResolvedValueOnce([ // traceAddressHops: counterparty check
          {
            listSource: 'OFAC_SDN',
            entityName: 'Laundering Network',
            entityId: 'SDN-99999',
            address: '0xcounterparty',
            isActive: true,
          },
        ]);

      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          from_address: '0xcleanaddress',
          to_address: '0xcounterparty',
        },
      ]);

      const result = await service.screenWithdrawal({
        clientId: 1,
        toAddress: '0xCleanAddress',
      });

      expect(result.result).toBe('possible_match');
      expect(result.action).toBe('review');
    });
  });

  describe('screenDeposit', () => {
    it('should screen source address post-deposit', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_BASIC);
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([]);

      const result = await service.screenDeposit({
        clientId: 2,
        fromAddress: '0xDepositorAddress',
        txHash: '0xTxHash123',
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');

      // Should save screening result with deposit trigger and inbound direction
      expect(mockPrisma.screeningResult.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: 'inbound',
            trigger: 'deposit',
            txHash: '0xTxHash123',
          }),
        }),
      );
    });

    it('should return possible_match when N-hop trace flags counterparties (full level)', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_FULL);

      // Base screening: clean
      mockPrisma.sanctionsEntry.findMany
        .mockResolvedValueOnce([]) // screenAddress: direct check
        .mockResolvedValueOnce([ // traceAddressHops: counterparty flagged
          {
            listSource: 'OFAC_SDN',
            entityName: 'Dark Market',
            entityId: 'SDN-88888',
            address: '0xflaggedcounterparty',
            isActive: true,
          },
        ]);

      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          from_address: '0xdepositoraddress',
          to_address: '0xflaggedcounterparty',
        },
      ]);

      const result = await service.screenDeposit({
        clientId: 1,
        fromAddress: '0xDepositorAddress',
        txHash: '0xTxHash456',
      });

      expect(result.result).toBe('possible_match');
      expect(result.action).toBe('review');
    });
  });

  describe('screenAddress', () => {
    it('should return clear when address is not sanctioned', async () => {
      const result = await service.screenAddress({
        address: '0xcleanaddress000000000000000000000000001',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 1,
        txHash: '0xtx123',
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');
      expect(result.matchDetails).toBeNull();
    });

    it('should return hit when address matches OFAC sanctions', async () => {
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([
        OFAC_SANCTIONS_ENTRY,
      ]);

      const result = await service.screenAddress({
        address: '0xBADaddress0000000000000000000000000000001',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 1,
        txHash: '0xtx123',
      });

      expect(result.result).toBe('hit');
      expect(result.action).toBe('blocked');
      expect(result.matchDetails).toHaveLength(1);
      expect(result.matchDetails![0].listSource).toBe('OFAC_SDN');
      expect(result.matchDetails![0].entityName).toBe('Bad Actor LLC');
    });

    it('should check all lists when kytLevel is full', async () => {
      await service.screenAddress({
        address: '0xsomeaddress',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 1,
      });

      expect(mockPrisma.sanctionsEntry.findMany).toHaveBeenCalledWith({
        where: {
          address: '0xsomeaddress',
          listSource: {
            in: ['OFAC_SDN', 'OFAC_CONSOLIDATED', 'EU', 'UN', 'UK_OFSI'],
          },
          isActive: true,
        },
      });
    });

    it('should check only OFAC when kytLevel is basic', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_BASIC);

      await service.screenAddress({
        address: '0xsomeaddress',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 2,
      });

      expect(mockPrisma.sanctionsEntry.findMany).toHaveBeenCalledWith({
        where: {
          address: '0xsomeaddress',
          listSource: { in: ['OFAC_SDN'] },
          isActive: true,
        },
      });
    });

    it('should skip screening when kytLevel is off', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(ACTIVE_CLIENT_OFF);

      const result = await service.screenAddress({
        address: '0xsomeaddress',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 3,
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');
      expect(result.listsChecked).toEqual([]);
      expect(mockPrisma.sanctionsEntry.findMany).not.toHaveBeenCalled();
    });

    it('should normalize address to lowercase for comparison', async () => {
      await service.screenAddress({
        address: '0xABCDEF1234567890000000000000000000000001',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 1,
      });

      expect(mockPrisma.sanctionsEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            address: '0xabcdef1234567890000000000000000000000001',
          }),
        }),
      );
    });

    it('should create an alert when a sanctions hit is found', async () => {
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([
        OFAC_SANCTIONS_ENTRY,
      ]);

      await service.screenAddress({
        address: '0xbadaddress0000000000000000000000000000001',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 1,
      });

      expect(mockPrisma.complianceAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: BigInt(1),
          severity: 'critical',
          alertType: 'sanctions_deposit_inbound',
          address: '0xbadaddress0000000000000000000000000000001',
          matchedEntity: 'Bad Actor LLC',
          matchedList: 'OFAC_SDN',
          status: 'open',
        }),
      });
    });

    it('should not create an alert when address is clear', async () => {
      await service.screenAddress({
        address: '0xcleanaddress',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 1,
      });

      expect(mockPrisma.complianceAlert.create).not.toHaveBeenCalled();
    });

    it('should save screening result to database', async () => {
      await service.screenAddress({
        address: '0xsomeaddress',
        direction: 'outbound',
        trigger: 'withdrawal',
        clientId: 1,
        txHash: '0xtx456',
      });

      expect(mockPrisma.screeningResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: BigInt(1),
          address: '0xsomeaddress',
          direction: 'outbound',
          trigger: 'withdrawal',
          txHash: '0xtx456',
          result: 'clear',
          action: 'allowed',
        }),
      });
    });

    it('should handle multiple sanctions list matches', async () => {
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([
        OFAC_SANCTIONS_ENTRY,
        EU_SANCTIONS_ENTRY,
      ]);

      const result = await service.screenAddress({
        address: '0xbadaddress0000000000000000000000000000001',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 1,
      });

      expect(result.result).toBe('hit');
      expect(result.matchDetails).toHaveLength(2);
      expect(result.matchDetails![0].listSource).toBe('OFAC_SDN');
      expect(result.matchDetails![1].listSource).toBe('EU');
    });

    it('should throw NotFoundException when client not found (fail-closed)', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.screenAddress({
          address: '0xsomeaddress',
          direction: 'inbound',
          trigger: 'deposit',
          clientId: 999,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAlerts', () => {
    it('should pass filters correctly', async () => {
      await service.listAlerts({
        clientId: 1,
        status: 'open',
        severity: 'critical',
      });

      expect(mockPrisma.complianceAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clientId: BigInt(1),
            status: 'open',
            severity: 'critical',
          },
        }),
      );
    });

    it('should omit undefined filters', async () => {
      await service.listAlerts({});

      expect(mockPrisma.complianceAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  describe('updateAlert', () => {
    it('should set resolvedAt when status is resolved', async () => {
      await service.updateAlert(1, {
        status: 'resolved',
        resolvedBy: 'admin@example.com',
      });

      expect(mockPrisma.complianceAlert.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
          resolvedBy: 'admin@example.com',
        }),
      });
    });

    it('should set resolvedAt when status is false_positive', async () => {
      await service.updateAlert(1, { status: 'false_positive' });

      expect(mockPrisma.complianceAlert.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: expect.objectContaining({
          status: 'false_positive',
          resolvedAt: expect.any(Date),
        }),
      });
    });

    it('should not set resolvedAt when status is investigating', async () => {
      await service.updateAlert(1, { status: 'investigating' });

      const updateData =
        mockPrisma.complianceAlert.update.mock.calls[0][0].data;
      expect(updateData.status).toBe('investigating');
      expect(updateData.resolvedAt).toBeUndefined();
    });
  });

  describe('listScreenings', () => {
    it('should normalize address filter to lowercase', async () => {
      await service.listScreenings({
        address: '0xABCDEF',
      });

      expect(mockPrisma.screeningResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            address: '0xabcdef',
          }),
        }),
      );
    });

    it('should pass result filter correctly', async () => {
      await service.listScreenings({
        clientId: 1,
        result: 'hit',
      });

      expect(mockPrisma.screeningResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clientId: BigInt(1),
            result: 'hit',
          },
        }),
      );
    });
  });
});
