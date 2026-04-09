import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiKeyService } from './api-key.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      apiKey: {
        create: jest.fn().mockImplementation((args: any) => ({
          id: BigInt(1),
          ...args.data,
          usageCount: BigInt(0),
          createdAt: new Date(),
        })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createApiKey', () => {
    it('should generate a key with cvh_live_ prefix', async () => {
      const result = await service.createApiKey(1);

      expect(result.key).toMatch(/^cvh_live_/);
      expect(result.prefix).toMatch(/^cvh_live_/);
      expect(result.clientId).toBe(1);
      expect(result.scopes).toEqual(['read']);
    });

    it('should generate unique keys on each call', async () => {
      const result1 = await service.createApiKey(1);
      const result2 = await service.createApiKey(1);

      expect(result1.key).not.toBe(result2.key);
    });

    it('should store the SHA-256 hash, not the raw key', async () => {
      const result = await service.createApiKey(1);
      const expectedHash = createHash('sha256')
        .update(result.key)
        .digest('hex');

      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            keyHash: expectedHash,
          }),
        }),
      );
    });

    it('should accept custom scopes', async () => {
      const result = await service.createApiKey(1, [
        'read',
        'write',
        'transfer',
      ]);
      expect(result.scopes).toEqual(['read', 'write', 'transfer']);
    });

    it('should accept options like label and expiry', async () => {
      const result = await service.createApiKey(1, ['read'], {
        label: 'Test Key',
        expiresAt: '2025-12-31T23:59:59Z',
      });
      expect(result.label).toBe('Test Key');
    });
  });

  describe('revokeApiKey', () => {
    it('should set isActive to false and set revokedAt', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: BigInt(1),
        keyPrefix: 'cvh_live_test',
        isActive: true,
      });

      await service.revokeApiKey(1);

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: {
          isActive: false,
          revokedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException for non-existent key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.revokeApiKey(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateApiKey', () => {
    it('should return valid=true for active key', async () => {
      const rawKey = 'cvh_live_testkey123';
      const hash = createHash('sha256').update(rawKey).digest('hex');

      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: BigInt(1),
        clientId: BigInt(100),
        keyPrefix: 'cvh_live_t',
        keyHash: hash,
        scopes: ['read', 'write'],
        ipAllowlist: null,
        allowedChains: null,
        isActive: true,
        expiresAt: null,
      });

      const result = await service.validateApiKey(rawKey);

      expect(result.valid).toBe(true);
      expect(result.clientId).toBe(100);
      expect(result.scopes).toEqual(['read', 'write']);
    });

    it('should return valid=false for non-existent key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      const result = await service.validateApiKey('invalid-key');
      expect(result.valid).toBe(false);
    });

    it('should return valid=false for revoked key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: BigInt(1),
        isActive: false,
      });

      const result = await service.validateApiKey('some-key');
      expect(result.valid).toBe(false);
    });

    it('should return valid=false for expired key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: BigInt(1),
        clientId: BigInt(100),
        isActive: true,
        expiresAt: new Date('2020-01-01'), // expired
        ipAllowlist: null,
      });

      const result = await service.validateApiKey('some-key');
      expect(result.valid).toBe(false);
    });

    it('should reject key when IP not in allowlist', async () => {
      const rawKey = 'cvh_live_testkey123';
      const hash = createHash('sha256').update(rawKey).digest('hex');

      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: BigInt(1),
        clientId: BigInt(100),
        keyPrefix: 'cvh_live_t',
        keyHash: hash,
        scopes: ['read'],
        ipAllowlist: ['10.0.0.1', '10.0.0.2'],
        allowedChains: null,
        isActive: true,
        expiresAt: null,
      });

      const result = await service.validateApiKey(rawKey, '192.168.1.1');
      expect(result.valid).toBe(false);
    });

    it('should accept key when IP is in allowlist', async () => {
      const rawKey = 'cvh_live_testkey123';
      const hash = createHash('sha256').update(rawKey).digest('hex');

      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: BigInt(1),
        clientId: BigInt(100),
        keyPrefix: 'cvh_live_t',
        keyHash: hash,
        scopes: ['read'],
        ipAllowlist: ['10.0.0.1', '192.168.1.1'],
        allowedChains: null,
        isActive: true,
        expiresAt: null,
      });

      const result = await service.validateApiKey(rawKey, '192.168.1.1');
      expect(result.valid).toBe(true);
    });
  });
});
