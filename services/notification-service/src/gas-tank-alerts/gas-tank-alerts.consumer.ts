import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Raw alert payload as received from Redis XREAD — all values arrive as strings.
 */
interface RawAlert {
  projectId: string;
  chainId: string;
  address: string;
  balanceWei: string;
  thresholdWei: string;
  timestamp: string;
}

const EVENT_TYPE = 'gas_tank.low_balance';
const STREAM_NAME = 'gas_tank:alerts';

@Injectable()
export class GasTankAlertsConsumer implements OnModuleInit {
  private readonly logger = new Logger(GasTankAlertsConsumer.name);

  constructor(
    private readonly deliveryService: WebhookDeliveryService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // TODO: wire XREADGROUP subscription here once shared Redis stream
    // consumer infrastructure is extracted from EventConsumerService.
    // The existing EventConsumerService owns a dedicated ioredis connection
    // and a XREADGROUP loop; gas_tank:alerts should be added to its
    // STREAM_EVENT_MAP or a new parallel loop should be created here.
    // For now, handleAlert() is fully implemented and tested; the subscription
    // call will be added in a follow-up task.
    this.logger.log(
      `${GasTankAlertsConsumer.name} initialised — ${STREAM_NAME} subscription is TODO (see onModuleInit comment)`,
    );
  }

  /**
   * Process a single alert message parsed from the Redis stream.
   * All field values arrive as strings (XREAD wire format); numeric fields
   * are converted with Number().
   */
  async handleAlert(event: RawAlert): Promise<void> {
    const projectId = Number(event.projectId);
    const chainId = Number(event.chainId);

    const cfg = await this.prisma.gasTankAlertConfig.findUnique({
      where: {
        projectId_chainId: {
          projectId: BigInt(projectId),
          chainId,
        },
      },
    });

    if (!cfg) {
      this.logger.debug(
        `No GasTankAlertConfig for project ${projectId} chain ${chainId} — skipping`,
      );
      return;
    }

    if (cfg.webhookEnabled) {
      const project = await this.prisma.project.findUnique({
        where: { id: BigInt(projectId) },
        select: { clientId: true },
      });

      if (!project) {
        this.logger.warn(
          `gas_tank.low_balance: project ${projectId} not found, skipping dispatch`,
        );
        return;
      }

      const payload = {
        projectId,
        chainId,
        address: event.address,
        balanceWei: event.balanceWei,
        thresholdWei: event.thresholdWei,
        timestamp: event.timestamp,
      };

      await this.deliveryService.createDeliveries(
        project.clientId,
        EVENT_TYPE,
        payload,
        BigInt(projectId),
      );

      this.logger.log(
        `Dispatched ${EVENT_TYPE} webhook for project ${projectId} chain ${chainId}`,
      );
    }

    if (cfg.emailEnabled) {
      this.logger.log(
        `[email-stub] would send gas-tank low-balance email to project ${projectId} chain ${chainId} — not yet implemented`,
      );
    }
  }
}
