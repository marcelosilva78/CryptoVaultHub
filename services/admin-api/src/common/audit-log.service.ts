import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    adminUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          adminUserId: data.adminUserId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          details: data.details ?? undefined,
          ipAddress: data.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }

  async findAll(params: {
    page: number;
    limit: number;
    entityType?: string;
    adminUserId?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.entityType) where.entityType = params.entityType;
    if (params.adminUserId) where.adminUserId = params.adminUserId;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((i) => ({
        ...i,
        id: i.id.toString(),
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  }
}
