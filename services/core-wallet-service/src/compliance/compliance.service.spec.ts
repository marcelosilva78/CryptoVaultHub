import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';

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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
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
          listSource: { in: ['OFAC_SDN', 'EU', 'UN', 'UK_OFSI'] },
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

    it('should handle missing client gracefully', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      const result = await service.screenAddress({
        address: '0xsomeaddress',
        direction: 'inbound',
        trigger: 'deposit',
        clientId: 999,
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');
      expect(mockPrisma.sanctionsEntry.findMany).not.toHaveBeenCalled();
    });
  });

  describe('screenDeposit', () => {
    it('should screen the from address as inbound deposit', async () => {
      const result = await service.screenDeposit({
        clientId: 1,
        fromAddress: '0xsender123',
        txHash: '0xtxhash',
      });

      expect(result.result).toBe('clear');
      expect(mockPrisma.sanctionsEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            address: '0xsender123',
          }),
        }),
      );
    });
  });

  describe('screenWithdrawal', () => {
    it('should screen the to address as outbound withdrawal', async () => {
      const result = await service.screenWithdrawal({
        clientId: 1,
        toAddress: '0xrecipient456',
      });

      expect(result.result).toBe('clear');
      expect(mockPrisma.screeningResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          direction: 'outbound',
          trigger: 'withdrawal',
        }),
      });
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
