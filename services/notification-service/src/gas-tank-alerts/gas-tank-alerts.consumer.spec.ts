import { Test } from '@nestjs/testing';
import { GasTankAlertsConsumer } from './gas-tank-alerts.consumer';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GasTankAlertsConsumer', () => {
  const deliveryService = { createDeliveries: jest.fn() };
  const prisma = {
    gasTankAlertConfig: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
  };
  let consumer: GasTankAlertsConsumer;

  beforeEach(async () => {
    jest.clearAllMocks();
    const m = await Test.createTestingModule({
      providers: [
        GasTankAlertsConsumer,
        { provide: WebhookDeliveryService, useValue: deliveryService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    consumer = m.get(GasTankAlertsConsumer);
  });

  // Wire shape: every value arrives as a string from XREAD
  const event = {
    projectId: '7',
    chainId: '137',
    address: '0xabc',
    balanceWei: '100',
    thresholdWei: '1000',
    timestamp: '2026-05-06T00:00:00Z',
  };

  it('dispatches webhook when webhookEnabled=true', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({
      webhookEnabled: true,
      emailEnabled: false,
    });
    prisma.project.findUnique.mockResolvedValue({ clientId: 42n });
    deliveryService.createDeliveries.mockResolvedValue([]);

    await consumer.handleAlert(event);

    expect(deliveryService.createDeliveries).toHaveBeenCalledWith(
      42n,
      'gas_tank.low_balance',
      {
        projectId: 7,
        chainId: 137,
        address: '0xabc',
        balanceWei: '100',
        thresholdWei: '1000',
        timestamp: '2026-05-06T00:00:00Z',
      },
      BigInt(7),
    );
  });

  it('skips when project lookup fails', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({
      webhookEnabled: true,
      emailEnabled: false,
    });
    prisma.project.findUnique.mockResolvedValue(null);

    await consumer.handleAlert(event);

    expect(deliveryService.createDeliveries).not.toHaveBeenCalled();
  });

  it('skips webhook when webhookEnabled=false', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({
      webhookEnabled: false,
      emailEnabled: false,
    });

    await consumer.handleAlert(event);

    expect(deliveryService.createDeliveries).not.toHaveBeenCalled();
  });

  it('skips when no config found', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue(null);

    await consumer.handleAlert(event);

    expect(deliveryService.createDeliveries).not.toHaveBeenCalled();
  });

  it('logs email-stub when emailEnabled=true (does not actually send)', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({
      webhookEnabled: false,
      emailEnabled: true,
    });

    const logSpy = jest.spyOn((consumer as any).logger, 'log');

    await consumer.handleAlert(event);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[email-stub]'),
    );
    expect(deliveryService.createDeliveries).not.toHaveBeenCalled();
  });

  it('dispatches webhook AND logs email-stub when both enabled', async () => {
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue({
      webhookEnabled: true,
      emailEnabled: true,
    });
    prisma.project.findUnique.mockResolvedValue({ clientId: 42n });
    deliveryService.createDeliveries.mockResolvedValue([]);

    const logSpy = jest.spyOn((consumer as any).logger, 'log');

    await consumer.handleAlert(event);

    expect(deliveryService.createDeliveries).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[email-stub]'),
    );
  });
});
