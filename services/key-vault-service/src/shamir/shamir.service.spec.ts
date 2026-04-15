import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ShamirService } from './shamir.service';
import { PrismaService } from '../prisma/prisma.service';
import { KeyGenerationService } from '../key-generation/key-generation.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';

// Mock secrets.js-grempe at module level
jest.mock('secrets.js-grempe', () => ({
  init: jest.fn(),
  share: jest.fn().mockReturnValue([
    'share-hex-1',
    'share-hex-2',
    'share-hex-3',
    'share-hex-4',
    'share-hex-5',
  ]),
  combine: jest.fn().mockReturnValue(
    'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344',
  ),
}));

describe('ShamirService', () => {
  let service: ShamirService;
  let mockPrisma: any;
  let mockKeyGenService: any;
  let mockEncryption: any;
  let mockAudit: any;

  const fakePrivateKey = Buffer.alloc(32, 0xab);
  const fakeCiphertext = Buffer.from('encrypted-share');
  const fakeIv = Buffer.alloc(16, 0x01);
  const fakeAuthTag = Buffer.alloc(16, 0x02);
  const fakeSalt = Buffer.alloc(32, 0x03);
  const fakeEncryptedDek = Buffer.from('encrypted-dek');

  const defaultCustodians = [
    'company_vault',
    'ceo_safe',
    'cto_safe',
    'legal_escrow',
    'bank_safe_deposit',
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      shamirShare: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      derivedKey: {
        findFirst: jest.fn(),
      },
    };

    mockKeyGenService = {
      decryptPrivateKey: jest.fn().mockResolvedValue({
        privateKey: Buffer.from(fakePrivateKey),
      }),
    };

    mockEncryption = {
      encrypt: jest.fn().mockReturnValue({
        ciphertext: fakeCiphertext,
        encryptedDek: fakeEncryptedDek,
        iv: fakeIv,
        authTag: fakeAuthTag,
        salt: fakeSalt,
      }),
      decrypt: jest.fn().mockReturnValue(Buffer.from('share-hex-1', 'utf-8')),
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShamirService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KeyGenerationService, useValue: mockKeyGenService },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<ShamirService>(ShamirService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('splitBackupKey', () => {
    it('should create 5 encrypted shares with correct custodian names', async () => {
      const result = await service.splitBackupKey(1);

      expect(result.totalShares).toBe(5);
      expect(result.threshold).toBe(3);
      expect(result.custodians).toEqual(defaultCustodians);

      // Each share should have been encrypted and stored
      expect(mockEncryption.encrypt).toHaveBeenCalledTimes(5);
      expect(mockPrisma.shamirShare.create).toHaveBeenCalledTimes(5);

      // Verify each custodian name was stored correctly
      for (let i = 0; i < 5; i++) {
        expect(mockPrisma.shamirShare.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              custodian: defaultCustodians[i],
              shareIndex: i + 1,
              clientId: BigInt(1),
            }),
          }),
        );
      }
    });

    it('should store shares in database', async () => {
      await service.splitBackupKey(1);

      expect(mockPrisma.shamirShare.create).toHaveBeenCalledTimes(5);

      // Verify encrypted data is passed to prisma
      for (let i = 0; i < 5; i++) {
        expect(mockPrisma.shamirShare.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              encryptedShare: fakeCiphertext,
              encryptedDek: fakeEncryptedDek,
              iv: fakeIv,
              authTag: fakeAuthTag,
              salt: fakeSalt,
            }),
          }),
        );
      }

      // Verify audit log was written
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'shamir_split',
          clientId: 1,
          keyType: 'backup',
        }),
      );
    });
  });

  describe('reconstructBackupKey', () => {
    it('should reject fewer than 3 shares (threshold enforcement)', async () => {
      await expect(
        service.reconstructBackupKey(1, [1, 2]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.reconstructBackupKey(1, [1, 2]),
      ).rejects.toThrow('Minimum 3 shares required');
    });

    it('should successfully reconstruct from exactly 3 valid shares', async () => {
      // Mock finding 3 shares in DB
      mockPrisma.shamirShare.findMany.mockResolvedValue([
        {
          shareIndex: 1,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
        {
          shareIndex: 2,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
        {
          shareIndex: 3,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
      ]);

      // The mock secrets.combine returns a fixed hex private key.
      // We need to compute the real address that secp256k1 + ethers would
      // derive from that hex, then set the stored backup key to match.
      const testPrivateKeyHex =
        'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
      const privateKeyBuf = Buffer.from(testPrivateKeyHex, 'hex');

      // Derive the actual address using the same crypto path as the source
      const secp256k1 = await import('secp256k1');
      const pubKeyUncompressed = Buffer.from(
        secp256k1.publicKeyCreate(Uint8Array.from(privateKeyBuf), false),
      );
      const { ethers } = await import('ethers');
      const addressHash = ethers.keccak256(pubKeyUncompressed.subarray(1));
      const expectedAddress = ethers.getAddress('0x' + addressHash.slice(-40));

      // Make the stored backup key match the derived address
      mockPrisma.derivedKey.findFirst.mockResolvedValue({
        address: expectedAddress,
      });

      const result = await service.reconstructBackupKey(1, [1, 2, 3]);

      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('publicKey');
      expect(result.address.toLowerCase()).toBe(expectedAddress.toLowerCase());
      expect(mockEncryption.decrypt).toHaveBeenCalledTimes(3);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'shamir_reconstruct',
          clientId: 1,
          keyType: 'backup',
        }),
      );
    });

    it('should reject when reconstructed address does not match stored address', async () => {
      // Provide 3 shares
      mockPrisma.shamirShare.findMany.mockResolvedValue([
        {
          shareIndex: 1,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
        {
          shareIndex: 2,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
        {
          shareIndex: 3,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
      ]);

      // Return a DIFFERENT address than what reconstruction will produce
      mockPrisma.derivedKey.findFirst.mockResolvedValue({
        address: '0x0000000000000000000000000000000000000001',
      });

      await expect(
        service.reconstructBackupKey(1, [1, 2, 3]),
      ).rejects.toThrow(InternalServerErrorException);

      await expect(
        service.reconstructBackupKey(1, [1, 2, 3]),
      ).rejects.toThrow('does not match stored backup address');
    });

    it('should handle invalid/corrupted share data gracefully', async () => {
      // Return 3 shares from DB
      mockPrisma.shamirShare.findMany.mockResolvedValue([
        {
          shareIndex: 1,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
        {
          shareIndex: 2,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
        {
          shareIndex: 3,
          encryptedShare: fakeCiphertext,
          encryptedDek: fakeEncryptedDek,
          iv: fakeIv,
          authTag: fakeAuthTag,
          salt: fakeSalt,
        },
      ]);

      // Simulate decryption failure (corrupted share)
      mockEncryption.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed: invalid auth tag');
      });

      await expect(
        service.reconstructBackupKey(1, [1, 2, 3]),
      ).rejects.toThrow();
    });
  });
});
