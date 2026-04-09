import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class TierManagementService {
  private readonly logger = new Logger(TierManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createTier(
    data: {
      name: string;
      baseTierId?: number;
      isPreset?: boolean;
      isCustom?: boolean;
      globalRateLimit?: number;
      endpointRateLimits?: Record<string, number>;
      maxForwardersPerChain?: number;
      maxChains?: number;
      maxWebhooks?: number;
      dailyWithdrawalLimitUsd?: number;
      monitoringMode?: string;
      kytLevel?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const tier = await this.prisma.tier.create({
      data: {
        name: data.name,
        baseTierId: data.baseTierId ? BigInt(data.baseTierId) : null,
        isPreset: data.isPreset ?? true,
        isCustom: data.isCustom ?? false,
        globalRateLimit: data.globalRateLimit ?? 100,
        endpointRateLimits: data.endpointRateLimits ?? undefined,
        maxForwardersPerChain: data.maxForwardersPerChain ?? 100,
        maxChains: data.maxChains ?? 5,
        maxWebhooks: data.maxWebhooks ?? 10,
        dailyWithdrawalLimitUsd: data.dailyWithdrawalLimitUsd ?? 10000,
        monitoringMode: data.monitoringMode ?? 'basic',
        kytLevel: (data.kytLevel as any) ?? 'basic',
      },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'tier.create',
      entityType: 'tier',
      entityId: tier.id.toString(),
      details: { name: data.name },
      ipAddress,
    });

    this.logger.log(`Tier created: ${data.name} (ID: ${tier.id})`);
    return this.serializeTier(tier);
  }

  async listTiers() {
    const tiers = await this.prisma.tier.findMany({
      include: { _count: { select: { clients: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return tiers.map((t) => ({
      ...this.serializeTier(t),
      clientCount: (t as any)._count?.clients ?? 0,
    }));
  }

  async updateTier(
    id: number,
    data: {
      name?: string;
      globalRateLimit?: number;
      endpointRateLimits?: Record<string, number>;
      maxForwardersPerChain?: number;
      maxChains?: number;
      maxWebhooks?: number;
      dailyWithdrawalLimitUsd?: number;
      monitoringMode?: string;
      kytLevel?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.tier.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException(`Tier ${id} not found`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.globalRateLimit !== undefined) updateData.globalRateLimit = data.globalRateLimit;
    if (data.endpointRateLimits !== undefined) updateData.endpointRateLimits = data.endpointRateLimits;
    if (data.maxForwardersPerChain !== undefined) updateData.maxForwardersPerChain = data.maxForwardersPerChain;
    if (data.maxChains !== undefined) updateData.maxChains = data.maxChains;
    if (data.maxWebhooks !== undefined) updateData.maxWebhooks = data.maxWebhooks;
    if (data.dailyWithdrawalLimitUsd !== undefined) updateData.dailyWithdrawalLimitUsd = data.dailyWithdrawalLimitUsd;
    if (data.monitoringMode !== undefined) updateData.monitoringMode = data.monitoringMode;
    if (data.kytLevel !== undefined) updateData.kytLevel = data.kytLevel;

    const tier = await this.prisma.tier.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    await this.auditLog.log({
      adminUserId,
      action: 'tier.update',
      entityType: 'tier',
      entityId: id.toString(),
      details: data,
      ipAddress,
    });

    return this.serializeTier(tier);
  }

  async cloneTier(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const source = await this.prisma.tier.findUnique({
      where: { id: BigInt(id) },
    });
    if (!source) {
      throw new NotFoundException(`Tier ${id} not found`);
    }

    const clone = await this.prisma.tier.create({
      data: {
        name: `${source.name} (Custom)`,
        baseTierId: source.id,
        isPreset: false,
        isCustom: true,
        globalRateLimit: source.globalRateLimit,
        endpointRateLimits: source.endpointRateLimits ?? undefined,
        maxForwardersPerChain: source.maxForwardersPerChain,
        maxChains: source.maxChains,
        maxWebhooks: source.maxWebhooks,
        dailyWithdrawalLimitUsd: source.dailyWithdrawalLimitUsd,
        monitoringMode: source.monitoringMode,
        kytLevel: source.kytLevel,
      },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'tier.clone',
      entityType: 'tier',
      entityId: clone.id.toString(),
      details: { sourceId: id.toString() },
      ipAddress,
    });

    this.logger.log(`Tier ${id} cloned as ${clone.id}`);
    return this.serializeTier(clone);
  }

  private serializeTier(tier: any) {
    return {
      id: tier.id.toString(),
      name: tier.name,
      baseTierId: tier.baseTierId?.toString() ?? null,
      isPreset: tier.isPreset,
      isCustom: tier.isCustom,
      globalRateLimit: tier.globalRateLimit,
      endpointRateLimits: tier.endpointRateLimits,
      maxForwardersPerChain: tier.maxForwardersPerChain,
      maxChains: tier.maxChains,
      maxWebhooks: tier.maxWebhooks,
      dailyWithdrawalLimitUsd: tier.dailyWithdrawalLimitUsd,
      monitoringMode: tier.monitoringMode,
      kytLevel: tier.kytLevel,
      createdAt: tier.createdAt,
    };
  }
}
