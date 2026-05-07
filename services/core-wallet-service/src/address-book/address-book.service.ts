import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AddressBookService {
  private readonly logger = new Logger(AddressBookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listAddresses(
    clientId: number,
    params: { page?: number; limit?: number; chainId?: number },
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      clientId: BigInt(clientId),
      status: { not: 'disabled' },
    };
    if (params.chainId) where.chainId = params.chainId;

    const [addresses, total] = await Promise.all([
      this.prisma.whitelistedAddress.findMany({
        where,
        orderBy: { label: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.whitelistedAddress.count({ where }),
    ]);

    return {
      addresses: addresses.map((a) => this.serialize(a)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async addAddress(data: {
    clientId: number;
    address: string;
    label?: string;
    chainId?: number;
    notes?: string;
  }) {
    const clientIdBig = BigInt(data.clientId);
    const chainId = data.chainId ?? 1;

    // Check for existing active/cooldown entry for the same address+chain
    const existing = await this.prisma.whitelistedAddress.findFirst({
      where: {
        clientId: clientIdBig,
        address: data.address,
        chainId,
        status: { in: ['active', 'cooldown'] },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Address+chain combination already exists and is active or in cooldown',
      );
    }

    const cooldownEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const created = await this.prisma.whitelistedAddress.create({
      data: {
        clientId: clientIdBig,
        address: data.address,
        label: data.label ?? '',
        chainId,
        status: 'cooldown',
        cooldownEndsAt,
      },
    });

    this.logger.log(
      `Address ${data.address} (chain ${chainId}) added for client ${data.clientId}`,
    );

    return { address: this.serialize(created) };
  }

  async updateAddress(
    id: string,
    data: { label?: string; notes?: string; clientId?: number },
  ) {
    const record = await this.prisma.whitelistedAddress.findUnique({
      where: { id: BigInt(id) },
    });
    if (!record || record.status === 'disabled') {
      throw new NotFoundException(`Address ${id} not found`);
    }

    const updated = await this.prisma.whitelistedAddress.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
      },
    });

    return { address: this.serialize(updated) };
  }

  async deleteAddress(id: string, clientId?: number) {
    const record = await this.prisma.whitelistedAddress.findUnique({
      where: { id: BigInt(id) },
    });
    if (!record || record.status === 'disabled') {
      throw new NotFoundException(`Address ${id} not found or already disabled`);
    }
    if (clientId && record.clientId !== BigInt(clientId)) {
      throw new NotFoundException(`Address ${id} not found`);
    }

    await this.prisma.whitelistedAddress.update({
      where: { id: BigInt(id) },
      data: { status: 'disabled' },
    });

    this.logger.log(`Address ${id} disabled for client ${record.clientId}`);
    return { success: true, message: 'Address disabled' };
  }

  private serialize(a: {
    id: bigint;
    clientId: bigint;
    address: string;
    label: string;
    chainId: number;
    status: string;
    cooldownEndsAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: a.id.toString(),
      clientId: Number(a.clientId),
      address: a.address,
      label: a.label,
      chainId: a.chainId,
      status: a.status,
      cooldownExpiresAt: a.cooldownEndsAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
