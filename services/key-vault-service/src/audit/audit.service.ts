import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  operation: string;
  clientId?: bigint | number;
  keyType?: string;
  address?: string;
  txHash?: string;
  chainId?: number;
  requestedBy: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.keyVaultAudit.create({
        data: {
          operation: entry.operation,
          clientId: entry.clientId ? BigInt(entry.clientId) : null,
          keyType: entry.keyType ?? null,
          address: entry.address ?? null,
          txHash: entry.txHash ?? null,
          chainId: entry.chainId ?? null,
          requestedBy: entry.requestedBy,
          metadata: entry.metadata ?? undefined,
        },
      });
    } catch (error: any) {
      // Audit failures should not break the main flow
      this.logger.error('Failed to write audit log', error);
    }
  }
}
