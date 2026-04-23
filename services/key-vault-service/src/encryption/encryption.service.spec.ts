import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { randomBytes } from 'crypto';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'VAULT_MASTER_PASSWORD')
                return 'test-master-password-for-unit-tests';
              throw new Error(`Unknown key: ${key}`);
            },
            get: (key: string, defaultValue: string) => {
              if (key === 'KDF_ITERATIONS') return '1000'; // Low for tests
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a buffer correctly', () => {
      const plaintext = Buffer.from('hello world - private key data');
      const encrypted = service.encrypt(plaintext);

      expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
      expect(encrypted.iv).toBeInstanceOf(Buffer);
      expect(encrypted.iv.length).toBe(12);
      expect(encrypted.authTag).toBeInstanceOf(Buffer);
      expect(encrypted.authTag.length).toBe(16);
      expect(encrypted.salt).toBeInstanceOf(Buffer);
      expect(encrypted.salt.length).toBe(32);
      expect(encrypted.encryptedDek).toBeInstanceOf(Buffer);

      // Ciphertext should not equal plaintext
      expect(encrypted.ciphertext.toString('hex')).not.toBe(
        plaintext.toString('hex'),
      );

      const decrypted = service.decrypt(encrypted);
      expect(decrypted.toString('utf-8')).toBe('hello world - private key data');
    });

    it('should encrypt and decrypt random 32-byte keys (like private keys)', () => {
      const privateKey = randomBytes(32);
      const originalHex = privateKey.toString('hex');

      const encrypted = service.encrypt(privateKey);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted.toString('hex')).toBe(originalHex);
    });

    it('should produce different ciphertexts for the same plaintext (random IV/salt)', () => {
      const plaintext = Buffer.from('same input');
      const enc1 = service.encrypt(plaintext);
      const enc2 = service.encrypt(plaintext);

      expect(enc1.ciphertext.toString('hex')).not.toBe(
        enc2.ciphertext.toString('hex'),
      );
      expect(enc1.iv.toString('hex')).not.toBe(enc2.iv.toString('hex'));
      expect(enc1.salt.toString('hex')).not.toBe(enc2.salt.toString('hex'));
    });

    it('should fail to decrypt with tampered ciphertext', () => {
      const plaintext = Buffer.from('sensitive data');
      const encrypted = service.encrypt(plaintext);

      // Tamper with ciphertext
      encrypted.ciphertext[0] ^= 0xff;

      expect(() => service.decrypt(encrypted)).toThrow();
    });

    it('should fail to decrypt with tampered auth tag', () => {
      const plaintext = Buffer.from('sensitive data');
      const encrypted = service.encrypt(plaintext);

      // Tamper with auth tag
      encrypted.authTag[0] ^= 0xff;

      expect(() => service.decrypt(encrypted)).toThrow();
    });

    it('should fail to decrypt with wrong salt (wrong KEK)', () => {
      const plaintext = Buffer.from('sensitive data');
      const encrypted = service.encrypt(plaintext);

      // Use a different salt -> different KEK -> decryption fails
      encrypted.salt = randomBytes(32);

      expect(() => service.decrypt(encrypted)).toThrow();
    });
  });

  describe('AAD (Additional Authenticated Data)', () => {
    it('should encrypt and decrypt correctly with AAD', () => {
      const plaintext = Buffer.from('private key with AAD binding');
      const aad = 'client-123:master-seed';
      const encrypted = service.encrypt(plaintext, aad);
      const decrypted = service.decrypt(encrypted, undefined, aad);
      expect(decrypted.toString('utf-8')).toBe('private key with AAD binding');
    });

    it('should fail to decrypt when AAD does not match', () => {
      const plaintext = Buffer.from('private key bound to context');
      const encrypted = service.encrypt(plaintext, 'client-123:master-seed');
      expect(() =>
        service.decrypt(encrypted, undefined, 'client-999:master-seed'),
      ).toThrow();
    });

    it('should fail to decrypt AAD-encrypted data without AAD', () => {
      const plaintext = Buffer.from('aad-protected data');
      const encrypted = service.encrypt(plaintext, 'project-1:hd-key');
      // Decrypting without AAD should fail because the auth tag won't verify
      expect(() => service.decrypt(encrypted)).toThrow();
    });

    it('should decrypt non-AAD data without AAD (backward compat)', () => {
      const plaintext = Buffer.from('legacy data without AAD');
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted.toString('utf-8')).toBe('legacy data without AAD');
    });

    it('should work with encryptString/decryptToString and AAD', () => {
      const input = 'mnemonic phrase with context binding';
      const aad = 'tenant-42:mnemonic';
      const encrypted = service.encryptString(input, aad);
      const result = service.decryptToString(encrypted, undefined, aad);
      expect(result).toBe(input);
    });
  });

  describe('encryptString/decryptToString', () => {
    it('should encrypt and decrypt a string', () => {
      const input = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const encrypted = service.encryptString(input);
      const result = service.decryptToString(encrypted);
      expect(result).toBe(input);
    });

    it('should handle empty string', () => {
      const encrypted = service.encryptString('');
      const result = service.decryptToString(encrypted);
      expect(result).toBe('');
    });

    it('should handle Unicode strings', () => {
      const input = 'test with unicode: \u00e9\u00e0\u00fc\u00f1';
      const encrypted = service.encryptString(input);
      const result = service.decryptToString(encrypted);
      expect(result).toBe(input);
    });
  });

  describe('encryptWithPassword/decryptWithPassword', () => {
    it('should encrypt and decrypt with an explicit password', () => {
      const plaintext = Buffer.from('secret data for rotation');
      const password = 'explicit-password-for-test';
      const encrypted = service.encryptWithPassword(plaintext, password);
      const decrypted = service.decryptWithPassword(encrypted, password);
      expect(decrypted.toString('utf-8')).toBe('secret data for rotation');
    });

    it('should fail to decrypt with wrong password', () => {
      const plaintext = Buffer.from('secret data');
      const encrypted = service.encryptWithPassword(plaintext, 'correct-password-here');
      expect(() =>
        service.decryptWithPassword(encrypted, 'wrong-password-here!!'),
      ).toThrow();
    });
  });

  describe('rotateEncryption', () => {
    it('should rotate encryption from old password to new password', () => {
      const plaintext = Buffer.from('private key material to rotate');
      const oldPassword = 'old-master-password-value';
      const newPassword = 'new-master-password-value';

      // Encrypt with old password
      const original = service.encryptWithPassword(plaintext, oldPassword);

      // Rotate to new password
      const rotated = service.rotateEncryption(original, oldPassword, newPassword);

      // Verify key version incremented
      expect(rotated.keyVersion).toBe(2);

      // Verify data can be decrypted with new password
      const decrypted = service.decryptWithPassword(rotated, newPassword);
      expect(decrypted.toString('utf-8')).toBe('private key material to rotate');
    });

    it('should fail to decrypt rotated data with old password', () => {
      const plaintext = Buffer.from('sensitive key data');
      const oldPassword = 'old-password-for-rotation';
      const newPassword = 'new-password-for-rotation';

      const original = service.encryptWithPassword(plaintext, oldPassword);
      const rotated = service.rotateEncryption(original, oldPassword, newPassword);

      expect(() =>
        service.decryptWithPassword(rotated, oldPassword),
      ).toThrow();
    });

    it('should increment key version from custom starting version', () => {
      const plaintext = Buffer.from('data at version 3');
      const oldPassword = 'old-pass-version-test!';
      const newPassword = 'new-pass-version-test!';

      const original = service.encryptWithPassword(plaintext, oldPassword);
      const rotated = service.rotateEncryption(original, oldPassword, newPassword, 3);

      expect(rotated.keyVersion).toBe(4);
    });

    it('should preserve plaintext through multiple rotations', () => {
      const plaintext = Buffer.from('data surviving multiple rotations');
      const pass1 = 'password-generation-one!';
      const pass2 = 'password-generation-two!';
      const pass3 = 'password-generation-three';

      const enc1 = service.encryptWithPassword(plaintext, pass1);
      const enc2 = service.rotateEncryption(enc1, pass1, pass2, 1);
      expect(enc2.keyVersion).toBe(2);

      const enc3 = service.rotateEncryption(enc2, pass2, pass3, 2);
      expect(enc3.keyVersion).toBe(3);

      const decrypted = service.decryptWithPassword(enc3, pass3);
      expect(decrypted.toString('utf-8')).toBe('data surviving multiple rotations');
    });
  });

  describe('deriveKEK', () => {
    it('should produce deterministic output for same salt', () => {
      const salt = randomBytes(32);
      const kek1 = service.deriveKEK(salt);
      const kek2 = service.deriveKEK(salt);
      expect(kek1.toString('hex')).toBe(kek2.toString('hex'));
    });

    it('should produce 32-byte key', () => {
      const salt = randomBytes(32);
      const kek = service.deriveKEK(salt);
      expect(kek.length).toBe(32);
    });

    it('should produce different keys for different salts', () => {
      const salt1 = randomBytes(32);
      const salt2 = randomBytes(32);
      const kek1 = service.deriveKEK(salt1);
      const kek2 = service.deriveKEK(salt2);
      expect(kek1.toString('hex')).not.toBe(kek2.toString('hex'));
    });
  });
});
