import { Injectable, Inject, ConflictException, BadRequestException, Optional } from '@nestjs/common';
import axios from 'axios';
import { EventBusService, TOPICS } from '@cvh/event-bus';
import { ChainDependencyService } from './chain-dependency.service';
import { AuditLogService } from '../common/audit-log.service';

const ALLOWED_TRANSITIONS: Record<string, Record<string, string>> = {
  active: { drain: 'draining', deactivate: 'inactive' },
  draining: { deactivate: 'inactive' },
  inactive: { archive: 'archived', reactivate: 'active' },
  archived: { reactivate: 'inactive' },
};

export interface TransitionResult {
  previousStatus: string;
  newStatus: string;
  reason: string;
  transitionedAt: string;
  warnings: string[];
}

@Injectable()
export class ChainLifecycleService {
  constructor(
    private readonly depService: ChainDependencyService,
    private readonly auditLog: AuditLogService,
    @Inject('CHAIN_INDEXER_URL') private readonly chainIndexerUrl: string,
    @Optional() private readonly eventBus?: EventBusService,
  ) {}

  getAllowedTransitions(currentStatus: string): string[] {
    return Object.keys(ALLOWED_TRANSITIONS[currentStatus] || {});
  }

  async transition(
    chainId: number,
    action: string,
    reason: string,
    adminUserId: number,
  ): Promise<TransitionResult> {
    const currentStatus = await this.getCurrentStatus(chainId);
    const transitions = ALLOWED_TRANSITIONS[currentStatus];

    if (!transitions || !transitions[action]) {
      throw new BadRequestException(
        `Cannot perform '${action}' on chain with status '${currentStatus}'. ` +
        `Allowed actions: ${this.getAllowedTransitions(currentStatus).join(', ') || 'none'}`,
      );
    }

    const newStatus = transitions[action];
    const deps = await this.depService.getDependencies(chainId);
    const warnings: string[] = [];

    if (
      (currentStatus === 'draining' && action === 'deactivate') ||
      (currentStatus === 'inactive' && action === 'archive')
    ) {
      if (deps.hasPendingOperations) {
        const blockers: { type: string; count: number }[] = [];
        if (deps.deposits.pending > 0) blockers.push({ type: 'pending_deposits', count: deps.deposits.pending });
        if (deps.withdrawals.pending > 0) blockers.push({ type: 'pending_withdrawals', count: deps.withdrawals.pending });
        if (deps.flushOperations.pending > 0) blockers.push({ type: 'pending_flushes', count: deps.flushOperations.pending });

        throw new ConflictException({
          error: 'TRANSITION_BLOCKED',
          message: `Cannot ${action} chain with pending operations`,
          blockers,
        });
      }
    }

    if (currentStatus === 'active' && action === 'deactivate' && deps.hasPendingOperations) {
      if (deps.deposits.pending > 0)
        warnings.push(`${deps.deposits.pending} pending deposits will stop being tracked`);
      if (deps.withdrawals.pending > 0)
        warnings.push(`${deps.withdrawals.pending} pending withdrawals may not complete`);
      if (deps.flushOperations.pending > 0)
        warnings.push(`${deps.flushOperations.pending} pending flush operations will be interrupted`);
    }

    if (action === 'reactivate' && deps.rpcNodes.active === 0) {
      warnings.push('No active RPC nodes found — chain health will show as error until nodes are configured');
    }

    await this.updateChainStatus(chainId, newStatus, reason);

    const transitionedAt = new Date().toISOString();

    await this.auditLog.log({
      action: 'chain.lifecycle',
      entityType: 'chain',
      entityId: String(chainId),
      adminUserId: String(adminUserId),
      details: { previousStatus: currentStatus, newStatus, reason, warnings },
    });

    // Publish chain status transition event to Kafka
    if (this.eventBus) {
      await this.eventBus.publishToKafka(
        TOPICS.CHAIN_STATUS,
        chainId.toString(),
        {
          chainId,
          previousStatus: currentStatus,
          newStatus,
          reason,
          transitionedAt,
        },
      );
    }

    return { previousStatus: currentStatus, newStatus, reason, transitionedAt, warnings };
  }

  private async getCurrentStatus(chainId: number): Promise<string> {
    const { data } = await axios.get(`${this.chainIndexerUrl}/chains`);
    const chains = data.chains || data.data || data;
    const chain = chains.find((c: any) => (c.chainId || c.id) === chainId);
    if (!chain) throw new BadRequestException(`Chain ${chainId} not found`);
    return chain.status || (chain.isActive ? 'active' : 'inactive');
  }

  private async updateChainStatus(chainId: number, status: string, reason: string): Promise<void> {
    await axios.patch(`${this.chainIndexerUrl}/chains/${chainId}`, {
      status,
      statusReason: reason,
      statusChangedAt: new Date().toISOString(),
      isActive: status === 'active' || status === 'draining',
    });
  }
}
