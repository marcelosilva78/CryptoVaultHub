import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { RedisService } from '../redis/redis.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLIENT_ID = 1;
const PROJECT_ID = 42;
const CHAIN_ID = 56;
const GAS_TANK_ADDRESS = '0xGasTank0000000000000000000000000000000001';
const DEFAULT_THRESHOLD_WEI = '1000000000000000';

const makePrismaMock = () => ({
  wallet: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  chain: {
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
});

const makeConfigMock = () => ({
  get: jest.fn((key: string, defaultVal?: string) => {
    const map: Record<string, string> = {
      VAULT_TLS_ENABLED: 'false',
      KEY_VAULT_URL: 'http://key-vault:3005',
      INTERNAL_SERVICE_KEY: 'test-key',
    };
    return map[key] ?? defaultVal ?? '';
  }),
});

const makeContractMock = () => ({
  computeWalletAddress: jest.fn(),
});

const makeRedisMock = () => ({
  publishToStream: jest.fn(),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('WalletService', () => {
  let service: WalletService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: makeConfigMock() },
        { provide: ContractService, useValue: makeContractMock() },
        { provide: RedisService, useValue: makeRedisMock() },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  // -------------------------------------------------------------------------
  // registerWallet
  // -------------------------------------------------------------------------

  describe('registerWallet', () => {
    const walletRow = {
      id: 1n,
      clientId: BigInt(CLIENT_ID),
      projectId: BigInt(PROJECT_ID),
      chainId: CHAIN_ID,
      address: GAS_TANK_ADDRESS,
      walletType: 'gas_tank',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should INSERT IGNORE into gas_tank_alert_config when registering a gas_tank wallet', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null); // no existing wallet
      prisma.wallet.create.mockResolvedValue(walletRow);
      prisma.$executeRaw.mockResolvedValue(1);

      await service.registerWallet(
        CLIENT_ID,
        PROJECT_ID,
        CHAIN_ID,
        GAS_TANK_ADDRESS,
        'gas_tank',
      );

      // $executeRaw must have been called exactly once
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

      // Extract the TemplateStringsArray call argument to verify the SQL body
      const callArg = prisma.$executeRaw.mock.calls[0];
      const templateParts: TemplateStringsArray = callArg[0];
      const sql = templateParts.join('?');
      expect(sql).toMatch(/INSERT IGNORE INTO cvh_wallets\.gas_tank_alert_config/i);
      expect(sql).toMatch(/project_id.*chain_id.*threshold_wei.*email_enabled.*webhook_enabled/i);

      // Verify the parameter values
      const params = callArg.slice(1);
      expect(params).toContain(BigInt(PROJECT_ID)); // project_id
      expect(params).toContain(CHAIN_ID);            // chain_id
      expect(params).toContain(DEFAULT_THRESHOLD_WEI); // threshold_wei fallback default
    });

    it('should NOT call $executeRaw for non-gas_tank wallet types', async () => {
      const hotWalletRow = { ...walletRow, walletType: 'hot', address: '0xHotWallet' };
      prisma.wallet.findFirst.mockResolvedValue(null);
      prisma.wallet.create.mockResolvedValue(hotWalletRow);

      await service.registerWallet(CLIENT_ID, PROJECT_ID, CHAIN_ID, '0xHotWallet', 'hot');

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should return the existing wallet without seeding alert config when wallet already exists', async () => {
      prisma.wallet.findFirst.mockResolvedValue(walletRow);

      const result = await service.registerWallet(
        CLIENT_ID,
        PROJECT_ID,
        CHAIN_ID,
        GAS_TANK_ADDRESS,
        'gas_tank',
      );

      // Should return early — no INSERT
      expect(prisma.wallet.create).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(result.address).toBe(GAS_TANK_ADDRESS);
    });

    it('should be idempotent: $executeRaw INSERT IGNORE will not fail on duplicate (simulated)', async () => {
      // First call
      prisma.wallet.findFirst.mockResolvedValue(null);
      prisma.wallet.create.mockResolvedValue(walletRow);
      prisma.$executeRaw.mockResolvedValue(0); // 0 rows affected = already existed, no error

      await expect(
        service.registerWallet(CLIENT_ID, PROJECT_ID, CHAIN_ID, GAS_TANK_ADDRESS, 'gas_tank'),
      ).resolves.not.toThrow();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
