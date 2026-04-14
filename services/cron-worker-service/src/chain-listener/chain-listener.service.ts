import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, TOPICS, EventBusEvent } from '@cvh/event-bus';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Listens to cvh.chain.status Kafka topic and dynamically registers
 * or removes BullMQ repeatable jobs when chains change state.
 * Eliminates the need to restart workers when chains are added or deactivated.
 */
@Injectable()
export class ChainListenerService implements OnModuleInit {
  private readonly logger = new Logger(ChainListenerService.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly prisma: PrismaService,
    @InjectQueue('sweep') private readonly sweepQueue: Queue,
    @InjectQueue('forwarder-deploy')
    private readonly forwarderDeployQueue: Queue,
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
      await this.registerChainJobs(chainId);
    } else if (
      newStatus === 'inactive' ||
      newStatus === 'archived'
    ) {
      await this.removeChainJobs(chainId);
    }
    // 'draining' — jobs continue running, no action needed
  }

  private async registerChainJobs(chainId: number): Promise<void> {
    const wallets = await this.prisma.wallet.findMany({
      where: { chainId, walletType: 'hot', isActive: true },
      select: { clientId: true },
    });

    const clientIds = [
      ...new Set(wallets.map((w) => Number(w.clientId))),
    ];

    for (const clientId of clientIds) {
      const jobId = `sweep-${chainId}-${clientId}`;
      const existing = await this.sweepQueue.getRepeatableJobs();
      if (existing.some((j) => j.id === jobId)) continue;

      await this.sweepQueue.add(
        'execute-sweep',
        { chainId, clientId },
        {
          repeat: { every: 60_000 },
          jobId,
        },
      );
      this.logger.log(`Registered sweep job: ${jobId}`);
    }

    const fwdJobId = `forwarder-deploy-${chainId}`;
    const existingFwd = await this.forwarderDeployQueue.getRepeatableJobs();
    if (!existingFwd.some((j) => j.id === fwdJobId)) {
      await this.forwarderDeployQueue.add(
        'deploy-forwarders',
        { chainId },
        {
          repeat: { every: 30_000 },
          jobId: fwdJobId,
        },
      );
      this.logger.log(`Registered forwarder-deploy job: ${fwdJobId}`);
    }
  }

  private async removeChainJobs(chainId: number): Promise<void> {
    const sweepJobs = await this.sweepQueue.getRepeatableJobs();
    for (const job of sweepJobs) {
      if (job.id?.startsWith(`sweep-${chainId}-`)) {
        await this.sweepQueue.removeRepeatableByKey(job.key);
        this.logger.log(`Removed sweep job: ${job.id}`);
      }
    }

    const fwdJobs = await this.forwarderDeployQueue.getRepeatableJobs();
    for (const job of fwdJobs) {
      if (job.id === `forwarder-deploy-${chainId}`) {
        await this.forwarderDeployQueue.removeRepeatableByKey(job.key);
        this.logger.log(`Removed forwarder-deploy job: ${job.id}`);
      }
    }
  }
}
