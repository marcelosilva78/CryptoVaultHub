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
   */
  encrypt(plaintext: Buffer): EncryptedPayload {
    // Generate random DEK
    const dek = randomBytes(32);
    const salt = randomBytes(32);

    // Derive KEK from master password
    const kek = this.deriveKEK(salt);

    // Encrypt plaintext with DEK
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
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
   */
  decrypt(payload: EncryptedPayload, iterations?: number): Buffer {
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
   * Encrypt a string and return all components needed for DB storage.
   */
  encryptString(plaintext: string): EncryptedPayload {
    return this.encrypt(Buffer.from(plaintext, 'utf-8'));
  }

  /**
   * Decrypt and return as string.
   *
   * @param payload - encrypted data components
   * @param iterations - optional KDF iteration count (pass the stored value
   *   from the DB record to handle keys encrypted under a different iteration count)
   */
  decryptToString(payload: EncryptedPayload, iterations?: number): string {
    const buf = this.decrypt(payload, iterations);
    const str = buf.toString('utf-8');
    buf.fill(0);
    return str;
  }
}
