import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateFlushDto {
  clientId: number;
  projectId: number;
  chainId: number;
  operationType: 'flush_tokens' | 'sweep_native';
  walletId: number;
  addresses: number[]; // deposit_address IDs
  tokenId?: number;
  mode?: 'manual' | 'automated' | 'batch';
  triggerType?: 'user' | 'system' | 'scheduled';
  triggeredBy?: number;
  isDryRun?: boolean;
  filters?: Record<string, unknown>;
}

export interface FlushOperationResult {
  id: number;
  operationUid: string;
  status: string;
  operationType: string;
  totalAddresses: number;
  isDryRun: boolean;
  createdAt: Date;
}

/**
 * ManualFlushService: create flush operations, validate addresses.
 * Coordinates with FlushOrchestrator for actual execution.
 */
@Injectable()
export class FlushService {
  private readonly logger = new Logger(FlushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a flush operation and its items.
   */
  async createFlushOperation(dto: CreateFlushDto): Promise<FlushOperationResult> {
    // Validate wallet exists and belongs to the client
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        id: BigInt(dto.walletId),
        clientId: BigInt(dto.clientId),
      },
    });
    if (!wallet) {
      throw new NotFoundException(
        `Wallet ${dto.walletId} not found for client ${dto.clientId}`,
      );
    }

    // Validate the token if flush_tokens
    if (dto.operationType === 'flush_tokens' && !dto.tokenId) {
      throw new BadRequestException(
        'tokenId is required for flush_tokens operation',
      );
    }

    // Validate deposit addresses exist and belong to the client
    const depositAddresses = await this.prisma.depositAddress.findMany({
      where: {
        id: { in: dto.addresses.map((a) => BigInt(a)) },
        clientId: BigInt(dto.clientId),
        chainId: dto.chainId,
      },
    });
    if (depositAddresses.length === 0) {
      throw new BadRequestException(
        'No valid deposit addresses found for the given IDs, client, and chain',
      );
    }
    if (depositAddresses.length !== dto.addresses.length) {
      this.logger.warn(
        `Flush requested ${dto.addresses.length} addresses but only ${depositAddresses.length} matched for client ${dto.clientId} on chain ${dto.chainId}`,
      );
    }

    const operationUid = `flush_${randomUUID().replace(/-/g, '')}`;

    // Create the operation and items in a transaction
    const operation = await this.prisma.$transaction(async (tx) => {
      const op = await tx.flushOperation.create({
        data: {
          operationUid,
          clientId: BigInt(dto.clientId),
          projectId: BigInt(dto.projectId),
          chainId: dto.chainId,
          operationType: dto.operationType,
          mode: dto.mode ?? 'manual',
          triggerType: dto.triggerType ?? 'user',
          triggeredBy: dto.triggeredBy ? BigInt(dto.triggeredBy) : null,
          isDryRun: dto.isDryRun ?? false,
          status: 'pending',
          tokenId: dto.tokenId ? BigInt(dto.tokenId) : null,
          walletId: BigInt(dto.walletId),
          totalAddresses: depositAddresses.length,
          filtersApplied: dto.filters ?? null,
        },
      });

      // Create flush items
      await tx.flushItem.createMany({
        data: depositAddresses.map((da) => ({
          operationId: op.id,
          depositAddressId: da.id,
          address: da.address,
          status: 'pending',
          tokenId: dto.tokenId ? BigInt(dto.tokenId) : null,
        })),
      });

      return op;
    });

    this.logger.log(
      `Flush operation ${operationUid} created with ${depositAddresses.length} addresses for client ${dto.clientId} on chain ${dto.chainId}`,
    );

    return {
      id: Number(operation.id),
      operationUid: operation.operationUid,
      status: operation.status,
      operationType: operation.operationType,
      totalAddresses: operation.totalAddresses,
      isDryRun: operation.isDryRun,
      createdAt: operation.createdAt,
    };
  }

  /**
   * List flush operations for a client/project.
   */
  async listOperations(
    clientId: number,
    params: {
      projectId?: number;
      status?: string;
      chainId?: number;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      clientId: BigInt(clientId),
    };
    if (params.projectId) where.projectId = BigInt(params.projectId);
    if (params.status) where.status = params.status;
    if (params.chainId) where.chainId = params.chainId;

    const [operations, total] = await Promise.all([
      this.prisma.flushOperation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.flushOperation.count({ where }),
    ]);

    return {
      operations: operations.map((op) => this.serializeOperation(op)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get a single operation with its items.
   */
  async getOperation(clientId: number, operationId: number) {
    const operation = await this.prisma.flushOperation.findFirst({
      where: {
        id: BigInt(operationId),
        clientId: BigInt(clientId),
      },
      include: { items: true },
    });
    if (!operation) {
      throw new NotFoundException(
        `Flush operation ${operationId} not found`,
      );
    }

    return {
      ...this.serializeOperation(operation),
      items: operation.items.map((item) => ({
        id: Number(item.id),
        depositAddressId: Number(item.depositAddressId),
        address: item.address,
        status: item.status,
        tokenId: item.tokenId ? Number(item.tokenId) : null,
        amountBefore: item.amountBefore?.toString() ?? null,
        amountFlushed: item.amountFlushed?.toString() ?? null,
        txHash: item.txHash,
        gasCost: item.gasCost?.toString() ?? null,
        errorMessage: item.errorMessage,
        processedAt: item.processedAt,
      })),
    };
  }

  /**
   * Cancel a pending flush operation.
   */
  async cancelOperation(clientId: number, operationId: number) {
    const operation = await this.prisma.flushOperation.findFirst({
      where: {
        id: BigInt(operationId),
        clientId: BigInt(clientId),
      },
    });
    if (!operation) {
      throw new NotFoundException(
        `Flush operation ${operationId} not found`,
      );
    }
    if (!['pending', 'queued'].includes(operation.status)) {
      throw new BadRequestException(
        `Cannot cancel operation in ${operation.status} status`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.flushOperation.update({
        where: { id: BigInt(operationId) },
        data: { status: 'canceled', completedAt: new Date() },
      }),
      this.prisma.flushItem.updateMany({
        where: {
          operationId: BigInt(operationId),
          status: 'pending',
        },
        data: { status: 'skipped' },
      }),
    ]);

    this.logger.log(`Flush operation ${operationId} canceled`);

    return { success: true, operationId, status: 'canceled' };
  }

  private serializeOperation(op: Record<string, unknown>) {
    return {
      id: Number(op.id),
      operationUid: op.operationUid,
      clientId: Number(op.clientId),
      projectId: Number(op.projectId),
      chainId: op.chainId,
      operationType: op.operationType,
      mode: op.mode,
      triggerType: op.triggerType,
      triggeredBy: op.triggeredBy ? Number(op.triggeredBy) : null,
      isDryRun: op.isDryRun,
      status: op.status,
      tokenId: op.tokenId ? Number(op.tokenId) : null,
      walletId: Number(op.walletId),
      totalAddresses: op.totalAddresses,
      succeededCount: op.succeededCount,
      failedCount: op.failedCount,
      totalAmount: op.totalAmount?.toString() ?? '0',
      succeededAmount: op.succeededAmount?.toString() ?? '0',
      gasCostTotal: op.gasCostTotal?.toString() ?? '0',
      txHash: op.txHash ?? null,
      batchTxHashes: op.batchTxHashes ?? null,
      errorMessage: op.errorMessage ?? null,
      dryRunResult: op.dryRunResult ?? null,
      filtersApplied: op.filtersApplied ?? null,
      startedAt: op.startedAt ?? null,
      completedAt: op.completedAt ?? null,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
    };
  }
}
