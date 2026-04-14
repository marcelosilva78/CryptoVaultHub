import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

/**
 * HIGH-2: RPC provider API keys are encrypted at rest using AES-256-GCM.
 * The encryption key is derived from the first 32 bytes (64 hex chars)
 * of the INTERNAL_SERVICE_KEY environment variable.
 * Decrypted keys are NEVER returned in API responses.
 *
 * Data model: RpcProvider (name/credentials) + RpcNode (chain/endpoint).
 * The API exposes a unified "provider" object composed from both, keyed by
 * RpcNode.id so each chain endpoint has its own addressable resource.
 */
@Injectable()
export class RpcManagementService {
  private readonly logger = new Logger(RpcManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  private encryptSecret(plaintext: string): string {
    const key = Buffer.from(
      this.configService.get<string>('INTERNAL_SERVICE_KEY', '').slice(0, 64),
      'hex',
    );
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptSecret(ciphertext: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const key = Buffer.from(
      this.configService.get<string>('INTERNAL_SERVICE_KEY', '').slice(0, 64),
      'hex',
    );
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return (
      decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') +
      decipher.final('utf8')
    );
  }

  async createRpcProvider(
    data: {
      name: string;
      chainId: number;
      rpcHttpUrl: string;
      rpcWsUrl?: string;
      apiKeyEncrypted?: string;
      priority?: number;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const encryptedApiKey = data.apiKeyEncrypted
      ? this.encryptSecret(data.apiKeyEncrypted)
      : null;

    // Auto-generate unique slug from name
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

    const node = await this.prisma.$transaction(async (tx) => {
      const provider = await tx.rpcProvider.create({
        data: {
          name: data.name,
          slug,
          apiKeyEncrypted: encryptedApiKey,
          isActive: data.isActive ?? true,
        },
      });
      return tx.rpcNode.create({
        data: {
          providerId: provider.id,
          chainId: data.chainId,
          endpointUrl: data.rpcHttpUrl,
          wsEndpointUrl: data.rpcWsUrl ?? null,
          priority: data.priority ?? 50,
          isActive: data.isActive ?? true,
          providerType: (data as any).providerType ?? 'custom',
          authMethodType: (data as any).authMethod ?? 'url_path',
          nodeType: (data as any).nodeType ?? null,
          maxRequestsPerSecond: (data as any).maxRequestsPerSecond ?? null,
          maxRequestsPerMinute: (data as any).maxRequestsPerMinute ?? null,
          maxRequestsPerDay: (data as any).maxRequestsPerDay ?? null,
          maxRequestsPerMonth: (data as any).maxRequestsPerMonth ?? null,
        },
        include: { provider: true },
      });
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.create',
      entityType: 'rpc_provider',
      entityId: node.id.toString(),
      details: { name: data.name, chainId: data.chainId },
      ipAddress,
    });

    this.logger.log(`RPC provider created: ${data.name} (chain ${data.chainId})`);

    return {
      id: node.id.toString(),
      name: node.provider.name,
      chainId: node.chainId,
      rpcHttpUrl: node.endpointUrl,
      rpcWsUrl: node.wsEndpointUrl,
      hasApiKey: !!encryptedApiKey,
      priority: node.priority,
      isActive: node.isActive,
      createdAt: node.createdAt,
    };
  }

  async updateRpcProvider(
    id: number,
    data: {
      name?: string;
      rpcHttpUrl?: string;
      rpcWsUrl?: string;
      apiKeyEncrypted?: string;
      priority?: number;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const node = await this.prisma.rpcNode.findUnique({
      where: { id: BigInt(id) },
      include: { provider: true },
    });
    if (!node) {
      throw new NotFoundException(`RPC provider ${id} not found`);
    }

    // Update node fields
    const nodeData: any = {};
    if (data.rpcHttpUrl !== undefined) nodeData.endpointUrl = data.rpcHttpUrl;
    if (data.rpcWsUrl !== undefined) nodeData.wsEndpointUrl = data.rpcWsUrl;
    if (data.priority !== undefined) nodeData.priority = data.priority;
    if (data.isActive !== undefined) nodeData.isActive = data.isActive;

    const updatedNode = await this.prisma.rpcNode.update({
      where: { id: BigInt(id) },
      data: nodeData,
      include: { provider: true },
    });

    // Update provider fields if any
    const providerData: any = {};
    if (data.name !== undefined) providerData.name = data.name;
    if (data.apiKeyEncrypted !== undefined) {
      providerData.apiKeyEncrypted = data.apiKeyEncrypted
        ? this.encryptSecret(data.apiKeyEncrypted)
        : null;
    }
    if (Object.keys(providerData).length > 0) {
      await this.prisma.rpcProvider.update({
        where: { id: node.providerId },
        data: providerData,
      });
    }

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.update',
      entityType: 'rpc_provider',
      entityId: id.toString(),
      details: { updatedFields: Object.keys(data) },
      ipAddress,
    });

    return {
      id: updatedNode.id.toString(),
      name: updatedNode.provider.name,
      chainId: updatedNode.chainId,
      rpcHttpUrl: updatedNode.endpointUrl,
      rpcWsUrl: updatedNode.wsEndpointUrl,
      hasApiKey: !!updatedNode.provider.apiKeyEncrypted,
      priority: updatedNode.priority,
      isActive: updatedNode.isActive,
      providerType: updatedNode.providerType ?? 'custom',
      authMethod: updatedNode.authMethodType ?? 'none',
      nodeType: updatedNode.nodeType ?? null,
      maxRequestsPerSecond: updatedNode.maxRequestsPerSecond,
      maxRequestsPerMinute: updatedNode.maxRequestsPerMinute,
      maxRequestsPerDay: updatedNode.maxRequestsPerDay,
      maxRequestsPerMonth: updatedNode.maxRequestsPerMonth,
    };
  }

  async listRpcProviders() {
    const nodes = await this.prisma.rpcNode.findMany({
      include: { provider: true },
      orderBy: [{ chainId: 'asc' }, { priority: 'desc' }],
    });

    return nodes.map((node) => ({
      id: node.id.toString(),
      name: node.provider.name,
      chainId: node.chainId,
      rpcHttpUrl: node.endpointUrl,
      rpcWsUrl: node.wsEndpointUrl,
      hasApiKey: !!node.provider.apiKeyEncrypted,
      priority: node.priority,
      isActive: node.isActive,
      createdAt: node.createdAt,
      providerType: node.providerType ?? 'custom',
      authMethod: node.authMethodType ?? 'none',
      nodeType: node.nodeType ?? null,
      maxRequestsPerSecond: node.maxRequestsPerSecond,
      maxRequestsPerMinute: node.maxRequestsPerMinute,
      maxRequestsPerDay: node.maxRequestsPerDay,
      maxRequestsPerMonth: node.maxRequestsPerMonth,
      healthScore: node.healthScore ? Number(node.healthScore) : null,
      quotaStatus: node.quotaStatus ?? 'available',
    }));
  }

  /**
   * Internal-only: Returns decrypted RPC config for internal services
   * (e.g., chain-indexer-service). Never exposed via API responses.
   */
  async getDecryptedRpcConfig(chainId: number) {
    const nodes = await this.prisma.rpcNode.findMany({
      where: { chainId, isActive: true },
      include: { provider: true },
      orderBy: { priority: 'desc' },
    });

    return nodes.map((node) => ({
      id: node.id.toString(),
      name: node.provider.name,
      rpcHttpUrl: node.endpointUrl,
      rpcWsUrl: node.wsEndpointUrl,
      apiKey: node.provider.apiKeyEncrypted
        ? this.decryptSecret(node.provider.apiKeyEncrypted)
        : null,
      priority: node.priority,
    }));
  }

  async deleteRpcProvider(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const node = await this.prisma.rpcNode.findUnique({
      where: { id: BigInt(id) },
      include: { provider: true },
    });
    if (!node) {
      throw new NotFoundException(`RPC provider ${id} not found`);
    }

    await this.prisma.rpcNode.delete({ where: { id: BigInt(id) } });

    // Clean up provider if it has no remaining nodes
    const remaining = await this.prisma.rpcNode.count({
      where: { providerId: node.providerId },
    });
    if (remaining === 0) {
      await this.prisma.rpcProvider.delete({ where: { id: node.providerId } });
    }

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.delete',
      entityType: 'rpc_provider',
      entityId: id.toString(),
      details: { name: node.provider.name, chainId: node.chainId },
      ipAddress,
    });

    this.logger.log(`RPC provider deleted: ${node.provider.name} (id ${id})`);
    return { success: true, message: 'RPC provider deleted' };
  }
}
