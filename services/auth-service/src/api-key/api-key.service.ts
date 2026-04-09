import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface ApiKeyResult {
  id: string;
  key: string; // Only returned on creation, never again
  prefix: string;
  clientId: number;
  scopes: string[];
  label?: string;
  expiresAt?: Date;
}

export interface ApiKeyValidation {
  valid: boolean;
  clientId?: number;
  scopes?: string[];
  ipAllowlist?: string[];
  allowedChains?: number[];
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new API key for a client.
   * The raw key is returned only once at creation time.
   */
  async createApiKey(
    clientId: number,
    scopes: string[] = ['read'],
    options?: {
      ipAllowlist?: string[];
      allowedChains?: number[];
      label?: string;
      expiresAt?: string;
    },
  ): Promise<ApiKeyResult> {
    const raw = randomBytes(32).toString('base64url');
    const key = `cvh_live_${raw}`;
    const prefix = `cvh_live_${raw.slice(0, 8)}`;
    const hash = createHash('sha256').update(key).digest('hex');

    const apiKey = await this.prisma.apiKey.create({
      data: {
        clientId: BigInt(clientId),
        keyPrefix: prefix,
        keyHash: hash,
        scopes: scopes,
        ipAllowlist: options?.ipAllowlist ?? undefined,
        allowedChains: options?.allowedChains ?? undefined,
        label: options?.label ?? null,
        expiresAt: options?.expiresAt
          ? new Date(options.expiresAt)
          : null,
      },
    });

    this.logger.log(
      `API key created for client ${clientId}: ${prefix}...`,
    );

    return {
      id: apiKey.id.toString(),
      key, // Only returned this once!
      prefix,
      clientId,
      scopes,
      label: options?.label,
      expiresAt: apiKey.expiresAt ?? undefined,
    };
  }

  /**
   * List all active API keys for a client (masked).
   */
  async listApiKeys(clientId: number) {
    const keys = await this.prisma.apiKey.findMany({
      where: {
        clientId: BigInt(clientId),
        isActive: true,
      },
      select: {
        id: true,
        keyPrefix: true,
        scopes: true,
        ipAllowlist: true,
        allowedChains: true,
        label: true,
        expiresAt: true,
        lastUsedAt: true,
        usageCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      ...k,
      id: k.id.toString(),
      usageCount: Number(k.usageCount),
    }));
  }

  /**
   * Revoke (soft-delete) an API key.
   */
  async revokeApiKey(keyId: number): Promise<void> {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: BigInt(keyId) },
    });
    if (!key) {
      throw new NotFoundException(`API key ${keyId} not found`);
    }

    await this.prisma.apiKey.update({
      where: { id: BigInt(keyId) },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log(`API key ${keyId} (${key.keyPrefix}...) revoked`);
  }

  /**
   * Validate an API key. Used by Kong gateway for request authentication.
   */
  async validateApiKey(
    apiKey: string,
    requestIp?: string,
  ): Promise<ApiKeyValidation> {
    const hash = createHash('sha256').update(apiKey).digest('hex');

    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hash },
    });

    if (!key || !key.isActive) {
      return { valid: false };
    }

    // Check expiration
    if (key.expiresAt && key.expiresAt < new Date()) {
      return { valid: false };
    }

    // Check IP allowlist
    if (key.ipAllowlist && requestIp) {
      const allowlist = key.ipAllowlist as string[];
      if (allowlist.length > 0 && !allowlist.includes(requestIp)) {
        this.logger.warn(
          `API key ${key.keyPrefix} rejected: IP ${requestIp} not in allowlist`,
        );
        return { valid: false };
      }
    }

    // Update usage stats (fire-and-forget)
    this.prisma.apiKey
      .update({
        where: { id: key.id },
        data: {
          lastUsedAt: new Date(),
          lastUsedIp: requestIp ?? null,
          usageCount: { increment: 1 },
        },
      })
      .catch((err) => {
        this.logger.error('Failed to update API key usage', err);
      });

    return {
      valid: true,
      clientId: Number(key.clientId),
      scopes: key.scopes as string[],
      ipAllowlist: key.ipAllowlist as string[] | undefined,
      allowedChains: key.allowedChains as number[] | undefined,
    };
  }
}
