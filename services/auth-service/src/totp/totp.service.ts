import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);
  private readonly issuer = 'CryptoVaultHub';

  constructor(private readonly prisma: PrismaService) {
    // Configure TOTP with 30-second window
    authenticator.options = {
      step: 30,
      window: 1,
    };
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

    // Store the secret (not yet enabled)
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret },
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

    const isValid = authenticator.verify({
      token: code,
      secret: user.totpSecret,
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

    return authenticator.verify({
      token: code,
      secret: user.totpSecret,
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

    const isValid = authenticator.verify({
      token: code,
      secret: user.totpSecret,
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
