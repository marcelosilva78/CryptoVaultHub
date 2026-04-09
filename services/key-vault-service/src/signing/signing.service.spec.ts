import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { SigningService } from './signing.service';
import { KeyGenerationService } from '../key-generation/key-generation.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SigningService', () => {
  let signingService: SigningService;
  let mockKeyGenService: Partial<KeyGenerationService>;
  let mockPrisma: any;
  let mockAudit: Partial<AuditService>;

  // Generate a test wallet for consistent testing
  const testWallet = ethers.Wallet.createRandom();
  const testPrivateKeyBuf = Buffer.from(
    testWallet.privateKey.slice(2),
    'hex',
  );
  const testAddress = testWallet.address;

  beforeEach(async () => {
    mockPrisma = {
      derivedKey: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockKeyGenService = {
      decryptPrivateKey: jest.fn().mockResolvedValue({
        privateKey: Buffer.from(testPrivateKeyBuf), // Copy so fill(0) doesn't affect our reference
        address: testAddress,
        keyId: BigInt(1),
      }),
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SigningService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KeyGenerationService, useValue: mockKeyGenService },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    signingService = module.get<SigningService>(SigningService);
  });

  describe('signHash', () => {
    it('should sign a hash and return valid signature components', async () => {
      const hash = ethers.hashMessage('test message');

      const result = await signingService.signHash(
        1,
        hash,
        'platform',
        'test',
      );

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('v');
      expect(result).toHaveProperty('r');
      expect(result).toHaveProperty('s');
      expect(result).toHaveProperty('address');
      expect(result.address).toBe(testAddress);

      // Verify signature length (65 bytes = 130 hex chars + 0x prefix)
      expect(result.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
    });

    it('should produce a recoverable signature', async () => {
      const message = 'test message for recovery';
      const hash = ethers.hashMessage(message);

      const result = await signingService.signHash(
        1,
        hash,
        'platform',
        'test',
      );

      // Recover the signer address from the signature
      const recoveredAddress = ethers.recoverAddress(hash, {
        r: result.r,
        s: result.s,
        v: result.v,
      });

      expect(recoveredAddress.toLowerCase()).toBe(
        testAddress.toLowerCase(),
      );
    });

    it('should update usage stats after signing', async () => {
      const hash = ethers.hashMessage('test');

      await signingService.signHash(1, hash, 'platform', 'test');

      expect(mockPrisma.derivedKey.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: {
          lastUsedAt: expect.any(Date),
          signCount: { increment: 1 },
        },
      });
    });

    it('should log an audit entry', async () => {
      const hash = ethers.hashMessage('test');

      await signingService.signHash(1, hash, 'platform', 'tester');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'sign_hash',
          clientId: 1,
          keyType: 'platform',
          requestedBy: 'tester',
        }),
      );
    });

    it('should zero the private key after signing (buffer filled with 0)', async () => {
      const hash = ethers.hashMessage('test');
      const spyBuffer = Buffer.from(testPrivateKeyBuf);
      (mockKeyGenService.decryptPrivateKey as jest.Mock).mockResolvedValueOnce({
        privateKey: spyBuffer,
        address: testAddress,
        keyId: BigInt(1),
      });

      await signingService.signHash(1, hash, 'platform', 'test');

      // The buffer should be zeroed
      expect(spyBuffer.every((byte) => byte === 0)).toBe(true);
    });
  });

  describe('signBatch', () => {
    it('should sign multiple hashes', async () => {
      const hashes = [
        ethers.hashMessage('msg1'),
        ethers.hashMessage('msg2'),
        ethers.hashMessage('msg3'),
      ];

      const results = await signingService.signBatch(
        1,
        hashes,
        'platform',
        'test',
      );

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('signature');
        expect(result.address).toBe(testAddress);
      });
    });

    it('should increment sign count by batch size', async () => {
      const hashes = [
        ethers.hashMessage('a'),
        ethers.hashMessage('b'),
      ];

      await signingService.signBatch(1, hashes, 'platform', 'test');

      expect(mockPrisma.derivedKey.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: {
          lastUsedAt: expect.any(Date),
          signCount: { increment: 2 },
        },
      });
    });

    it('should zero the private key after batch signing', async () => {
      const hashes = [ethers.hashMessage('test')];
      const spyBuffer = Buffer.from(testPrivateKeyBuf);
      (mockKeyGenService.decryptPrivateKey as jest.Mock).mockResolvedValueOnce({
        privateKey: spyBuffer,
        address: testAddress,
        keyId: BigInt(1),
      });

      await signingService.signBatch(1, hashes, 'platform', 'test');

      expect(spyBuffer.every((byte) => byte === 0)).toBe(true);
    });
  });
});
