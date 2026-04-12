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

    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3002');
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
    if (invite.usedAt) {
      throw new ConflictException('Invite token has already been used');
    }
    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invite token has expired');
    }

    return invite;
  }
}
