import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class RpcManagementService {
  private readonly logger = new Logger(RpcManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── Providers ──────────────────────────────────────────────

  async createProvider(
    data: {
      name: string;
      slug: string;
      website?: string;
      authMethod?: string;
      authHeaderName?: string;
      apiKeyEncrypted?: string;
      apiSecretEncrypted?: string;
      notes?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.rpcProvider.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Provider with slug "${data.slug}" already exists`,
      );
    }

    const provider = await this.prisma.rpcProvider.create({
      data: {
        name: data.name,
        slug: data.slug,
        website: data.website ?? null,
        authMethod: (data.authMethod as any) ?? 'api_key',
        authHeaderName: data.authHeaderName ?? 'x-api-key',
        apiKeyEncrypted: data.apiKeyEncrypted ?? null,
        apiSecretEncrypted: data.apiSecretEncrypted ?? null,
        notes: data.notes ?? null,
      },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.create',
      entityType: 'rpc_provider',
      entityId: provider.id.toString(),
      details: { name: data.name, slug: data.slug },
      ipAddress,
    });

    this.logger.log(`RPC provider created: ${data.slug} (ID: ${provider.id})`);
    return this.serializeProvider(provider);
  }

  async listProviders() {
    const providers = await this.prisma.rpcProvider.findMany({
      include: {
        nodes: {
          where: { isActive: true },
          orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    return providers.map((p) => ({
      ...this.serializeProvider(p),
      nodes: p.nodes.map((n) => this.serializeNode(n)),
    }));
  }

  async updateProvider(
    id: number,
    data: {
      name?: string;
      website?: string;
      authMethod?: string;
      authHeaderName?: string;
      apiKeyEncrypted?: string;
      apiSecretEncrypted?: string;
      notes?: string;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.rpcProvider.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException(`Provider ${id} not found`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.website !== undefined) updateData.website = data.website;
    if (data.authMethod !== undefined) updateData.authMethod = data.authMethod;
    if (data.authHeaderName !== undefined)
      updateData.authHeaderName = data.authHeaderName;
    if (data.apiKeyEncrypted !== undefined)
      updateData.apiKeyEncrypted = data.apiKeyEncrypted;
    if (data.apiSecretEncrypted !== undefined)
      updateData.apiSecretEncrypted = data.apiSecretEncrypted;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const provider = await this.prisma.rpcProvider.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.update',
      entityType: 'rpc_provider',
      entityId: id.toString(),
      details: data,
      ipAddress,
    });

    return this.serializeProvider(provider);
  }

  // ─── Nodes ──────────────────────────────────────────────────

  async createNode(
    providerId: number,
    data: {
      chainId: number;
      endpointUrl: string;
      wsEndpointUrl?: string;
      priority?: number;
      weight?: number;
      maxRequestsPerSecond?: number;
      maxRequestsPerMinute?: number;
      timeoutMs?: number;
      healthCheckIntervalS?: number;
      tags?: Record<string, any>;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const provider = await this.prisma.rpcProvider.findUnique({
      where: { id: BigInt(providerId) },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${providerId} not found`);
    }

    const node = await this.prisma.rpcNode.create({
      data: {
        providerId: BigInt(providerId),
        chainId: data.chainId,
        endpointUrl: data.endpointUrl,
        wsEndpointUrl: data.wsEndpointUrl ?? null,
        priority: data.priority ?? 50,
        weight: data.weight ?? 100,
        maxRequestsPerSecond: data.maxRequestsPerSecond ?? 50,
        maxRequestsPerMinute: data.maxRequestsPerMinute ?? 2000,
        timeoutMs: data.timeoutMs ?? 15000,
        healthCheckIntervalS: data.healthCheckIntervalS ?? 30,
        tags: data.tags ?? undefined,
      },
      include: { provider: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_node.create',
      entityType: 'rpc_node',
      entityId: node.id.toString(),
      details: {
        providerId,
        chainId: data.chainId,
        endpointUrl: data.endpointUrl,
      },
      ipAddress,
    });

    this.logger.log(
      `RPC node created for provider ${provider.slug}, chain ${data.chainId} (ID: ${node.id})`,
    );
    return this.serializeNode(node);
  }

  async listNodes(providerId: number) {
    const provider = await this.prisma.rpcProvider.findUnique({
      where: { id: BigInt(providerId) },
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${providerId} not found`);
    }

    const nodes = await this.prisma.rpcNode.findMany({
      where: { providerId: BigInt(providerId) },
      include: { provider: true },
      orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
    });

    return nodes.map((n) => this.serializeNode(n));
  }

  async updateNode(
    nodeId: number,
    data: {
      endpointUrl?: string;
      wsEndpointUrl?: string;
      priority?: number;
      weight?: number;
      maxRequestsPerSecond?: number;
      maxRequestsPerMinute?: number;
      timeoutMs?: number;
      healthCheckIntervalS?: number;
      tags?: Record<string, any>;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.rpcNode.findUnique({
      where: { id: BigInt(nodeId) },
    });
    if (!existing) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    const updateData: any = {};
    if (data.endpointUrl !== undefined) updateData.endpointUrl = data.endpointUrl;
    if (data.wsEndpointUrl !== undefined)
      updateData.wsEndpointUrl = data.wsEndpointUrl;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.weight !== undefined) updateData.weight = data.weight;
    if (data.maxRequestsPerSecond !== undefined)
      updateData.maxRequestsPerSecond = data.maxRequestsPerSecond;
    if (data.maxRequestsPerMinute !== undefined)
      updateData.maxRequestsPerMinute = data.maxRequestsPerMinute;
    if (data.timeoutMs !== undefined) updateData.timeoutMs = data.timeoutMs;
    if (data.healthCheckIntervalS !== undefined)
      updateData.healthCheckIntervalS = data.healthCheckIntervalS;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const node = await this.prisma.rpcNode.update({
      where: { id: BigInt(nodeId) },
      data: updateData,
      include: { provider: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_node.update',
      entityType: 'rpc_node',
      entityId: nodeId.toString(),
      details: data,
      ipAddress,
    });

    return this.serializeNode(node);
  }

  async updateNodeStatus(
    nodeId: number,
    status: string,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.rpcNode.findUnique({
      where: { id: BigInt(nodeId) },
    });
    if (!existing) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    const validStatuses = ['active', 'draining', 'standby', 'unhealthy', 'disabled'];
    if (!validStatuses.includes(status)) {
      throw new ConflictException(
        `Invalid status "${status}". Valid values: ${validStatuses.join(', ')}`,
      );
    }

    // Log the switch
    await this.prisma.providerSwitchLog.create({
      data: {
        chainId: existing.chainId,
        fromNodeId: existing.id,
        toNodeId: existing.id,
        reason: 'manual',
        initiatedBy: adminUserId,
        status: 'completed',
        notes: `Status changed from ${existing.status} to ${status}`,
      },
    });

    const node = await this.prisma.rpcNode.update({
      where: { id: BigInt(nodeId) },
      data: {
        status: status as any,
        // Reset failures when manually activating
        ...(status === 'active'
          ? { consecutiveFailures: 0, healthScore: 100 }
          : {}),
      },
      include: { provider: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_node.status_change',
      entityType: 'rpc_node',
      entityId: nodeId.toString(),
      details: { previousStatus: existing.status, newStatus: status },
      ipAddress,
    });

    this.logger.log(
      `Node ${nodeId} status changed: ${existing.status} -> ${status}`,
    );
    return this.serializeNode(node);
  }

  // ─── Health Dashboard ───────────────────────────────────────

  async getHealthDashboard() {
    const nodes = await this.prisma.rpcNode.findMany({
      where: { isActive: true },
      include: { provider: true },
      orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
    });

    const recentSwitches = await this.prisma.providerSwitchLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    // Group by chain
    const chainSummary: Record<
      number,
      {
        activeNodes: number;
        totalNodes: number;
        avgHealthScore: number;
        nodes: any[];
      }
    > = {};

    for (const node of nodes) {
      if (!chainSummary[node.chainId]) {
        chainSummary[node.chainId] = {
          activeNodes: 0,
          totalNodes: 0,
          avgHealthScore: 0,
          nodes: [],
        };
      }

      const chain = chainSummary[node.chainId];
      chain.totalNodes++;
      if (node.status === 'active') chain.activeNodes++;
      chain.avgHealthScore += Number(node.healthScore);
      chain.nodes.push(this.serializeNode(node));
    }

    // Calculate averages
    for (const chainId of Object.keys(chainSummary)) {
      const chain = chainSummary[Number(chainId)];
      chain.avgHealthScore =
        chain.totalNodes > 0
          ? Math.round((chain.avgHealthScore / chain.totalNodes) * 100) / 100
          : 0;
    }

    return {
      totalNodes: nodes.length,
      activeNodes: nodes.filter((n) => n.status === 'active').length,
      unhealthyNodes: nodes.filter((n) => n.status === 'unhealthy').length,
      drainingNodes: nodes.filter((n) => n.status === 'draining').length,
      chains: chainSummary,
      recentSwitches: recentSwitches.map((s) => ({
        id: s.id.toString(),
        chainId: s.chainId,
        fromNodeId: s.fromNodeId?.toString() ?? null,
        toNodeId: s.toNodeId.toString(),
        reason: s.reason,
        initiatedBy: s.initiatedBy,
        status: s.status,
        notes: s.notes,
        createdAt: s.createdAt,
      })),
    };
  }

  // ─── Serializers ────────────────────────────────────────────

  private serializeProvider(provider: any) {
    return {
      id: provider.id.toString(),
      name: provider.name,
      slug: provider.slug,
      website: provider.website,
      authMethod: provider.authMethod,
      authHeaderName: provider.authHeaderName,
      notes: provider.notes,
      isActive: provider.isActive,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private serializeNode(node: any) {
    return {
      id: node.id.toString(),
      providerId: node.providerId.toString(),
      providerName: node.provider?.name ?? null,
      chainId: node.chainId,
      endpointUrl: node.endpointUrl,
      wsEndpointUrl: node.wsEndpointUrl,
      priority: node.priority,
      weight: node.weight,
      status: node.status,
      maxRequestsPerSecond: node.maxRequestsPerSecond,
      maxRequestsPerMinute: node.maxRequestsPerMinute,
      timeoutMs: node.timeoutMs,
      healthCheckIntervalS: node.healthCheckIntervalS,
      healthScore: Number(node.healthScore),
      consecutiveFailures: node.consecutiveFailures,
      lastHealthCheckAt: node.lastHealthCheckAt,
      lastHealthyAt: node.lastHealthyAt,
      tags: node.tags,
      isActive: node.isActive,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }
}
