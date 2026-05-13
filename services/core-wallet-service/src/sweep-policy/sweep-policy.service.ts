import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SweepMode =
  | 'auto'
  | 'manual'
  | 'threshold_count'
  | 'threshold_value'
  | 'schedule';

const VALID_MODES: SweepMode[] = [
  'auto',
  'manual',
  'threshold_count',
  'threshold_value',
  'schedule',
];

const CRON_RE = /^[\d*\/,\- ]+$/;

export interface UpsertPolicyDto {
  mode: SweepMode;
  thresholdCount?: number | null;
  thresholdUsd?: string | null;
  scheduleCron?: string | null;
  scheduleTz?: string | null;
  isPaused?: boolean;
}

/**
 * CRUD for cvh_wallets.sweep_policies. The default policy when no row exists
 * is `auto` — same as the historical hard-coded behavior; the sweep service
 * treats a missing row exactly like a row in mode='auto'.
 */
@Injectable()
export class SweepPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: number, chainId: number) {
    const row = await this.prisma.sweepPolicy.findUnique({
      where: {
        uq_project_chain_policy: { projectId: BigInt(projectId), chainId },
      },
    });
    if (!row) {
      return this.defaultPolicy(projectId, chainId);
    }
    return this.serialize(row);
  }

  async listForProject(projectId: number) {
    const rows = await this.prisma.sweepPolicy.findMany({
      where: { projectId: BigInt(projectId) },
    });
    return rows.map((r) => this.serialize(r));
  }

  async upsert(projectId: number, chainId: number, dto: UpsertPolicyDto) {
    this.validate(dto);

    const data = {
      projectId: BigInt(projectId),
      chainId,
      mode: dto.mode,
      thresholdCount:
        dto.mode === 'threshold_count' ? dto.thresholdCount ?? null : null,
      thresholdUsd:
        dto.mode === 'threshold_value' ? dto.thresholdUsd ?? null : null,
      scheduleCron: dto.mode === 'schedule' ? dto.scheduleCron ?? null : null,
      scheduleTz:
        dto.mode === 'schedule' ? dto.scheduleTz ?? 'UTC' : 'UTC',
      isPaused: dto.isPaused ?? false,
    };

    const row = await this.prisma.sweepPolicy.upsert({
      where: {
        uq_project_chain_policy: { projectId: BigInt(projectId), chainId },
      },
      create: data,
      update: data,
    });
    return this.serialize(row);
  }

  /** Stamp lastRunAt — called by the sweep cron after every actual cycle. */
  async markRun(projectId: number, chainId: number, when: Date = new Date()) {
    await this.prisma.sweepPolicy.upsert({
      where: {
        uq_project_chain_policy: { projectId: BigInt(projectId), chainId },
      },
      create: {
        projectId: BigInt(projectId),
        chainId,
        mode: 'auto',
        lastRunAt: when,
      },
      update: { lastRunAt: when },
    });
  }

  private validate(dto: UpsertPolicyDto) {
    if (!VALID_MODES.includes(dto.mode)) {
      throw new BadRequestException(
        `Invalid mode "${dto.mode}". Valid: ${VALID_MODES.join(', ')}`,
      );
    }
    if (dto.mode === 'threshold_count') {
      const n = dto.thresholdCount ?? 0;
      if (!Number.isInteger(n) || n < 1 || n > 10_000) {
        throw new BadRequestException(
          'thresholdCount must be an integer between 1 and 10000',
        );
      }
    }
    if (dto.mode === 'threshold_value') {
      const v = dto.thresholdUsd ? Number(dto.thresholdUsd) : 0;
      if (!Number.isFinite(v) || v <= 0) {
        throw new BadRequestException(
          'thresholdUsd must be a positive number (as decimal string)',
        );
      }
    }
    if (dto.mode === 'schedule') {
      const cron = (dto.scheduleCron ?? '').trim();
      if (!cron || !CRON_RE.test(cron)) {
        throw new BadRequestException(
          'scheduleCron must be a valid cron expression (5 fields)',
        );
      }
      const parts = cron.split(/\s+/);
      if (parts.length !== 5) {
        throw new BadRequestException(
          'scheduleCron must have exactly 5 space-separated fields (min hour dom month dow)',
        );
      }
    }
  }

  private defaultPolicy(projectId: number, chainId: number) {
    return {
      projectId,
      chainId,
      mode: 'auto' as SweepMode,
      thresholdCount: null,
      thresholdUsd: null,
      scheduleCron: null,
      scheduleTz: 'UTC',
      isPaused: false,
      lastRunAt: null,
      createdAt: null,
      updatedAt: null,
      isDefault: true,
    };
  }

  private serialize(r: {
    projectId: bigint;
    chainId: number;
    mode: string;
    thresholdCount: number | null;
    thresholdUsd: unknown;
    scheduleCron: string | null;
    scheduleTz: string | null;
    isPaused: boolean;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      projectId: Number(r.projectId),
      chainId: r.chainId,
      mode: r.mode as SweepMode,
      thresholdCount: r.thresholdCount,
      thresholdUsd: r.thresholdUsd ? String(r.thresholdUsd) : null,
      scheduleCron: r.scheduleCron,
      scheduleTz: r.scheduleTz,
      isPaused: r.isPaused,
      lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      isDefault: false,
    };
  }

  /**
   * Project ownership check — cvh_wallets doesn't have a Project model,
   * but the wallets table is keyed by (clientId, projectId) and is
   * provisioned by the Setup Wizard. A wallet existing for the pair is
   * proof the project belongs to the client. Lighter than crossing into
   * cvh_admin and lets the policy endpoint stay inside core-wallet.
   */
  async assertProjectBelongsToClient(
    projectId: number,
    clientId: number,
  ): Promise<void> {
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        clientId: BigInt(clientId),
        projectId: BigInt(projectId),
      },
      select: { id: true },
    });
    if (!wallet) {
      throw new NotFoundException(
        `Project ${projectId} not found for client ${clientId} (no wallets provisioned)`,
      );
    }
  }
}
