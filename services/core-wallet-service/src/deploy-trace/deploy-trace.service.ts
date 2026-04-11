import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

export interface CaptureDeployTraceDto {
  clientId: number;
  projectId: number;
  chainId: number;
  resourceType: 'wallet' | 'forwarder' | 'factory' | 'token_contract';
  resourceId: number;
  address: string;
  txHash: string;
  deployerAddress?: string;
  factoryAddress?: string;
  salt?: string;
  initCodeHash?: string;
  correlationId?: string;
  triggeredBy?: number;
  triggerType?: 'user' | 'system' | 'automated';
  metadata?: Record<string, unknown>;
}

/**
 * Capture tx receipt, block info, gas costs, build explorer URL,
 * and store deploy_traces for full traceability.
 */
@Injectable()
export class DeployTraceService {
  private readonly logger = new Logger(DeployTraceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Capture a deployment trace from a transaction hash.
   * Fetches the receipt and block info from the chain.
   */
  async captureTrace(dto: CaptureDeployTraceDto) {
    const provider = await this.evmProvider.getProvider(dto.chainId);

    // Fetch tx receipt and block info
    const receipt = await provider.getTransactionReceipt(dto.txHash);
    if (!receipt) {
      throw new NotFoundException(
        `Transaction receipt not found for ${dto.txHash} on chain ${dto.chainId}`,
      );
    }

    const block = await provider.getBlock(receipt.blockNumber);

    // Get chain for explorer URL
    const chain = await this.prisma.chain.findUnique({
      where: { id: dto.chainId },
    });

    const explorerUrl = chain?.explorerUrl
      ? `${chain.explorerUrl}/tx/${dto.txHash}`
      : `https://etherscan.io/tx/${dto.txHash}`;

    // Compute gas cost in wei
    const gasCostWei = receipt.gasUsed * receipt.gasPrice;

    // Extract event logs as serializable JSON
    const eventLogs = receipt.logs.map((log) => ({
      address: log.address,
      topics: log.topics.map((t) => t),
      data: log.data,
      logIndex: log.index,
      blockNumber: log.blockNumber,
    }));

    const trace = await this.prisma.deployTrace.create({
      data: {
        clientId: BigInt(dto.clientId),
        projectId: BigInt(dto.projectId),
        chainId: dto.chainId,
        resourceType: dto.resourceType,
        resourceId: BigInt(dto.resourceId),
        address: dto.address,
        txHash: dto.txHash,
        blockNumber: BigInt(receipt.blockNumber),
        blockHash: receipt.blockHash,
        blockTimestamp: block?.timestamp ? BigInt(block.timestamp) : null,
        deployerAddress: dto.deployerAddress ?? receipt.from,
        factoryAddress: dto.factoryAddress ?? null,
        salt: dto.salt ?? null,
        initCodeHash: dto.initCodeHash ?? null,
        gasUsed: BigInt(receipt.gasUsed),
        gasPrice: BigInt(receipt.gasPrice),
        gasCostWei: gasCostWei.toString(), // Decimal field: bigint → string
        explorerUrl,
        correlationId: dto.correlationId ?? null,
        triggeredBy: dto.triggeredBy ? BigInt(dto.triggeredBy) : null,
        triggerType: dto.triggerType ?? 'system',
        eventLogs,
        metadata: dto.metadata ?? undefined, // Json?: null not assignable; undefined → DB NULL
      },
    });

    this.logger.log(
      `Deploy trace captured for ${dto.resourceType} ${dto.address} on chain ${dto.chainId}: ${explorerUrl}`,
    );

    return this.serializeTrace(trace);
  }

  /**
   * List deploy traces for a client/project.
   */
  async listTraces(
    clientId: number,
    params: {
      projectId?: number;
      chainId?: number;
      resourceType?: string;
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
    if (params.chainId) where.chainId = params.chainId;
    if (params.resourceType) where.resourceType = params.resourceType;

    const [traces, total] = await Promise.all([
      this.prisma.deployTrace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.deployTrace.count({ where }),
    ]);

    return {
      traces: traces.map((t: any) => this.serializeTrace(t)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get a single deploy trace by ID.
   */
  async getTrace(clientId: number, traceId: number) {
    const trace = await this.prisma.deployTrace.findFirst({
      where: {
        id: BigInt(traceId),
        clientId: BigInt(clientId),
      },
    });
    if (!trace) {
      throw new NotFoundException(
        `Deploy trace ${traceId} not found`,
      );
    }
    return this.serializeTrace(trace);
  }

  private serializeTrace(trace: Record<string, unknown>) {
    return {
      id: Number(trace.id),
      clientId: Number(trace.clientId),
      projectId: Number(trace.projectId),
      chainId: trace.chainId,
      resourceType: trace.resourceType,
      resourceId: Number(trace.resourceId),
      address: trace.address,
      txHash: trace.txHash,
      blockNumber: trace.blockNumber ? Number(trace.blockNumber) : null,
      blockHash: trace.blockHash ?? null,
      blockTimestamp: trace.blockTimestamp ? Number(trace.blockTimestamp) : null,
      deployerAddress: trace.deployerAddress ?? null,
      factoryAddress: trace.factoryAddress ?? null,
      salt: trace.salt ?? null,
      initCodeHash: trace.initCodeHash ?? null,
      gasUsed: trace.gasUsed ? Number(trace.gasUsed) : null,
      gasPrice: trace.gasPrice ? Number(trace.gasPrice) : null,
      gasCostWei: trace.gasCostWei?.toString() ?? null,
      explorerUrl: trace.explorerUrl,
      correlationId: trace.correlationId ?? null,
      triggeredBy: trace.triggeredBy ? Number(trace.triggeredBy) : null,
      triggerType: trace.triggerType,
      eventLogs: trace.eventLogs ?? null,
      metadata: trace.metadata ?? null,
      createdAt: trace.createdAt,
    };
  }
}
