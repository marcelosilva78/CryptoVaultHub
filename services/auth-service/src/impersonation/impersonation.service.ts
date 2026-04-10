import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CRIT-2: Impersonation sessions are limited to MAX_SESSION_HOURS (4h).
 * The validateSession query includes a time constraint so expired
 * impersonation sessions are never honored.
 */
const MAX_SESSION_HOURS = 4;

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async startSession(data: {
    adminUserId: string;
    targetClientId: number;
    reason: string;
    ipAddress?: string;
  }) {
    const session = await this.prisma.impersonationSession.create({
      data: {
        adminUserId: data.adminUserId,
        targetClientId: data.targetClientId,
        reason: data.reason,
        ipAddress: data.ipAddress ?? null,
        startedAt: new Date(),
        isActive: true,
      },
    });

    this.logger.log(
      `Impersonation session started: admin=${data.adminUserId} client=${data.targetClientId}`,
    );

    return {
      sessionId: session.id.toString(),
      targetClientId: data.targetClientId,
      startedAt: session.startedAt,
    };
  }

  async validateSession(sessionId: string) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - MAX_SESSION_HOURS);

    const session = await this.prisma.impersonationSession.findFirst({
      where: {
        id: BigInt(sessionId),
        isActive: true,
        // CRIT-2: Enforce maximum session duration of 4 hours
        startedAt: {
          gt: cutoff,
        },
      },
    });

    if (!session) {
      throw new NotFoundException(
        'Impersonation session not found, expired, or inactive',
      );
    }

    return {
      valid: true,
      sessionId: session.id.toString(),
      adminUserId: session.adminUserId,
      targetClientId: Number(session.targetClientId),
      startedAt: session.startedAt,
    };
  }

  async endSession(sessionId: string, adminUserId: string) {
    const session = await this.prisma.impersonationSession.findFirst({
      where: {
        id: BigInt(sessionId),
        adminUserId,
        isActive: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Impersonation session not found');
    }

    await this.prisma.impersonationSession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    this.logger.log(
      `Impersonation session ended: sessionId=${sessionId} admin=${adminUserId}`,
    );

    return { success: true, message: 'Impersonation session ended' };
  }
}
