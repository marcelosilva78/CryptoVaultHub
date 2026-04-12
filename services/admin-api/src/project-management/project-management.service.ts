import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class ProjectManagementService {
  private readonly logger = new Logger(ProjectManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(
    data: {
      clientId: number;
      name: string;
      slug: string;
      description?: string;
      isDefault?: boolean;
      settings?: Record<string, unknown>;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    // Validate client exists
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(data.clientId) },
    });
    if (!client) {
      throw new NotFoundException(`Client ${data.clientId} not found`);
    }

    // Check slug uniqueness within client
    const existing = await this.prisma.project.findUnique({
      where: {
        uq_client_slug: {
          clientId: BigInt(data.clientId),
          slug: data.slug,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Project with slug "${data.slug}" already exists for client ${data.clientId}`,
      );
    }

    const project = await this.prisma.$transaction(async (tx) => {
      // If isDefault, unset other defaults for this client
      if (data.isDefault) {
        await tx.project.updateMany({
          where: { clientId: BigInt(data.clientId), isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.project.create({
        data: {
          clientId: BigInt(data.clientId),
          name: data.name,
          slug: data.slug,
          description: data.description ?? null,
          isDefault: data.isDefault ?? false,
          settings: data.settings ? (data.settings as any) : undefined,
        },
        include: { client: true },
      });
    });

    await this.auditLog.log({
      adminUserId,
      action: 'project.create',
      entityType: 'project',
      entityId: project.id.toString(),
      details: { clientId: data.clientId, name: data.name, slug: data.slug },
      ipAddress,
    });

    this.logger.log(
      `Project created: ${data.slug} (ID: ${project.id}) for client ${data.clientId}`,
    );

    return this.serializeProject(project);
  }

  async findAll(params: {
    clientId?: number;
    page: number;
    limit: number;
    status?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.clientId) {
      where.clientId = BigInt(params.clientId);
    }
    if (params.status) {
      where.status = params.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: params.limit,
        include: { client: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      items: items.map((p) => this.serializeProject(p)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async findById(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: BigInt(id) },
      include: { client: true },
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return this.serializeProject(project);
  }

  async update(
    id: number,
    data: {
      name?: string;
      description?: string;
      status?: string;
      settings?: Record<string, unknown>;
      custodyMode?: string | null;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.project.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    // Validate custodyMode: only allowed when client policy is self_managed
    if (data.custodyMode !== undefined) {
      const client = await this.prisma.client.findUnique({
        where: { id: existing.clientId },
      });
      if (!client) {
        throw new NotFoundException(
          `Client ${existing.clientId} not found for project ${id}`,
        );
      }
      if (client.custodyPolicy !== 'self_managed') {
        throw new BadRequestException(
          'custodyMode can only be set on projects whose client has custodyPolicy = self_managed',
        );
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.settings !== undefined) updateData.settings = data.settings;
    if (data.custodyMode !== undefined) updateData.custodyMode = data.custodyMode ?? null;

    const project = await this.prisma.project.update({
      where: { id: BigInt(id) },
      data: updateData,
      include: { client: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'project.update',
      entityType: 'project',
      entityId: id.toString(),
      details: data,
      ipAddress,
    });

    return this.serializeProject(project);
  }

  async archive(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.project.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    if (existing.isDefault) {
      throw new BadRequestException(
        'Cannot archive the default project. Set another project as default first.',
      );
    }

    const project = await this.prisma.project.update({
      where: { id: BigInt(id) },
      data: { status: 'archived' },
      include: { client: true },
    });

    await this.auditLog.log({
      adminUserId,
      action: 'project.archive',
      entityType: 'project',
      entityId: id.toString(),
      details: { previousStatus: existing.status },
      ipAddress,
    });

    this.logger.log(`Project archived: ID ${id}`);

    return this.serializeProject(project);
  }

  async setDefault(
    id: number,
    adminUserId: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.project.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    if (existing.status === 'archived') {
      throw new BadRequestException(
        'Cannot set an archived project as default.',
      );
    }

    const project = await this.prisma.$transaction(async (tx) => {
      // Unset current default for this client
      await tx.project.updateMany({
        where: { clientId: existing.clientId, isDefault: true },
        data: { isDefault: false },
      });

      // Set the new default
      return tx.project.update({
        where: { id: BigInt(id) },
        data: { isDefault: true },
        include: { client: true },
      });
    });

    await this.auditLog.log({
      adminUserId,
      action: 'project.set_default',
      entityType: 'project',
      entityId: id.toString(),
      details: { clientId: existing.clientId.toString() },
      ipAddress,
    });

    this.logger.log(
      `Project ${id} set as default for client ${existing.clientId}`,
    );

    return this.serializeProject(project);
  }

  private serializeProject(project: any) {
    return {
      id: project.id.toString(),
      clientId: project.clientId.toString(),
      name: project.name,
      slug: project.slug,
      description: project.description,
      isDefault: project.isDefault,
      status: project.status,
      settings: project.settings,
      custodyMode: project.custodyMode ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      client: project.client
        ? {
            id: project.client.id.toString(),
            name: project.client.name,
            slug: project.client.slug,
          }
        : null,
    };
  }
}
