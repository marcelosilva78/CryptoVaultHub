import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
} from 'crypto';

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  salt: Buffer;
  encryptedDek: Buffer;
  keyVersion?: number;
}

@Injectable()
export class EncryptionService {
  private readonly masterPassword: string;
  readonly kdfIterations: number;

  constructor(private readonly configService: ConfigService) {
    this.masterPassword = this.configService.getOrThrow<string>(
      'VAULT_MASTER_PASSWORD',
    );
    this.kdfIterations = parseInt(
      this.configService.get<string>('KDF_ITERATIONS', '600000'),
      10,
    );
  }

  /**
   * Derive a Key Encryption Key (KEK) from master password using PBKDF2.
   */
  deriveKEK(salt: Buffer, iterations?: number): Buffer {
    return pbkdf2Sync(
      this.masterPassword,
      salt,
      iterations ?? this.kdfIterations,
      32,
      'sha512',
    );
  }

  /**
   * Encrypt plaintext using envelope encryption:
   * 1. Generate random DEK (Data Encryption Key)
   * 2. Encrypt plaintext with DEK using AES-256-GCM
   * 3. Wrap DEK with KEK (derived from master password)
   *
   * @param plaintext - data to encrypt
   * @param aad - optional Additional Authenticated Data (e.g. "clientId:keyType")
   *   to bind the ciphertext to a specific context and prevent record transplant attacks.
   *   Must be the same value when decrypting.
   */
  encrypt(plaintext: Buffer, aad?: string): EncryptedPayload {
    // Generate random DEK
    const dek = randomBytes(32);
    const salt = randomBytes(32);

    // Derive KEK from master password
    const kek = this.deriveKEK(salt);

    // Encrypt plaintext with DEK
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    if (aad) {
      cipher.setAAD(Buffer.from(aad));
    }
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Wrap DEK with KEK
    const dekIv = randomBytes(12);
    const dekCipher = createCipheriv('aes-256-gcm', kek, dekIv);
    const encryptedDek = Buffer.concat([
      dekIv,
      dekCipher.update(dek),
      dekCipher.final(),
      dekCipher.getAuthTag(),
    ]);

    // Zero sensitive material
    dek.fill(0);
    kek.fill(0);

    return { ciphertext, iv, authTag, salt, encryptedDek };
  }

  /**
   * Decrypt ciphertext using envelope encryption:
   * 1. Derive KEK from master password
   * 2. Unwrap DEK using KEK
   * 3. Decrypt ciphertext with DEK
   *
   * @param payload - encrypted data components
   * @param iterations - optional KDF iteration count (use stored value from DB
   *   to ensure keys encrypted under a different iteration count can be decrypted)
   * @param aad - optional Additional Authenticated Data. Must match the value
   *   used during encryption. Omit when decrypting legacy data encrypted without AAD.
   */
  decrypt(payload: EncryptedPayload, iterations?: number, aad?: string): Buffer {
    const { ciphertext, iv, authTag, salt, encryptedDek } = payload;

    // Derive KEK (use caller-supplied iterations when available, e.g. from masterSeed.kdfIterations)
    const kek = this.deriveKEK(salt, iterations);

    // Unwrap DEK — detect IV length for backward compatibility
    // Old records used 16-byte IV; new records use 12-byte (NIST-recommended).
    // encryptedDek layout: [iv | ciphertext(32) | authTag(16)]
    const dekIvLen = encryptedDek.length === 64 ? 16 : 12;
    const dekIv = encryptedDek.subarray(0, dekIvLen);
    const dekCiphertext = encryptedDek.subarray(dekIvLen, encryptedDek.length - 16);
    const dekAuthTag = encryptedDek.subarray(encryptedDek.length - 16);

    const dekDecipher = createDecipheriv('aes-256-gcm', kek, dekIv);
    dekDecipher.setAuthTag(dekAuthTag);
    const dek = Buffer.concat([
      dekDecipher.update(dekCiphertext),
      dekDecipher.final(),
    ]);

    // Decrypt data with DEK
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);
    if (aad) {
      decipher.setAAD(Buffer.from(aad));
    }
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // Zero sensitive material
    kek.fill(0);
    dek.fill(0);

    return plaintext;
  }

  /**
   * Derive a KEK from an arbitrary password (not necessarily the configured master password).
   * Used during key rotation to derive KEKs from old/new passwords.
   */
  deriveKEKFromPassword(password: string, salt: Buffer, iterations?: number): Buffer {
    return pbkdf2Sync(
      password,
      salt,
      iterations ?? this.kdfIterations,
      32,
      'sha512',
    );
  }

  /**
   * Encrypt plaintext using an explicit password instead of the configured master password.
   * Used during key rotation to re-encrypt with the new password.
   */
  encryptWithPassword(plaintext: Buffer, password: string): EncryptedPayload {
    const dek = randomBytes(32);
    const salt = randomBytes(32);
    const kek = this.deriveKEKFromPassword(password, salt);

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const dekIv = randomBytes(12);
    const dekCipher = createCipheriv('aes-256-gcm', kek, dekIv);
    const encryptedDek = Buffer.concat([
      dekIv,
      dekCipher.update(dek),
      dekCipher.final(),
      dekCipher.getAuthTag(),
    ]);

    dek.fill(0);
    kek.fill(0);

    return { ciphertext, iv, authTag, salt, encryptedDek };
  }

  /**
   * Decrypt ciphertext using an explicit password instead of the configured master password.
   * Used during key rotation to decrypt with the old password.
   */
  decryptWithPassword(payload: EncryptedPayload, password: string, iterations?: number): Buffer {
    const { ciphertext, iv, authTag, salt, encryptedDek } = payload;
    const kek = this.deriveKEKFromPassword(password, salt, iterations);

    const dekIvLen = encryptedDek.length === 64 ? 16 : 12;
    const dekIv = encryptedDek.subarray(0, dekIvLen);
    const dekCiphertext = encryptedDek.subarray(dekIvLen, encryptedDek.length - 16);
    const dekAuthTag = encryptedDek.subarray(encryptedDek.length - 16);

    const dekDecipher = createDecipheriv('aes-256-gcm', kek, dekIv);
    dekDecipher.setAuthTag(dekAuthTag);
    const dek = Buffer.concat([
      dekDecipher.update(dekCiphertext),
      dekDecipher.final(),
    ]);

    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    kek.fill(0);
    dek.fill(0);

    return plaintext;
  }

  /**
   * Rotate encryption: decrypt with the old password, re-encrypt with the new password.
   * Returns the new encrypted payload with an incremented key version.
   *
   * @param encryptedData - the current encrypted payload
   * @param oldPassword - the password used to encrypt the data
   * @param newPassword - the password to re-encrypt the data with
   * @param currentKeyVersion - the current key version (default 1)
   * @param iterations - optional KDF iteration count for decryption
   */
  rotateEncryption(
    encryptedData: EncryptedPayload,
    oldPassword: string,
    newPassword: string,
    currentKeyVersion: number = 1,
    iterations?: number,
  ): EncryptedPayload {
    // Decrypt with old password
    const plaintext = this.decryptWithPassword(encryptedData, oldPassword, iterations);

    try {
      // Re-encrypt with new password
      const newPayload = this.encryptWithPassword(plaintext, newPassword);
      newPayload.keyVersion = currentKeyVersion + 1;
      return newPayload;
    } finally {
      // Zero plaintext regardless of success/failure
      plaintext.fill(0);
    }
  }

  /**
   * Encrypt a string and return all components needed for DB storage.
   *
   * @param plaintext - string to encrypt
   * @param aad - optional Additional Authenticated Data (e.g. "clientId:keyType")
   */
  encryptString(plaintext: string, aad?: string): EncryptedPayload {
    return this.encrypt(Buffer.from(plaintext, 'utf-8'), aad);
  }

  /**
   * Decrypt and return as string.
   *
   * @param payload - encrypted data components
   * @param iterations - optional KDF iteration count (pass the stored value
   *   from the DB record to handle keys encrypted under a different iteration count)
   * @param aad - optional Additional Authenticated Data. Must match the value used during encryption.
   */
  decryptToString(payload: EncryptedPayload, iterations?: number, aad?: string): string {
    const buf = this.decrypt(payload, iterations, aad);
    const str = buf.toString('utf-8');
    buf.fill(0);
    return str;
  }
}
