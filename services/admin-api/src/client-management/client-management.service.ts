import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';
import { SettingsService } from '../settings/settings.service';
import { Prisma, CustodyPolicy, KytLevel } from '../generated/prisma-client';

@Injectable()
export class ClientManagementService {
  private readonly logger = new Logger(ClientManagementService.name);
  private readonly keyVaultUrl: string;
  private readonly authServiceUrl: string;
  private readonly notificationServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    // Route key operations through core-wallet-service (bridges internal-net → vault-net)
    this.keyVaultUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3005',
    );
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:8000',
    );
    this.notificationServiceUrl = this.configService.get<string>(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
  }

  async createClient(
    data: {
      name: string;
      slug: string;
      email?: string;
      tierId?: number;
      custodyPolicy?: string;
      kytEnabled?: boolean;
      kytLevel?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    // Check slug uniqueness
    const existing = await this.prisma.client.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException(`Client with slug "${data.slug}" already exists`);
    }

    const client = await this.prisma.client.create({
      data: {
        name: data.name,
        slug: data.slug,
        email: data.email ?? null,
        tierId: data.tierId ? BigInt(data.tierId) : null,
        custodyPolicy: (data.custodyPolicy ?? CustodyPolicy.full_custody) as CustodyPolicy,
        kytEnabled: data.kytEnabled ?? false,
        kytLevel: (data.kytLevel ?? KytLevel.basic) as KytLevel,
      },
      include: { tier: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'client.create',
      entityType: 'client',
      entityId: client.id.toString(),
      details: { name: data.name, slug: data.slug },
      ipAddress,
    });

    this.logger.log(`Client created: ${data.slug} (ID: ${client.id})`);

    return this.serializeClient(client);
  }

  async listClients(params: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { slug: { contains: params.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: params.limit,
        include: { tier: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    // Fetch project counts for all returned clients in one query
    let projectCounts: Record<string, number> = {};
    if (items.length > 0) {
      try {
        const clientIds = items.map((c) => c.id);
        const counts = await this.prisma.$queryRaw<Array<{ client_id: bigint; cnt: bigint }>>`
          SELECT client_id, COUNT(*) AS cnt
          FROM cvh_admin.projects
          WHERE client_id IN (${Prisma.join(clientIds)})
          GROUP BY client_id
        `;
        for (const row of counts) {
          projectCounts[row.client_id.toString()] = Number(row.cnt);
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch project counts: ${(err as Error).message}`);
      }
    }

    return {
      items: items.map((c) => ({
        ...this.serializeClient(c),
        projectCount: projectCounts[c.id.toString()] ?? 0,
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getClient(id: number) {
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
      include: { tier: true, overrides: true },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return this.serializeClient(client);
  }

  async updateClient(
    id: number,
    data: {
      name?: string;
      email?: string;
      status?: string;
      tierId?: number;
      custodyPolicy?: string;
      kytEnabled?: boolean;
      kytLevel?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tierId !== undefined) updateData.tierId = BigInt(data.tierId);
    if (data.custodyPolicy !== undefined) updateData.custodyPolicy = data.custodyPolicy;
    if (data.kytEnabled !== undefined) updateData.kytEnabled = data.kytEnabled;
    if (data.kytLevel !== undefined) updateData.kytLevel = data.kytLevel;

    const client = await this.prisma.client.update({
      where: { id: BigInt(id) },
      data: updateData,
      include: { tier: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'client.update',
      entityType: 'client',
      entityId: id.toString(),
      details: data,
      ipAddress,
    });

    return this.serializeClient(client);
  }

  async generateKeys(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    try {
      const response = await axios.post(
        `${this.keyVaultUrl}/keys/generate`,
        { clientId: id },
        {
          timeout: 30000,
          headers: {
            'X-Internal-Service-Key':
              this.configService.get<string>('INTERNAL_SERVICE_KEY', ''),
          },
        },
      );

      await this.auditLog.log({
        adminUserId,
        action: 'client.generate_keys',
        entityType: 'client',
        entityId: id.toString(),
        details: { status: 'success' },
        ipAddress,
      });

      return response.data;
    } catch (err) {
      this.logger.error(
        `Key generation failed for client ${id}: ${(err as Error).message}`,
      );

      await this.auditLog.log({
        adminUserId,
        action: 'client.generate_keys',
        entityType: 'client',
        entityId: id.toString(),
        details: { status: 'failed', error: (err as Error).message },
        ipAddress,
      });

      throw err;
    }
  }

  async getClientKeys(id: number) {
    // Try core-wallet first (may have enriched wallet data)
    try {
      const response = await axios.get(
        `${this.keyVaultUrl}/wallets/${id}`,
        {
          timeout: 10000,
          headers: {
            'X-Internal-Service-Key':
              this.configService.get<string>('INTERNAL_SERVICE_KEY', ''),
          },
        },
      );
      const wallets = response.data?.wallets ?? response.data?.keys ?? [];
      if (wallets.length > 0) return wallets;
    } catch {
      // core-wallet unavailable — continue to DB query
    }

    // Query derived_keys directly from cvh_keyvault
    try {
      const keys = await this.prisma.$queryRaw<any[]>`
        SELECT key_type AS keyType, address, public_key AS publicKey, derivation_path AS derivationPath, chain_scope AS chainScope
        FROM cvh_keyvault.derived_keys
        WHERE client_id = ${BigInt(id)} AND is_active = TRUE
        ORDER BY key_type, chain_scope
      `;
      return keys;
    } catch (dbErr) {
      this.logger.warn(`Failed to query derived_keys: ${(dbErr as Error).message}`);
      return [];
    }
  }

  async getClientSubResource(id: number, resource: string): Promise<any> {
    const clientId = BigInt(id);
    try {
      switch (resource) {
        case 'wallets':
          return this.prisma.$queryRaw<any[]>`
            SELECT w.id, w.chain_id AS chainId, c.name AS chainName, w.address, w.wallet_type AS type, w.status, w.created_at AS createdAt
            FROM cvh_wallets.wallets w
            LEFT JOIN cvh_admin.chains c ON c.chain_id = w.chain_id
            WHERE w.client_id = ${clientId}
            ORDER BY w.chain_id, w.wallet_type
          `;
        case 'forwarders':
          return this.prisma.$queryRaw<any[]>`
            SELECT da.id, da.chain_id AS chainId, c.name AS chainName, da.address, da.label, da.external_id AS externalId, da.status, da.created_at AS createdAt
            FROM cvh_wallets.deposit_addresses da
            LEFT JOIN cvh_admin.chains c ON c.chain_id = da.chain_id
            WHERE da.client_id = ${clientId}
            ORDER BY da.created_at DESC LIMIT 100
          `;
        case 'transactions':
          return this.prisma.$queryRaw<any[]>`
            (SELECT 'deposit' AS type, d.id, d.chain_id AS chainId, d.amount, d.token_symbol AS tokenSymbol, d.status, d.tx_hash AS txHash, d.created_at AS createdAt
             FROM cvh_transactions.deposits d WHERE d.client_id = ${clientId} ORDER BY d.created_at DESC LIMIT 50)
            UNION ALL
            (SELECT 'withdrawal' AS type, w.id, w.chain_id AS chainId, w.amount, '' AS tokenSymbol, w.status, w.tx_hash AS txHash, w.created_at AS createdAt
             FROM cvh_transactions.withdrawals w WHERE w.client_id = ${clientId} ORDER BY w.created_at DESC LIMIT 50)
            ORDER BY createdAt DESC LIMIT 50
          `;
        case 'security': {
          const keys = await this.getClientKeys(id);
          const client = await this.prisma.client.findUnique({ where: { id: clientId } });
          return {
            custodyPolicy: client?.custodyPolicy ?? 'full_custody',
            keysGenerated: keys.length > 0,
            keyCount: keys.length,
            keys,
          };
        }
        case 'webhooks':
          return this.prisma.$queryRaw<any[]>`
            SELECT wh.id, wh.url, wh.events, wh.is_active AS isActive, wh.created_at AS createdAt
            FROM cvh_notifications.webhooks wh
            WHERE wh.client_id = ${clientId}
            ORDER BY wh.created_at DESC
          `;
        case 'projects':
          return this.prisma.$queryRaw<any[]>`
            SELECT p.id, p.name, p.slug, p.description, p.status, p.is_default AS isDefault,
                   p.settings, p.created_at AS createdAt
            FROM cvh_admin.projects p
            WHERE p.client_id = ${clientId}
            ORDER BY p.is_default DESC, p.created_at DESC
          `;
        case 'api-usage':
          return {
            totalRequests24h: 0,
            totalRequests7d: 0,
            totalRequests30d: 0,
            rateLimitHits: 0,
            avgLatencyMs: 0,
            topEndpoints: [],
          };
        default:
          return [];
      }
    } catch (err) {
      this.logger.warn(`Failed to load ${resource} for client ${id}: ${(err as Error).message}`);
      return resource === 'security' || resource === 'api-usage' ? {} : [];
    }
  }

  async inviteClient(id: number, adminUserId: string, ipAddress?: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    if (!client.email) {
      throw new BadRequestException(
        'Client has no email address. Add an email before sending an invite.',
      );
    }

    const internalKey = this.configService.get<string>('INTERNAL_SERVICE_KEY', '');

    // 1. Generate (or reuse) invite token via auth-service
    const authRes = await axios.post(
      `${this.authServiceUrl}/auth/invite/generate`,
      { email: client.email, clientId: id },
      {
        timeout: 10000,
        headers: { 'X-Internal-Service-Key': internalKey },
      },
    );
    const { inviteUrl } = authRes.data as { token: string; inviteUrl: string };

    // 2. Send invite email — try direct SMTP first, fall back to notification-service
    let emailSent = false;
    let emailWarning: string | undefined;

    const smtpResult = await this.settingsService.sendEmail({
      to: client.email,
      subject: `You're invited to CryptoVaultHub — ${client.name}`,
      text: `Hello,\n\nYou have been invited to join CryptoVaultHub as a member of ${client.name}.\n\nClick the link below to complete your registration:\n${inviteUrl}\n\nThis invite link will expire in 48 hours.\n\nBest regards,\nCryptoVaultHub Team`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #10b981; margin-bottom: 8px;">Welcome to CryptoVaultHub</h2>
          <p style="color: #374151; line-height: 1.6;">
            You have been invited to join <strong>${client.name}</strong> on CryptoVaultHub.
          </p>
          <div style="margin: 24px 0;">
            <a href="${inviteUrl}" style="display: inline-block; padding: 12px 28px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
            Or copy this link into your browser:<br/>
            <a href="${inviteUrl}" style="color: #10b981; word-break: break-all;">${inviteUrl}</a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            This invite link will expire in 48 hours.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 11px;">
            CryptoVaultHub &middot; Secure Digital Asset Custody
          </p>
        </div>
      `,
    });

    if (smtpResult.success) {
      emailSent = true;
    } else {
      // SMTP not configured or failed — fall back to notification-service
      this.logger.warn(
        `Direct SMTP failed for client ${id} invite: ${smtpResult.error}. Falling back to notification-service.`,
      );

      try {
        await axios.post(
          `${this.notificationServiceUrl}/email/invite`,
          {
            to: client.email,
            clientId: id,
            inviteUrl,
            orgName: client.name,
          },
          {
            timeout: 10000,
            headers: { 'X-Internal-Service-Key': internalKey },
          },
        );
        emailSent = true;
      } catch (err: any) {
        this.logger.warn(
          `Invite email queue also failed for client ${id}: ${err.message}`,
        );
        emailWarning =
          'SMTP is not configured and the notification service is unavailable. The invite URL was generated but no email was sent.';
      }
    }

    await this.auditLog.log({
      adminUserId,
      action: emailSent ? 'client.invite_sent' : 'client.invite_queued',
      entityType: 'client',
      entityId: id.toString(),
      details: {
        email: client.email,
        emailSent,
        ...(emailWarning ? { warning: emailWarning } : {}),
      },
      ipAddress,
    });

    return {
      inviteUrl,
      emailSent,
      ...(emailWarning ? { warning: emailWarning } : {}),
    };
  }

  async requestClientDeletion(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    if (client.status === 'deleted') {
      throw new ConflictException(`Client ${id} is already deleted`);
    }
    if (client.status === 'pending_deletion') {
      throw new ConflictException(`Client ${id} already has a pending deletion`);
    }

    // Check if the client has any transactions (deposits or withdrawals)
    const [deposits, withdrawals] = await Promise.all([
      this.prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM cvh_transactions.deposits WHERE client_id = ${BigInt(id)}
      `,
      this.prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM cvh_transactions.withdrawals WHERE client_id = ${BigInt(id)}
      `,
    ]);

    const depositCount = Number(deposits[0]?.cnt ?? 0);
    const withdrawalCount = Number(withdrawals[0]?.cnt ?? 0);
    const transactionCount = depositCount + withdrawalCount;

    if (transactionCount === 0) {
      // Immediate soft-delete — no transactions
      await this.prisma.client.update({
        where: { id: BigInt(id) },
        data: {
          status: 'deleted',
          deletionRequestedAt: new Date(),
          deletionRequestedBy: BigInt(adminUserId),
        },
      });

      await this.auditLog.log({
        adminUserId,
        action: 'client.deleted',
        entityType: 'client',
        entityId: id.toString(),
        details: { immediate: true, transactionCount: 0 },
        ipAddress,
      });

      this.logger.log(`Client ${id} deleted immediately (no transactions)`);

      return { immediate: true, deleted: true };
    }

    // Grace period — has transactions
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.client.update({
      where: { id: BigInt(id) },
      data: {
        status: 'pending_deletion',
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor,
        deletionRequestedBy: BigInt(adminUserId),
      },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'client.deletion_scheduled',
      entityType: 'client',
      entityId: id.toString(),
      details: {
        immediate: false,
        transactionCount,
        scheduledFor: scheduledFor.toISOString(),
      },
      ipAddress,
    });

    this.logger.log(
      `Client ${id} scheduled for deletion on ${scheduledFor.toISOString()} (${transactionCount} transactions)`,
    );

    return {
      immediate: false,
      scheduledFor: scheduledFor.toISOString(),
      transactionCount,
    };
  }

  async cancelDeletion(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(id) },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    if (client.status !== 'pending_deletion') {
      throw new BadRequestException(
        `Client ${id} is not pending deletion (current status: ${client.status})`,
      );
    }

    await this.prisma.client.update({
      where: { id: BigInt(id) },
      data: {
        status: 'active',
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        deletionRequestedBy: null,
      },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'client.deletion_cancelled',
      entityType: 'client',
      entityId: id.toString(),
      details: {
        previousScheduledFor: client.deletionScheduledFor?.toISOString() ?? null,
      },
      ipAddress,
    });

    this.logger.log(`Client ${id} deletion cancelled, status restored to active`);

    return { status: 'active' };
  }

  async getProjectChains(projectId: number) {
    try {
      return await this.prisma.$queryRaw<any[]>`
        SELECT pc.id, pc.chain_id AS chainId, c.name AS chainName,
               pc.deploy_status AS deployStatus, pc.hot_wallet_address AS hotWalletAddress,
               pc.wallet_factory_address AS walletFactoryAddress,
               pc.forwarder_factory_address AS forwarderFactoryAddress,
               pc.deploy_completed_at AS deployCompletedAt
        FROM cvh_wallets.project_chains pc
        LEFT JOIN cvh_admin.chains c ON c.chain_id = pc.chain_id
        WHERE pc.project_id = ${BigInt(projectId)}
      `;
    } catch (err) {
      this.logger.warn(`Failed to load chains for project ${projectId}: ${(err as Error).message}`);
      return [];
    }
  }

  private serializeClient(client: any) {
    return {
      id: client.id.toString(),
      name: client.name,
      slug: client.slug,
      email: client.email ?? null,
      status: client.status,
      tierId: client.tierId?.toString() ?? null,
      custodyPolicy: client.custodyPolicy,
      kytEnabled: client.kytEnabled,
      kytLevel: client.kytLevel,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      deletionRequestedAt: client.deletionRequestedAt ?? null,
      deletionScheduledFor: client.deletionScheduledFor ?? null,
      deletionRequestedBy: client.deletionRequestedBy?.toString() ?? null,
      tier: client.tier
        ? {
            id: client.tier.id.toString(),
            name: client.tier.name,
          }
        : null,
      overrides: client.overrides?.map((o: any) => ({
        id: o.id.toString(),
        overrideKey: o.overrideKey,
        overrideValue: o.overrideValue,
        overrideType: o.overrideType,
      })),
    };
  }
}
