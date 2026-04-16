import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';
import { CustodyPolicy, KytLevel } from '../generated/prisma-client';

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

    return {
      items: items.map((c) => this.serializeClient(c)),
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

    // 1. Generate invite token via auth-service
    const authRes = await axios.post(
      `${this.authServiceUrl}/auth/invite/generate`,
      { email: client.email, clientId: id },
      {
        timeout: 10000,
        headers: { 'X-Internal-Service-Key': internalKey },
      },
    );
    const { inviteUrl } = authRes.data as { token: string; inviteUrl: string };

    // 2. Queue invite email via notification-service (fire and forget)
    axios
      .post(
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
      )
      .catch((err: Error) =>
        this.logger.warn(`Invite email queue failed for client ${id}: ${err.message}`),
      );

    await this.auditLog.log({
      adminUserId,
      action: 'client.invite_queued',
      entityType: 'client',
      entityId: id.toString(),
      details: { email: client.email },
      ipAddress,
    });

    return { inviteUrl };
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
