import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { GasTankService } from './gas-tank.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { ethers } from 'ethers';

// --- helpers ----------------------------------------------------------------

const CHAIN_ID = 137;
const TANK_ADDRESS = '0xTANK';
const PROJECT_ID = 42n;
const CLIENT_ID = 7n;

const makeTank = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  clientId: CLIENT_ID,
  projectId: PROJECT_ID,
  chainId: CHAIN_ID,
  address: TANK_ADDRESS,
  walletType: 'gas_tank',
  isActive: true,
  createdAt: new Date(),
  ...overrides,
});

const alertConfigFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  projectId: PROJECT_ID,
  chainId: CHAIN_ID,
  thresholdWei: '1000000000000000', // 0.001 ETH
  emailEnabled: false,
  webhookEnabled: true,
  lastAlertAt: null as Date | null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// --- mocks ------------------------------------------------------------------

const mockEthersProvider = { getBalance: jest.fn() };

const prisma = {
  chain: { findMany: jest.fn() },
  wallet: { findMany: jest.fn(), findUnique: jest.fn() },
  gasTankAlertConfig: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const redis = { publishToStream: jest.fn() };
const evmProvider = {
  getProvider: jest.fn().mockResolvedValue(mockEthersProvider),
  reportSuccess: jest.fn(),
  reportFailure: jest.fn(),
};

const configGet = jest.fn((key: string, def?: string) => {
  if (key === 'GAS_TANK_DEFAULT_THRESHOLD_ETH') return '0.001';
  if (key === 'GAS_TANK_AUTO_TOPUP') return 'false';
  return def;
});

// ---------------------------------------------------------------------------

describe('GasTankService.checkGasTanks', () => {
  let svc: GasTankService;

  beforeEach(async () => {
    jest.clearAllMocks();
    evmProvider.getProvider.mockResolvedValue(mockEthersProvider);

    const mod = await Test.createTestingModule({
      providers: [
        GasTankService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EvmProviderService, useValue: evmProvider },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: getQueueToken('gas-tank'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    svc = mod.get(GasTankService);
  });

  // ── no tanks ──────────────────────────────────────────────────────────────
  it('returns empty array when no gas tanks exist', async () => {
    prisma.wallet.findMany.mockResolvedValue([]);
    const result = await svc.checkGasTanks(CHAIN_ID);
    expect(result).toEqual([]);
    expect(redis.publishToStream).not.toHaveBeenCalled();
  });

  // ── balance is healthy (above threshold) ─────────────────────────────────
  it('does not publish when balance is above threshold', async () => {
    prisma.wallet.findMany.mockResolvedValue([makeTank()]);
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue(alertConfigFixture());
    // 0.01 ETH — well above 0.001 ETH threshold
    mockEthersProvider.getBalance.mockResolvedValue(ethers.parseEther('0.01'));

    const results = await svc.checkGasTanks(CHAIN_ID);

    expect(results[0].isLow).toBe(false);
    expect(redis.publishToStream).not.toHaveBeenCalled();
    expect(prisma.gasTankAlertConfig.update).not.toHaveBeenCalled();
  });

  // ── low balance, no prior alert — should publish ──────────────────────────
  it('publishes to gas_tank:alerts when balance is low and no prior alert', async () => {
    prisma.wallet.findMany.mockResolvedValue([makeTank()]);
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue(
      alertConfigFixture({ lastAlertAt: null }),
    );
    // 0.0005 ETH — below 0.001 ETH threshold
    mockEthersProvider.getBalance.mockResolvedValue(ethers.parseEther('0.0005'));
    redis.publishToStream.mockResolvedValue(undefined);
    prisma.gasTankAlertConfig.update.mockResolvedValue({});

    const results = await svc.checkGasTanks(CHAIN_ID);

    expect(results[0].isLow).toBe(true);
    expect(redis.publishToStream).toHaveBeenCalledWith(
      'gas_tank:alerts',
      expect.objectContaining({
        event: 'gas_tank.low',
        chainId: CHAIN_ID.toString(),
        address: TANK_ADDRESS,
      }),
    );
    expect(prisma.gasTankAlertConfig.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { lastAlertAt: expect.any(Date) },
    });
  });

  // ── dedup: low balance but alerted 30 min ago — should NOT publish ────────
  it('suppresses Redis publish when lastAlertAt is within the 1-hour dedup window', async () => {
    prisma.wallet.findMany.mockResolvedValue([makeTank()]);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue(
      alertConfigFixture({ lastAlertAt: thirtyMinutesAgo }),
    );
    // Still low
    mockEthersProvider.getBalance.mockResolvedValue(ethers.parseEther('0.0005'));

    const results = await svc.checkGasTanks(CHAIN_ID);

    expect(results[0].isLow).toBe(true);
    // dedup suppresses publish
    expect(redis.publishToStream).not.toHaveBeenCalled();
    // no lastAlertAt update either
    expect(prisma.gasTankAlertConfig.update).not.toHaveBeenCalled();
  });

  // ── dedup window expired: alerted 2 hours ago — should publish ────────────
  it('re-publishes when lastAlertAt is older than 1 hour', async () => {
    prisma.wallet.findMany.mockResolvedValue([makeTank()]);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue(
      alertConfigFixture({ lastAlertAt: twoHoursAgo }),
    );
    mockEthersProvider.getBalance.mockResolvedValue(ethers.parseEther('0.0005'));
    redis.publishToStream.mockResolvedValue(undefined);
    prisma.gasTankAlertConfig.update.mockResolvedValue({});

    await svc.checkGasTanks(CHAIN_ID);

    expect(redis.publishToStream).toHaveBeenCalledWith('gas_tank:alerts', expect.anything());
    expect(prisma.gasTankAlertConfig.update).toHaveBeenCalled();
  });

  // ── no config row (cfg = null) — falls back to env threshold ─────────────
  it('uses env default threshold when no alert config row exists and publishes alert', async () => {
    prisma.wallet.findMany.mockResolvedValue([makeTank()]);
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue(null);
    // Balance below default 0.001 ETH threshold
    mockEthersProvider.getBalance.mockResolvedValue(ethers.parseEther('0.0005'));
    redis.publishToStream.mockResolvedValue(undefined);

    const results = await svc.checkGasTanks(CHAIN_ID);

    expect(results[0].isLow).toBe(true);
    expect(redis.publishToStream).toHaveBeenCalledWith('gas_tank:alerts', expect.anything());
    // No cfg row → no update call
    expect(prisma.gasTankAlertConfig.update).not.toHaveBeenCalled();
  });

  // ── per-chain custom threshold is respected ───────────────────────────────
  it('uses per-chain thresholdWei from alert config', async () => {
    prisma.wallet.findMany.mockResolvedValue([makeTank()]);
    // Custom threshold: 0.05 ETH
    prisma.gasTankAlertConfig.findUnique.mockResolvedValue(
      alertConfigFixture({ thresholdWei: ethers.parseEther('0.05').toString(), lastAlertAt: null }),
    );
    // Balance at 0.01 ETH — above env default (0.001) but below custom (0.05)
    mockEthersProvider.getBalance.mockResolvedValue(ethers.parseEther('0.01'));
    redis.publishToStream.mockResolvedValue(undefined);
    prisma.gasTankAlertConfig.update.mockResolvedValue({});

    const results = await svc.checkGasTanks(CHAIN_ID);

    expect(results[0].isLow).toBe(true);
    expect(redis.publishToStream).toHaveBeenCalled();
  });
});
