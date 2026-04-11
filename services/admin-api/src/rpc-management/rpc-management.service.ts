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
 */
@Injectable()
export class RpcManagementService {
  private readonly logger = new Logger(RpcManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Encrypts a plaintext secret using AES-256-GCM.
   * Format: iv_hex:auth_tag_hex:ciphertext_hex
   */
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

  /**
   * Decrypts an AES-256-GCM encrypted secret.
   * Only used internally when forwarding keys to chain-indexer-service.
   */
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
    // HIGH-2: Encrypt the API key before storing
    const encryptedApiKey = data.apiKeyEncrypted
      ? this.encryptSecret(data.apiKeyEncrypted)
      : null;

    const provider = await (this.prisma as any).rpcProvider.create({
      data: {
        name: data.name,
        chainId: data.chainId,
        rpcHttpUrl: data.rpcHttpUrl,
        rpcWsUrl: data.rpcWsUrl ?? null,
        apiKeyEncrypted: encryptedApiKey,
        priority: data.priority ?? 0,
        isActive: data.isActive ?? true,
      },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.create',
      entityType: 'rpc_provider',
      entityId: provider.id.toString(),
      details: { name: data.name, chainId: data.chainId },
      ipAddress,
    });

    this.logger.log(`RPC provider created: ${data.name} (chain ${data.chainId})`);

    // Never return the decrypted API key in API responses
    return {
      id: provider.id.toString(),
      name: provider.name,
      chainId: provider.chainId,
      rpcHttpUrl: provider.rpcHttpUrl,
      rpcWsUrl: provider.rpcWsUrl,
      hasApiKey: !!encryptedApiKey,
      priority: provider.priority,
      isActive: provider.isActive,
      createdAt: provider.createdAt,
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
    const existing = await (this.prisma as any).rpcProvider.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`RPC provider ${id} not found`);
    }

    // HIGH-2: Encrypt the API key before storing
    const updateData: any = { ...data };
    if (data.apiKeyEncrypted !== undefined) {
      updateData.apiKeyEncrypted = data.apiKeyEncrypted
        ? this.encryptSecret(data.apiKeyEncrypted)
        : null;
    }

    const provider = await (this.prisma as any).rpcProvider.update({
      where: { id },
      data: updateData,
    });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.update',
      entityType: 'rpc_provider',
      entityId: id.toString(),
      details: { updatedFields: Object.keys(data) },
      ipAddress,
    });

    // Never return the decrypted API key in API responses
    return {
      id: provider.id.toString(),
      name: provider.name,
      chainId: provider.chainId,
      rpcHttpUrl: provider.rpcHttpUrl,
      rpcWsUrl: provider.rpcWsUrl,
      hasApiKey: !!provider.apiKeyEncrypted,
      priority: provider.priority,
      isActive: provider.isActive,
    };
  }

  async listRpcProviders() {
    const providers = await (this.prisma as any).rpcProvider.findMany({
      orderBy: [{ chainId: 'asc' }, { priority: 'desc' }],
    });

    // Never return the decrypted API key in API responses
    return providers.map((p: any) => ({
      id: p.id.toString(),
      name: p.name,
      chainId: p.chainId,
      rpcHttpUrl: p.rpcHttpUrl,
      rpcWsUrl: p.rpcWsUrl,
      hasApiKey: !!p.apiKeyEncrypted,
      priority: p.priority,
      isActive: p.isActive,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Internal-only: Returns decrypted RPC config for internal services
   * (e.g., chain-indexer-service). Never exposed via API responses.
   */
  async getDecryptedRpcConfig(chainId: number) {
    const providers = await (this.prisma as any).rpcProvider.findMany({
      where: { chainId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    return providers.map((p: any) => ({
      id: p.id.toString(),
      name: p.name,
      rpcHttpUrl: p.rpcHttpUrl,
      rpcWsUrl: p.rpcWsUrl,
      apiKey: p.apiKeyEncrypted ? this.decryptSecret(p.apiKeyEncrypted) : null,
      priority: p.priority,
    }));
  }

  async deleteRpcProvider(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await (this.prisma as any).rpcProvider.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`RPC provider ${id} not found`);
    }

    await (this.prisma as any).rpcProvider.delete({ where: { id } });

    await this.auditLog.log({
      adminUserId,
      action: 'rpc_provider.delete',
      entityType: 'rpc_provider',
      entityId: id.toString(),
      details: { name: existing.name, chainId: existing.chainId },
      ipAddress,
    });

    this.logger.log(`RPC provider deleted: ${existing.name} (id ${id})`);
    return { success: true, message: 'RPC provider deleted' };
  }
}
