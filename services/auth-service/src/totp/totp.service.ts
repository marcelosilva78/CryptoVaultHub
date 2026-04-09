import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
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
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Configure TOTP with 30-second window
    authenticator.options = {
      step: 30,
      window: 1,
    };

    // Derive a 32-byte key from TOTP_ENCRYPTION_KEY env var using scrypt
    const rawKey = this.configService.getOrThrow<string>('TOTP_ENCRYPTION_KEY');
    this.encryptionKey = scryptSync(rawKey, 'totp-secret-salt', 32);
  }

  /**
   * Encrypt a TOTP secret using AES-256-GCM before storage.
   */
  private encryptSecret(secret: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Store as iv:authTag:ciphertext in hex
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt a TOTP secret from AES-256-GCM encrypted storage format.
   */
  private decryptSecret(encryptedValue: string): string {
    const parts = encryptedValue.split(':');
    if (parts.length !== 3) {
      throw new BadRequestException('Invalid encrypted TOTP secret format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = Buffer.from(parts[2], 'hex');

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
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

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(
      user.email,
      this.issuer,
      secret,
    );

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
    const isValid = authenticator.verify({
      token: code,
      secret,
    });

    if (!isValid) {
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
    return authenticator.verify({
      token: code,
      secret,
    });
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
    const isValid = authenticator.verify({
      token: code,
      secret,
    });
    if (!isValid) {
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
