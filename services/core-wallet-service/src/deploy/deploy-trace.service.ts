import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

export interface CreateTraceData {
  projectId: number;
  chainId: number;
  projectChainId: number;
  contractType: string;
  deployerAddress: string;
  calldataHex?: string;
  constructorArgsJson?: Record<string, unknown>;
  abiJson?: unknown[];
  bytecodeHash?: string;
}

export interface UpdateTraceConfirmedData {
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  gasUsed: string;
  gasPrice: string;
  gasCostWei: string;
  signedTxHex: string;
  rpcRequestJson: Record<string, unknown>;
  rpcResponseJson: Record<string, unknown>;
  bytecodeHash?: string;
  verificationProofJson?: Record<string, unknown>;
  explorerUrl?: string;
}

/**
 * Manages ProjectDeployTrace records for full traceability of
 * project-isolated contract deployments.
 *
 * Every deploy step (impl, factory, hot wallet) gets a trace
 * capturing: calldata, signed tx, RPC request/response, ABI,
 * constructor args, gas costs, and bytecode verification proof.
 */
@Injectable()
export class ProjectDeployTraceService {
  private readonly logger = new Logger(ProjectDeployTraceService.name);

  /** Well-known explorer base URLs by chainId */
  private static readonly EXPLORER_MAP: Record<number, string> = {
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
    56: 'https://bscscan.com',
    97: 'https://testnet.bscscan.com',
    137: 'https://polygonscan.com',
    80002: 'https://amoy.polygonscan.com',
    42161: 'https://arbiscan.io',
    421614: 'https://sepolia.arbiscan.io',
    10: 'https://optimistic.etherscan.io',
    11155420: 'https://sepolia-optimism.etherscan.io',
    8453: 'https://basescan.org',
    84532: 'https://sepolia.basescan.org',
    43114: 'https://snowtrace.io',
    43113: 'https://testnet.snowtrace.io',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Create a pending trace record before broadcasting a deploy tx.
   */
  async createTrace(data: CreateTraceData): Promise<bigint> {
    const trace = await this.prisma.projectDeployTrace.create({
      data: {
        projectId: BigInt(data.projectId),
        chainId: data.chainId,
        projectChainId: BigInt(data.projectChainId),
        contractType: data.contractType,
        deployerAddress: data.deployerAddress,
        calldataHex: data.calldataHex ?? null,
        constructorArgsJson: data.constructorArgsJson as any ?? undefined,
        abiJson: data.abiJson as any ?? undefined,
        bytecodeHash: data.bytecodeHash ?? null,
        status: 'pending',
      },
    });

    this.logger.log(
      `Trace created id=${trace.id} type=${data.contractType} chain=${data.chainId} project=${data.projectId}`,
    );

    return trace.id;
  }

  /**
   * Update a trace after successful deployment confirmation.
   * Stores block data, gas costs, signed tx, full RPC artifacts,
   * and optionally the bytecode verification proof.
   */
  async updateTraceConfirmed(
    traceId: bigint,
    data: UpdateTraceConfirmedData,
  ): Promise<void> {
    await this.prisma.projectDeployTrace.update({
      where: { id: traceId },
      data: {
        contractAddress: data.contractAddress,
        txHash: data.txHash,
        blockNumber: BigInt(data.blockNumber),
        blockHash: data.blockHash,
        gasUsed: data.gasUsed,
        gasPrice: data.gasPrice,
        gasCostWei: data.gasCostWei,
        signedTxHex: data.signedTxHex,
        rpcRequestJson: data.rpcRequestJson as any,
        rpcResponseJson: data.rpcResponseJson as any,
        bytecodeHash: data.bytecodeHash ?? null,
        verificationProofJson: data.verificationProofJson as any ?? undefined,
        explorerUrl: data.explorerUrl ?? null,
        status: 'confirmed',
        confirmedAt: new Date(),
      },
    });

    this.logger.log(
      `Trace ${traceId} confirmed: ${data.contractAddress} tx=${data.txHash}`,
    );
  }

  /**
   * Mark a trace as failed with an error message.
   */
  async updateTraceFailed(traceId: bigint, error: string): Promise<void> {
    await this.prisma.projectDeployTrace.update({
      where: { id: traceId },
      data: {
        status: 'failed',
        errorMessage: error,
      },
    });

    this.logger.warn(`Trace ${traceId} failed: ${error}`);
  }

  /**
   * Build a bytecode verification proof by comparing on-chain bytecode
   * hash with the expected hash from the compiled artifact.
   *
   * Returns the proof object with match result.
   */
  async buildVerificationProof(
    contractAddress: string,
    expectedBytecodeHash: string,
    provider: ethers.JsonRpcProvider,
  ): Promise<{
    contractAddress: string;
    onChainBytecodeHash: string;
    expectedBytecodeHash: string;
    match: boolean;
    verifiedAt: string;
  }> {
    const onChainCode = await provider.getCode(contractAddress);
    const onChainBytecodeHash = ethers.keccak256(onChainCode);

    const proof = {
      contractAddress,
      onChainBytecodeHash,
      expectedBytecodeHash,
      match: onChainBytecodeHash === expectedBytecodeHash,
      verifiedAt: new Date().toISOString(),
    };

    if (!proof.match) {
      this.logger.warn(
        `Bytecode verification MISMATCH for ${contractAddress}: ` +
          `expected=${expectedBytecodeHash} got=${onChainBytecodeHash}`,
      );
    } else {
      this.logger.log(
        `Bytecode verification OK for ${contractAddress}: ${onChainBytecodeHash}`,
      );
    }

    return proof;
  }

  /**
   * Get all deploy traces for a project.
   */
  async getTracesByProject(projectId: number) {
    const traces = await this.prisma.projectDeployTrace.findMany({
      where: { projectId: BigInt(projectId) },
      orderBy: { createdAt: 'desc' },
    });

    return traces.map((t) => this.serializeTrace(t));
  }

  /**
   * Get deploy traces for a specific project + chain combination.
   */
  async getTracesByProjectChain(projectId: number, chainId: number) {
    const traces = await this.prisma.projectDeployTrace.findMany({
      where: {
        projectId: BigInt(projectId),
        chainId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return traces.map((t) => this.serializeTrace(t));
  }

  /**
   * Build an explorer URL for a given chainId and txHash.
   * Falls back to the chain's configured explorerUrl from DB,
   * then to the static map, then to etherscan.io.
   */
  buildExplorerUrl(chainId: number, txHash: string, chainExplorerUrl?: string | null): string {
    if (chainExplorerUrl) {
      const base = chainExplorerUrl.replace(/\/+$/, '');
      return `${base}/tx/${txHash}`;
    }

    const base = ProjectDeployTraceService.EXPLORER_MAP[chainId];
    if (base) {
      return `${base}/tx/${txHash}`;
    }

    return `https://etherscan.io/tx/${txHash}`;
  }

  private serializeTrace(trace: Record<string, unknown>) {
    return {
      id: Number(trace.id),
      projectId: Number(trace.projectId),
      chainId: trace.chainId,
      projectChainId: Number(trace.projectChainId),
      contractType: trace.contractType,
      contractAddress: trace.contractAddress ?? null,
      txHash: trace.txHash ?? null,
      blockNumber: trace.blockNumber ? Number(trace.blockNumber) : null,
      blockHash: trace.blockHash ?? null,
      gasUsed: trace.gasUsed ?? null,
      gasPrice: trace.gasPrice ?? null,
      gasCostWei: trace.gasCostWei ?? null,
      deployerAddress: trace.deployerAddress,
      calldataHex: trace.calldataHex ?? null,
      constructorArgsJson: trace.constructorArgsJson ?? null,
      signedTxHex: trace.signedTxHex ?? null,
      rpcRequestJson: trace.rpcRequestJson ?? null,
      rpcResponseJson: trace.rpcResponseJson ?? null,
      abiJson: trace.abiJson ?? null,
      bytecodeHash: trace.bytecodeHash ?? null,
      verificationProofJson: trace.verificationProofJson ?? null,
      explorerUrl: trace.explorerUrl ?? null,
      status: trace.status,
      errorMessage: trace.errorMessage ?? null,
      createdAt: trace.createdAt,
      confirmedAt: trace.confirmedAt ?? null,
    };
  }
}
