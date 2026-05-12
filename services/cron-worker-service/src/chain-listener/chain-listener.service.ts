import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, TOPICS, EventBusEvent } from '@cvh/event-bus';

/**
 * Listens to cvh.chain.status Kafka topic and reacts when chains change state.
 *
 * History: this used to dynamically register/remove BullMQ repeatable jobs for
 * `sweep`, `forwarder-deploy`, and `confirmation-tracker` when chains became
 * active/inactive. Those workers have since been migrated to @nestjs/schedule
 * Cron, which naturally picks up all currently-active chains every tick via
 * `chain.findMany({ where: { isActive: true } })`. So this listener no longer
 * needs to bootstrap or tear down per-chain queue jobs — Cron handles the
 * fan-out automatically.
 */
@Injectable()
export class ChainListenerService implements OnModuleInit {
  private readonly logger = new Logger(ChainListenerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      [TOPICS.CHAIN_STATUS],
      this.handleChainStatusEvent.bind(this),
    );
    this.logger.log(
      'Chain listener started — listening for chain status changes',
    );
  }

  private async handleChainStatusEvent(event: EventBusEvent): Promise<void> {
    const { chainId, newStatus, previousStatus } = event.data as {
      chainId: number;
      newStatus: string;
      previousStatus: string;
    };

    this.logger.log(
      `Chain ${chainId} status changed: ${previousStatus} -> ${newStatus}`,
    );

    if (newStatus === 'active') {
      // Cron-based workers (sweep, forwarder-deploy, confirmation-tracker)
      // pick up newly-active chains naturally on the next tick via their
      // own `chain.findMany({ where: { isActive: true } })` queries — no
      // per-chain bootstrap needed here.
      this.logger.log(
        `Chain ${chainId} activated — cron workers will pick it up on next tick`,
      );
    } else if (
      newStatus === 'inactive' ||
      newStatus === 'archived'
    ) {
      // Symmetric to activation: cron workers stop polling inactive chains
      // naturally because they filter on `isActive: true`.
      this.logger.log(
        `Chain ${chainId} deactivated — cron workers will stop polling on next tick`,
      );
    }
    // 'draining' — jobs continue running, no action needed
  }
}
