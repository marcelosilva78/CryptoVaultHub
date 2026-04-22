import {
  Injectable,
  NotFoundException,
  GoneException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateInvite(email: string, clientId: number) {
    // Prevent multiple active invites for the same email
    const existing = await this.prisma.inviteToken.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      throw new ConflictException('An active invite already exists for this email');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    await this.prisma.inviteToken.create({
      data: {
        email,
        clientId: BigInt(clientId),
        token,
        expiresAt,
      },
    });

    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3011');
    if (process.env.NODE_ENV === 'production' && portalUrl.includes('localhost')) {
      throw new Error('PORTAL_URL must be set to a public URL in production');
    }
    const inviteUrl = `${portalUrl}/register?token=${token}`;

    return { token, inviteUrl };
  }

  async validateToken(token: string) {
    const invite = await this.prisma.inviteToken.findUnique({
      where: { token },
    });

    if (!invite) {
      throw new NotFoundException('Invite token not found');
    }
    // Check expiry FIRST (token structurally invalid)
    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invite token has expired');
    }
    // Then check if used
    if (invite.usedAt) {
      throw new ConflictException('Invite token has already been used');
    }

    return invite;
  }
}
