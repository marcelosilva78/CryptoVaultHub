import { Injectable, Logger } from '@nestjs/common';
import { parseExpression } from 'cron-parser';
import { PrismaService } from '../prisma/prisma.service';

export type SweepMode =
  | 'auto'
  | 'manual'
  | 'threshold_count'
  | 'threshold_value'
  | 'schedule';

export interface ResolvedPolicy {
  projectId: bigint;
  chainId: number;
  mode: SweepMode;
  thresholdCount: number | null;
  thresholdUsd: number | null;
  scheduleCron: string | null;
  scheduleTz: string;
  isPaused: boolean;
  lastRunAt: Date | null;
}

const DEFAULT_POLICY: Omit<ResolvedPolicy, 'projectId' | 'chainId'> = {
  mode: 'auto',
  thresholdCount: null,
  thresholdUsd: null,
  scheduleCron: null,
  scheduleTz: 'UTC',
  isPaused: false,
  lastRunAt: null,
};

/**
 * Reads cvh_wallets.sweep_policies and decides whether a given deposit
 * should be swept right now, given the policy of its (project, chain).
 *
 * Default for any (project, chain) without a row in sweep_policies is
 * `auto` — preserves the historical behaviour for tenants that haven't
 * touched the new UI.
 *
 * The resolver is per-cycle; the sweep service builds one and queries it
 * for every deposit. Policies are cached for the lifetime of the cycle so
 * a sweep of 200 deposits doesn't issue 200 DB reads.
 */
@Injectable()
export class SweepPolicyResolver {
  private readonly logger = new Logger(SweepPolicyResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a snapshot for one cycle. The caller passes the (project, chain)
   * pairs it's about to consider; we fetch all their policies in one query.
   */
  async snapshot(
    pairs: Array<{ projectId: bigint; chainId: number }>,
  ): Promise<SweepPolicySnapshot> {
    if (pairs.length === 0) return new SweepPolicySnapshot(new Map(), this.logger);

    const projectIds = [...new Set(pairs.map((p) => p.projectId))];
    const chainIds = [...new Set(pairs.map((p) => p.chainId))];
    const rows = await this.prisma.sweepPolicy.findMany({
      where: {
        projectId: { in: projectIds },
        chainId: { in: chainIds },
      },
    });
    const byKey = new Map<string, ResolvedPolicy>();
    for (const r of rows) {
      const k = `${r.projectId}:${r.chainId}`;
      byKey.set(k, {
        projectId: r.projectId,
        chainId: r.chainId,
        mode: r.mode as SweepMode,
        thresholdCount: r.thresholdCount,
        thresholdUsd: r.thresholdUsd ? Number(r.thresholdUsd) : null,
        scheduleCron: r.scheduleCron,
        scheduleTz: r.scheduleTz ?? 'UTC',
        isPaused: r.isPaused,
        lastRunAt: r.lastRunAt,
      });
    }
    return new SweepPolicySnapshot(byKey, this.logger);
  }

  /**
   * Stamp last_run_at after the sweep cron actually submits a tx for the
   * (project, chain). Used by `schedule` mode to compute next-due on the
   * subsequent cycle. We upsert because the policy row may not exist yet
   * (tenant on default `auto` — that's fine, we just record the run).
   */
  async markRun(
    projectId: bigint,
    chainId: number,
    when: Date = new Date(),
  ): Promise<void> {
    await this.prisma.sweepPolicy.upsert({
      where: {
        uq_project_chain_policy: { projectId, chainId },
      },
      create: {
        projectId,
        chainId,
        mode: 'auto',
        lastRunAt: when,
      },
      update: { lastRunAt: when },
    });
  }
}

export class SweepPolicySnapshot {
  constructor(
    private readonly byKey: Map<string, ResolvedPolicy>,
    private readonly logger: Logger,
  ) {}

  policyFor(projectId: bigint, chainId: number): ResolvedPolicy {
    const k = `${projectId}:${chainId}`;
    const found = this.byKey.get(k);
    if (found) return found;
    return {
      projectId,
      chainId,
      ...DEFAULT_POLICY,
    };
  }

  /**
   * Decides if a deposit is eligible to be swept right now. The `metrics`
   * argument supplies the aggregations the threshold modes need:
   *   - depositCountForwarder: how many unswept (any non-terminal status)
   *     deposits exist on this forwarder right now
   *   - unsweptUsdForwarder: sum of amountUsd of those same deposits
   *
   * Both are computed by the caller once per forwarder per cycle.
   */
  qualifies(
    deposit: { projectId: bigint; chainId: number },
    metrics: {
      depositCountForwarder: number;
      unsweptUsdForwarder: number | null;
    },
    now: Date = new Date(),
  ): { allow: boolean; reason: string } {
    const p = this.policyFor(deposit.projectId, deposit.chainId);

    if (p.isPaused) return { allow: false, reason: 'policy paused' };

    switch (p.mode) {
      case 'auto':
        return { allow: true, reason: 'auto' };

      case 'manual':
        return {
          allow: false,
          reason: 'manual mode — sweep only via POST /sweep/now',
        };

      case 'threshold_count': {
        const need = p.thresholdCount ?? 1;
        if (metrics.depositCountForwarder >= need) {
          return { allow: true, reason: `count ${metrics.depositCountForwarder}/${need}` };
        }
        return {
          allow: false,
          reason: `count ${metrics.depositCountForwarder}/${need} (below threshold)`,
        };
      }

      case 'threshold_value': {
        const need = p.thresholdUsd ?? 0;
        if (metrics.unsweptUsdForwarder === null) {
          return {
            allow: false,
            reason: 'usd value unavailable (token has no priceUsd) — falling back to skip',
          };
        }
        if (metrics.unsweptUsdForwarder >= need) {
          return {
            allow: true,
            reason: `$${metrics.unsweptUsdForwarder.toFixed(2)} >= $${need.toFixed(2)}`,
          };
        }
        return {
          allow: false,
          reason: `$${metrics.unsweptUsdForwarder.toFixed(2)} < $${need.toFixed(2)} (below threshold)`,
        };
      }

      case 'schedule': {
        if (!p.scheduleCron) {
          return { allow: false, reason: 'schedule mode but no scheduleCron set' };
        }
        try {
          const it = parseExpression(p.scheduleCron, {
            currentDate: p.lastRunAt ?? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
            tz: p.scheduleTz,
          });
          const nextDue = it.next().toDate();
          if (now >= nextDue) {
            return { allow: true, reason: `schedule due at ${nextDue.toISOString()}` };
          }
          return {
            allow: false,
            reason: `next sweep at ${nextDue.toISOString()} (TZ ${p.scheduleTz})`,
          };
        } catch (err) {
          this.logger.warn(
            `Invalid scheduleCron "${p.scheduleCron}" for project ${p.projectId} chain ${p.chainId}: ${(err as Error).message}`,
          );
          return { allow: false, reason: 'invalid scheduleCron — skipping' };
        }
      }

      default:
        return { allow: false, reason: `unknown mode "${p.mode}"` };
    }
  }
}
