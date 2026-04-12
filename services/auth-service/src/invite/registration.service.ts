// services/auth-service/src/invite/registration.service.ts
import {
  Injectable,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { InviteService } from './invite.service';
import { JwtAuthService } from '../jwt/jwt-auth.service';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteService: InviteService,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  async acceptInvite(
    token: string,
    password: string,
    name: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const invite = await this.inviteService.validateToken(token);

    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Atomically create user and mark invite used
    let user: Awaited<ReturnType<typeof this.prisma.user.create>>;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: invite.email,
            passwordHash,
            name,
            role: 'viewer',
            clientId: invite.clientId,
            clientRole: 'owner',
            isActive: true,
          },
        });

        await tx.inviteToken.update({
          where: { id: invite.id },
          data: { usedAt: new Date() },
        });

        return created;
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }

    // Issue JWT only after transaction commits
    let tokens: Awaited<ReturnType<typeof this.jwtAuthService.issueTokenPair>>;
    try {
      tokens = await this.jwtAuthService.issueTokenPair(user, ipAddress, userAgent);
    } catch {
      throw new ServiceUnavailableException(
        'Account created but session could not be issued. Please log in manually.',
      );
    }

    return {
      success: true,
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.clientId?.toString() ?? null,
        clientRole: user.clientRole ?? null,
      },
      tokens,
    };
  }
}
