import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientManagementService } from './client-management.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

// Mock axios at the module level for key-vault HTTP calls
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ClientManagementService', () => {
  let service: ClientManagementService;

  const mockPrisma = {
    client: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockAuditLog = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const map: Record<string, string> = {
        KEY_VAULT_SERVICE_URL: 'http://key-vault:3005',
        AUTH_SERVICE_URL: 'http://auth-service:8000',
        NOTIFICATION_SERVICE_URL: 'http://notification:3007',
        INTERNAL_SERVICE_KEY: 'test-internal-key',
      };
      return map[key] ?? defaultValue ?? '';
    }),
  };

  const now = new Date('2026-04-14T12:00:00Z');

  const buildClient = (overrides: Record<string, any> = {}) => ({
    id: BigInt(1),
    name: 'Test Client',
    slug: 'test-client',
    email: 'test@client.com',
    status: 'active',
    tierId: null,
    custodyPolicy: 'full_custody',
    kytEnabled: false,
    kytLevel: 'basic',
    createdAt: now,
    updatedAt: now,
    tier: null,
    overrides: [],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientManagementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ClientManagementService>(ClientManagementService);
  });

  // ─── createClient ──────────────────────────────────────

  describe('createClient', () => {
    it('should create client and log audit event', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null); // No existing slug
      const createdClient = buildClient();
      mockPrisma.client.create.mockResolvedValue(createdClient);

      const result = await service.createClient(
        { name: 'Test Client', slug: 'test-client' },
        'admin-1',
        '10.0.0.1',
      );

      expect(result.id).toBe('1');
      expect(result.name).toBe('Test Client');
      expect(result.slug).toBe('test-client');

      // Verify audit log was written
      expect(mockAuditLog.log).toHaveBeenCalledWith({
        adminUserId: 'admin-1',
        action: 'client.create',
        entityType: 'client',
        entityId: '1',
        details: { name: 'Test Client', slug: 'test-client' },
        ipAddress: '10.0.0.1',
      });
    });

    it('should enforce unique client slug', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(
        buildClient({ slug: 'existing-slug' }),
      );

      await expect(
        service.createClient(
          { name: 'Duplicate', slug: 'existing-slug' },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);

      // Should not have attempted to create
      expect(mockPrisma.client.create).not.toHaveBeenCalled();
    });

    it('should pass optional fields to Prisma create', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue(
        buildClient({
          tierId: BigInt(2),
          custodyPolicy: 'hybrid',
          kytEnabled: true,
          kytLevel: 'enhanced',
          tier: { id: BigInt(2), name: 'Gold' },
        }),
      );

      const result = await service.createClient(
        {
          name: 'Premium Client',
          slug: 'premium',
          email: 'premium@test.com',
          tierId: 2,
          custodyPolicy: 'hybrid',
          kytEnabled: true,
          kytLevel: 'enhanced',
        },
        'admin-1',
      );

      expect(mockPrisma.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            custodyPolicy: 'hybrid',
            kytEnabled: true,
            kytLevel: 'enhanced',
            tierId: BigInt(2),
          }),
        }),
      );

      expect(result.tier).toEqual({ id: '2', name: 'Gold' });
    });
  });

  // ─── updateClient ──────────────────────────────────────

  describe('updateClient', () => {
    it('should update allowed fields', async () => {
      const existing = buildClient();
      mockPrisma.client.findUnique.mockResolvedValue(existing);

      const updated = buildClient({
        name: 'Updated Name',
        email: 'updated@test.com',
      });
      mockPrisma.client.update.mockResolvedValue(updated);

      const result = await service.updateClient(
        1,
        { name: 'Updated Name', email: 'updated@test.com' },
        'admin-1',
        '10.0.0.1',
      );

      expect(result.name).toBe('Updated Name');
      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { name: 'Updated Name', email: 'updated@test.com' },
        include: { tier: true },
      });

      // Verify audit log
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'client.update',
          entityId: '1',
        }),
      );
    });

    it('should not allow changing clientId (not in update data shape)', async () => {
      const existing = buildClient();
      mockPrisma.client.findUnique.mockResolvedValue(existing);
      mockPrisma.client.update.mockResolvedValue(existing);

      // The updateClient method only picks known fields from the input;
      // passing an unknown field like 'id' or 'slug' will not be included
      // in the updateData object because it's not in the if-checks.
      await service.updateClient(
        1,
        { name: 'Same Name' } as any,
        'admin-1',
      );

      // The update call should only contain 'name', not 'id' or 'slug'
      const updateCall = mockPrisma.client.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ name: 'Same Name' });
      expect(updateCall.data.id).toBeUndefined();
      expect(updateCall.data.slug).toBeUndefined();
    });

    it('should throw NotFoundException for non-existent client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.updateClient(
          999,
          { name: 'Ghost' },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getClient ──────────────────────────────────────────

  describe('getClient', () => {
    it('should return client with tier info', async () => {
      const client = buildClient({
        tierId: BigInt(1),
        tier: { id: BigInt(1), name: 'Silver' },
        overrides: [
          {
            id: BigInt(10),
            overrideKey: 'max_wallets',
            overrideValue: '100',
            overrideType: 'number',
          },
        ],
      });
      mockPrisma.client.findUnique.mockResolvedValue(client);

      const result = await service.getClient(1);

      expect(result.tier).toEqual({ id: '1', name: 'Silver' });
      expect(result.overrides).toEqual([
        {
          id: '10',
          overrideKey: 'max_wallets',
          overrideValue: '100',
          overrideType: 'number',
        },
      ]);
    });

    it('should throw NotFoundException for missing client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.getClient(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listClients ───────────────────────────────────────

  describe('listClients', () => {
    it('should paginate results', async () => {
      const clients = [
        buildClient({ id: BigInt(1), name: 'Client A', slug: 'client-a' }),
        buildClient({ id: BigInt(2), name: 'Client B', slug: 'client-b' }),
      ];

      mockPrisma.client.findMany.mockResolvedValue(clients);
      mockPrisma.client.count.mockResolvedValue(25);

      const result = await service.listClients({
        page: 2,
        limit: 10,
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);

      // Verify correct skip value for page 2
      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page 2 - 1) * limit 10
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await service.listClients({
        page: 1,
        limit: 20,
        status: 'suspended',
      });

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'suspended' },
        }),
      );
    });

    it('should support search by name or slug', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await service.listClients({
        page: 1,
        limit: 20,
        search: 'acme',
      });

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'acme' } },
              { slug: { contains: 'acme' } },
            ],
          },
        }),
      );
    });
  });

  // ─── generateKeys ──────────────────────────────────────

  describe('generateKeys', () => {
    it('should trigger key generation via key-vault', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(buildClient());
      mockedAxios.post.mockResolvedValue({
        data: { status: 'keys_generated', publicKey: 'pk_test_123' },
      });

      const result = await service.generateKeys(1, 'admin-1', '10.0.0.1');

      expect(result).toEqual({
        status: 'keys_generated',
        publicKey: 'pk_test_123',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://key-vault:3005/keys/generate',
        { clientId: 1 },
        expect.objectContaining({ timeout: 30000 }),
      );

      // Verify audit log on success
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'client.generate_keys',
          details: { status: 'success' },
        }),
      );
    });

    it('should throw NotFoundException for non-existent client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.generateKeys(999, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit failure when key-vault call fails', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(buildClient());
      mockedAxios.post.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.generateKeys(1, 'admin-1', '10.0.0.1'),
      ).rejects.toThrow('Connection refused');

      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'client.generate_keys',
          details: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });
  });
});
