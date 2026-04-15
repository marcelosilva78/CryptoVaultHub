import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class TokenManagementService {
  private readonly logger = new Logger(TokenManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * List all enabled tokens for a specific client.
   */
  async listClientTokens(clientId: number) {
    const tokens = await this.prisma.clientToken.findMany({
      where: { clientId },
    });

    return tokens.map((t) => ({
      id: t.id,
      clientId: t.clientId,
      tokenId: t.tokenId,
      isEnabled: t.isEnabled,
      customLabel: t.customLabel,
      createdAt: t.createdAt,
    }));
  }

  /**
   * Enable a token for a client.
   */
  async enableToken(
    clientId: number,
    data: { tokenId: number; chainId?: number; customLabel?: string },
    adminUserId: string,
    ipAddress?: string,
  ) {
    // Check if already exists
    const existing = await this.prisma.clientToken.findUnique({
      where: {
        uq_client_token: {
          clientId: clientId,
          tokenId: data.tokenId,
        },
      },
    });

    if (existing && existing.isEnabled) {
      throw new ConflictException(
        `Token ${data.tokenId} is already enabled for client ${clientId}`,
      );
    }

    let record;
    if (existing) {
      // Re-enable previously disabled token
      record = await this.prisma.clientToken.update({
        where: { id: existing.id },
        data: {
          isEnabled: true,
          customLabel: data.customLabel ?? existing.customLabel,
        },
      });
    } else {
      record = await this.prisma.clientToken.create({
        data: {
          clientId: clientId,
          tokenId: data.tokenId,
          isEnabled: true,
          customLabel: data.customLabel ?? null,
        },
      });
    }

    await this.auditLog.log({
      adminUserId,
      action: 'client_token.enable',
      entityType: 'client_token',
      entityId: `${clientId}:${data.tokenId}`,
      details: { clientId, tokenId: data.tokenId, chainId: data.chainId },
      ipAddress,
    });

    this.logger.log(
      `Token ${data.tokenId} enabled for client ${clientId}`,
    );

    return {
      id: record.id,
      clientId: record.clientId,
      tokenId: record.tokenId,
      isEnabled: record.isEnabled,
      customLabel: record.customLabel,
      createdAt: record.createdAt,
    };
  }

  /**
   * Disable a token for a client.
   */
  async disableToken(
    clientId: number,
    tokenId: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.clientToken.findUnique({
      where: {
        uq_client_token: {
          clientId: clientId,
          tokenId: tokenId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Token ${tokenId} is not configured for client ${clientId}`,
      );
    }

    await this.prisma.clientToken.update({
      where: { id: existing.id },
      data: { isEnabled: false },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'client_token.disable',
      entityType: 'client_token',
      entityId: `${clientId}:${tokenId}`,
      details: { clientId, tokenId },
      ipAddress,
    });

    this.logger.log(
      `Token ${tokenId} disabled for client ${clientId}`,
    );
  }
}
