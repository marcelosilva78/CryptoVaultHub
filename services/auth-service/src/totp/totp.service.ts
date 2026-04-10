import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as qrcode from 'qrcode';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);
  private readonly issuer = 'CryptoVaultHub';
  private readonly rawEncryptionKey: string;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Store the raw key for per-operation salt derivation
    this.rawEncryptionKey = this.configService.getOrThrow<string>('TOTP_ENCRYPTION_KEY');
    // Legacy: keep a static-derived key for decrypting old 3-part records
    this.encryptionKey = scryptSync(this.rawEncryptionKey, 'totp-secret-salt', 32);
  }

  /** Derive a 32-byte key from the raw key + a random salt using scrypt. */
  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.rawEncryptionKey, salt, 32);
  }

  /**
   * Encrypt a TOTP secret using AES-256-GCM with a per-operation random salt.
   * Stored as salt:iv:authTag:ciphertext (all hex).
   */
  private encryptSecret(secret: string): string {
    const salt = randomBytes(16);
    const key = this.deriveKey(salt);
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt a TOTP secret from AES-256-GCM encrypted storage format.
   * Supports both new 4-part (salt:iv:authTag:ciphertext) and legacy
   * 3-part (iv:authTag:ciphertext with static salt) formats.
   */
  private decryptSecret(encryptedValue: string): string {
    const parts = encryptedValue.split(':');

    let key: Buffer;
    let iv: Buffer;
    let authTag: Buffer;
    let ciphertext: Buffer;

    if (parts.length === 4) {
      // New format: salt:iv:authTag:ciphertext
      const salt = Buffer.from(parts[0], 'hex');
      iv = Buffer.from(parts[1], 'hex');
      authTag = Buffer.from(parts[2], 'hex');
      ciphertext = Buffer.from(parts[3], 'hex');
      key = this.deriveKey(salt);
    } else if (parts.length === 3) {
      // Legacy format: iv:authTag:ciphertext (static salt)
      iv = Buffer.from(parts[0], 'hex');
      authTag = Buffer.from(parts[1], 'hex');
      ciphertext = Buffer.from(parts[2], 'hex');
      key = this.encryptionKey;
    } else {
      throw new BadRequestException('Invalid encrypted TOTP secret format');
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf-8');
  }

  /**
   * Generate a TOTP secret for a user and return the otpauth URI + QR code data.
   */
  async setup2fa(userId: bigint): Promise<{
    secret: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.totpEnabled) {
      throw new BadRequestException('2FA is already enabled for this user');
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: this.issuer,
      label: user.email,
      secret,
      period: 30,
    });

    // Encrypt the secret before storing in DB
    const encryptedSecret = this.encryptSecret(secret);

    // Store the encrypted secret (not yet enabled)
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptedSecret },
    });

    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  /**
   * Verify a TOTP code and enable 2FA if not already enabled.
   * Used for initial setup verification.
   */
  async verify2fa(userId: bigint, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.totpSecret) {
      throw new BadRequestException(
        '2FA setup not initiated. Call setup first.',
      );
    }

    const secret = this.decryptSecret(user.totpSecret);
    const result = await otpVerify({
      token: code,
      secret,
      period: 30,
      epochTolerance: 30,
    });

    if (!result.valid) {
      throw new BadRequestException('Invalid TOTP code');
    }

    // Enable 2FA
    if (!user.totpEnabled) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { totpEnabled: true },
      });
      this.logger.log(`2FA enabled for user ${userId}`);
    }

    return true;
  }

  /**
   * Validate a TOTP code during login (already enabled).
   */
  async validateCode(userId: bigint, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('2FA is not enabled for this user');
    }

    const secret = this.decryptSecret(user.totpSecret);
    const result = await otpVerify({
      token: code,
      secret,
      period: 30,
      epochTolerance: 30,
    });
    return result.valid;
  }

  /**
   * Disable 2FA for a user (requires valid code + password verification done upstream).
   */
  async disable2fa(userId: bigint, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('2FA is not enabled');
    }

    const secret = this.decryptSecret(user.totpSecret);
    const result = await otpVerify({
      token: code,
      secret,
      period: 30,
      epochTolerance: 30,
    });
    if (!result.valid) {
      throw new BadRequestException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpEnabled: false,
      },
    });

    this.logger.log(`2FA disabled for user ${userId}`);
  }
}
