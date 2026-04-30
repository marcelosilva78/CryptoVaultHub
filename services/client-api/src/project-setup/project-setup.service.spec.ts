import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ProjectSetupService } from './project-setup.service';
import { AdminDatabaseService } from '../prisma/admin-database.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ---------------------------------------------------------------------------
// Helpers & Constants
// ---------------------------------------------------------------------------

const CLIENT_ID = 1;
const PROJECT_ID = 42;
const KEY_VAULT_URL = 'http://key-vault:3005';
const CORE_WALLET_URL = 'http://core-wallet:3004';
const NOTIFICATION_URL = 'http://notification:3007';
const AUTH_SERVICE_URL = 'http://auth:3003';
const INTERNAL_SERVICE_KEY = 'test-internal-key';

const MOCK_PROJECT_ROW = {
  id: PROJECT_ID,
  client_id: CLIENT_ID,
  name: 'Test Project',
  slug: 'test-project',
  description: 'A test project',
  is_default: 0,
  status: 'active',
  settings: JSON.stringify({ custodyMode: 'full_custody' }),
  created_at: new Date(),
  updated_at: new Date(),
};

const MOCK_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const MOCK_PUBLIC_KEYS = [
  { keyType: 'platform', publicKey: '0x04aaa...', address: '0xPlatformAddr' },
  { keyType: 'client', publicKey: '0x04bbb...', address: '0xClientAddr' },
  { keyType: 'backup', publicKey: '0x04ccc...', address: '0xBackupAddr' },
];

const MOCK_GAS_TANK_ADDRESS = '0xGasTank56';

// ---------------------------------------------------------------------------
// Mock AdminDatabaseService
// ---------------------------------------------------------------------------

const createMockAdminDb = () => ({
  query: jest.fn(),
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ProjectSetupService', () => {
  let service: ProjectSetupService;
  let mockAdminDb: ReturnType<typeof createMockAdminDb>;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.INTERNAL_SERVICE_KEY = INTERNAL_SERVICE_KEY;

    mockAdminDb = createMockAdminDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectSetupService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const map: Record<string, string> = {
                KEY_VAULT_SERVICE_URL: KEY_VAULT_URL,
                CORE_WALLET_SERVICE_URL: CORE_WALLET_URL,
                NOTIFICATION_SERVICE_URL: NOTIFICATION_URL,
                AUTH_SERVICE_URL: AUTH_SERVICE_URL,
              };
              return map[key] ?? fallback ?? '';
            }),
          },
        },
        {
          provide: AdminDatabaseService,
          useValue: mockAdminDb,
        },
      ],
    }).compile();

    service = module.get<ProjectSetupService>(ProjectSetupService);
  });

  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_KEY;
  });

  // =========================================================================
  // Step 1 — createProject
  // =========================================================================

  describe('createProject', () => {
    it('should create a project with a valid name and chains', async () => {
      // No existing project with same slug
      mockAdminDb.query.mockResolvedValueOnce([]);
      // INSERT result
      mockAdminDb.query.mockResolvedValueOnce({ insertId: PROJECT_ID });
      // core-wallet register-chain calls succeed
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.createProject(CLIENT_ID, {
        name: 'Test Project',
        description: 'A test project',
        chains: [56, 137],
        custodyMode: 'full_custody',
      });

      expect(result.name).toBe('Test Project');
      expect(result.slug).toBe('test-project');
      expect(result.status).toBe('active');
      expect(result.custodyMode).toBe('full_custody');
      expect(result.chains).toHaveLength(2);
      expect(result.chains[0]).toEqual({ chainId: 56, status: 'pending' });
      expect(result.chains[1]).toEqual({ chainId: 137, status: 'pending' });
    });

    it('should handle duplicate slug by reusing existing project', async () => {
      // Existing project with same slug found
      mockAdminDb.query.mockResolvedValueOnce([
        { id: 99, status: 'active' },
      ]);
      // core-wallet register-chain
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.createProject(CLIENT_ID, {
        name: 'Test Project',
        chains: [56],
        custodyMode: 'full_custody',
      });

      expect(result.id).toBe(99);
      expect(result.slug).toBe('test-project');
      // Should NOT have called INSERT
      expect(mockAdminDb.query).toHaveBeenCalledTimes(1);
    });

    it('should store selected chain IDs correctly via core-wallet register-chain', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]);
      mockAdminDb.query.mockResolvedValueOnce({ insertId: PROJECT_ID });
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      await service.createProject(CLIENT_ID, {
        name: 'Multi Chain',
        chains: [1, 56, 137, 42161],
        custodyMode: 'full_custody',
      });

      // Should call register-chain for each chain
      expect(mockedAxios.post).toHaveBeenCalledTimes(4);
      for (const chainId of [1, 56, 137, 42161]) {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          `${CORE_WALLET_URL}/deploy/project/${PROJECT_ID}/register-chain`,
          { chainId },
          expect.objectContaining({ timeout: 10000 }),
        );
      }
    });

    it('should generate a valid slug from project name', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]);
      mockAdminDb.query.mockResolvedValueOnce({ insertId: 50 });
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.createProject(CLIENT_ID, {
        name: '  My DeFi Gateway!!!  ',
        chains: [56],
        custodyMode: 'full_custody',
      });

      expect(result.slug).toBe('my-defi-gateway');
    });

    it('should still return pending chain status when core-wallet register-chain fails', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]);
      mockAdminDb.query.mockResolvedValueOnce({ insertId: PROJECT_ID });
      // core-wallet register-chain fails
      mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.createProject(CLIENT_ID, {
        name: 'Failing Chains',
        chains: [56],
        custodyMode: 'full_custody',
      });

      // Chain should still appear as pending despite failure
      expect(result.chains).toHaveLength(1);
      expect(result.chains[0]).toEqual({ chainId: 56, status: 'pending' });
    });

    it('should fallback to SELECT query when insertId is not returned', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]); // no existing
      mockAdminDb.query.mockResolvedValueOnce({}); // INSERT with no insertId
      mockAdminDb.query.mockResolvedValueOnce([{ id: 77 }]); // fallback SELECT
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.createProject(CLIENT_ID, {
        name: 'Fallback Test',
        chains: [56],
        custodyMode: 'full_custody',
      });

      expect(result.id).toBe(77);
    });

    it('should throw InternalServerErrorException when project cannot be retrieved after insert', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]); // no existing
      mockAdminDb.query.mockResolvedValueOnce({}); // INSERT with no insertId
      mockAdminDb.query.mockResolvedValueOnce([]); // fallback SELECT also empty

      await expect(
        service.createProject(CLIENT_ID, {
          name: 'Phantom',
          chains: [56],
          custodyMode: 'full_custody',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // Step 4 — initializeKeys (key ceremony)
  // =========================================================================

  describe('initializeKeys', () => {
    beforeEach(() => {
      // Ownership check always passes
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
    });

    it('should generate seed via key-vault', async () => {
      // generate-seed
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } })
        // generate-keys
        .mockResolvedValueOnce({ data: { success: true } });
      // public-keys
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result = await service.initializeKeys(CLIENT_ID, PROJECT_ID);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${KEY_VAULT_URL}/projects/${PROJECT_ID}/generate-seed`,
        { requestedBy: 'project-setup' },
        expect.objectContaining({ timeout: 30000 }),
      );
      expect(result.mnemonic).toBe(MOCK_MNEMONIC);
    });

    it('should generate 3 keys (platform, client, backup) via key-vault', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } })
        .mockResolvedValueOnce({ data: { success: true } });
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result = await service.initializeKeys(CLIENT_ID, PROJECT_ID);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${KEY_VAULT_URL}/projects/${PROJECT_ID}/generate-keys`,
        {
          clientId: CLIENT_ID,
          custodyMode: 'full_custody',
          requestedBy: 'project-setup',
        },
        expect.objectContaining({ timeout: 30000 }),
      );
      expect(result.publicKeys).toHaveLength(3);
      expect(result.publicKeys.map((k: any) => k.keyType)).toEqual(
        expect.arrayContaining(['platform', 'client', 'backup']),
      );
    });

    it('should derive gas tank key per selected chain', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } }) // seed
        .mockResolvedValueOnce({ data: { success: true } }) // keys
        .mockResolvedValueOnce({ data: { key: { address: '0xGas56' } } }) // gas tank chain 56
        .mockResolvedValueOnce({ data: { success: true } }) // register wallet 56
        .mockResolvedValueOnce({ data: { key: { address: '0xGas137' } } }) // gas tank chain 137
        .mockResolvedValueOnce({ data: { success: true } }); // register wallet 137
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result = await service.initializeKeys(
        CLIENT_ID,
        PROJECT_ID,
        undefined,
        [56, 137],
      );

      expect(result.gasTanks).toHaveLength(2);
      expect(result.gasTanks[0]).toEqual({ chainId: 56, address: '0xGas56' });
      expect(result.gasTanks[1]).toEqual({
        chainId: 137,
        address: '0xGas137',
      });
    });

    it('should register gas tank wallet in core-wallet', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } })
        .mockResolvedValueOnce({ data: { success: true } })
        .mockResolvedValueOnce({
          data: { key: { address: MOCK_GAS_TANK_ADDRESS } },
        })
        .mockResolvedValueOnce({ data: { success: true } }); // register wallet
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      await service.initializeKeys(CLIENT_ID, PROJECT_ID, undefined, [56]);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${CORE_WALLET_URL}/wallets/register`,
        {
          clientId: CLIENT_ID,
          projectId: PROJECT_ID,
          chainId: 56,
          address: MOCK_GAS_TANK_ADDRESS,
          walletType: 'gas_tank',
        },
        expect.objectContaining({ timeout: 10000 }),
      );
    });

    it('should handle key-vault timeout gracefully (not crash)', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';
      mockedAxios.post.mockRejectedValueOnce(timeoutError);

      await expect(
        service.initializeKeys(CLIENT_ID, PROJECT_ID),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle core-wallet wallet registration failure gracefully (log warning, continue)', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } }) // seed
        .mockResolvedValueOnce({ data: { success: true } }) // keys
        .mockResolvedValueOnce({
          data: { key: { address: MOCK_GAS_TANK_ADDRESS } },
        }) // gas tank derive
        .mockRejectedValueOnce({
          response: { status: 500, data: { message: 'DB error' } },
          message: 'DB error',
        }); // register wallet FAILS
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      // Should NOT throw — wallet registration failure is non-fatal
      const result = await service.initializeKeys(
        CLIENT_ID,
        PROJECT_ID,
        undefined,
        [56],
      );

      // Gas tank should still be in the result since derive succeeded
      expect(result.gasTanks).toHaveLength(1);
      expect(result.gasTanks[0].address).toBe(MOCK_GAS_TANK_ADDRESS);
    });

    it('should return mnemonic and public keys on success', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } })
        .mockResolvedValueOnce({ data: { success: true } });
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result = await service.initializeKeys(CLIENT_ID, PROJECT_ID);

      expect(result.mnemonic).toBe(MOCK_MNEMONIC);
      expect(result.publicKeys).toEqual(MOCK_PUBLIC_KEYS);
    });

    it('should skip seed generation if seed already exists (409)', async () => {
      // generate-seed returns 409
      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Seed already exists' } },
      });
      // public-keys
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result = await service.initializeKeys(CLIENT_ID, PROJECT_ID);

      // Mnemonic should indicate it was already generated
      expect(result.mnemonic).toContain('already generated');
      // generate-keys should NOT be called (mnemonic is null when 409)
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should handle key generation 409 (duplicate keys) gracefully', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } }) // seed
        .mockRejectedValueOnce({
          response: {
            status: 409,
            data: { message: 'Unique constraint violation: keys already exist' },
          },
        }); // generate-keys 409
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result = await service.initializeKeys(CLIENT_ID, PROJECT_ID);

      // Should NOT throw — duplicate keys are idempotent
      expect(result.publicKeys).toEqual(MOCK_PUBLIC_KEYS);
    });

    it('should skip gas tank when derive-gas-tank-key returns no address', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } }) // seed
        .mockResolvedValueOnce({ data: { success: true } }) // keys
        .mockResolvedValueOnce({ data: { key: {} } }); // gas tank with NO address
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result = await service.initializeKeys(
        CLIENT_ID,
        PROJECT_ID,
        undefined,
        [56],
      );

      expect(result.gasTanks).toHaveLength(0);
    });

    it('should resolve custody mode from project settings when not explicitly passed', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } })
        .mockResolvedValueOnce({ data: { success: true } });
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      await service.initializeKeys(CLIENT_ID, PROJECT_ID);

      // Should use custodyMode from project settings ('full_custody')
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${KEY_VAULT_URL}/projects/${PROJECT_ID}/generate-keys`,
        expect.objectContaining({ custodyMode: 'full_custody' }),
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // Step 5 — checkGasBalance (gas check)
  // =========================================================================

  describe('checkGasBalance', () => {
    beforeEach(() => {
      // Ownership check
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
    });

    it('should return gas chain data with balance and required amounts', async () => {
      // wallets
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          wallets: [
            {
              walletType: 'gas_tank',
              projectId: PROJECT_ID,
              chainId: 56,
              address: '0xGas56',
            },
          ],
        },
      });

      // chains DB query
      mockAdminDb.query.mockResolvedValueOnce([
        {
          chain_id: 56,
          name: 'BSC',
          short_name: 'bsc',
          native_currency_symbol: 'BNB',
          native_currency_decimals: 18,
          rpc_endpoints: '[]',
          is_active: 1,
        },
      ]);

      // balance check
      mockedAxios.get.mockResolvedValueOnce({
        data: { balanceWei: '500000000000000000' },
      });
      // gas price
      mockedAxios.get.mockResolvedValueOnce({
        data: { gasPrice: '5000000000' }, // 5 gwei
      });

      const result = await service.checkGasBalance(CLIENT_ID, PROJECT_ID);

      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].chainId).toBe(56);
      expect(result.chains[0].chainName).toBe('BSC');
      expect(result.chains[0].gasTankAddress).toBe('0xGas56');
      expect(result.chains[0].balanceWei).toBe('500000000000000000');
      expect(result.chains[0].requiredWei).toBeDefined();
      expect(typeof result.chains[0].sufficient).toBe('boolean');
      expect(typeof result.allSufficient).toBe('boolean');
    });

    it('should handle RPC balance check failure gracefully (return 0 balance, not 500)', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          wallets: [
            {
              walletType: 'gas_tank',
              projectId: PROJECT_ID,
              chainId: 56,
              address: '0xGas56',
            },
          ],
        },
      });

      mockAdminDb.query.mockResolvedValueOnce([
        {
          chain_id: 56,
          name: 'BSC',
          short_name: 'bsc',
          native_currency_symbol: 'BNB',
          native_currency_decimals: 18,
          rpc_endpoints: '[]',
          is_active: 1,
        },
      ]);

      // balance check FAILS (RPC down)
      mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      // gas price (fallback)
      mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.checkGasBalance(CLIENT_ID, PROJECT_ID);

      // Should NOT throw — balance defaults to 0
      expect(result.chains[0].balanceWei).toBe('0');
      expect(result.chains[0].sufficient).toBe(false);
    });

    it('should work when core-wallet returns 500 for balance (use 0 fallback)', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          wallets: [
            {
              walletType: 'gas_tank',
              projectId: PROJECT_ID,
              chainId: 56,
              address: '0xGas56',
            },
          ],
        },
      });

      mockAdminDb.query.mockResolvedValueOnce([
        {
          chain_id: 56,
          name: 'BSC',
          short_name: 'bsc',
          native_currency_symbol: 'BNB',
          native_currency_decimals: 18,
          rpc_endpoints: '[]',
          is_active: 1,
        },
      ]);

      // core-wallet 500
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Internal error' } },
      });
      // gas price also fails
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 500, data: {} },
      });

      const result = await service.checkGasBalance(CLIENT_ID, PROJECT_ID);

      expect(result.chains[0].balanceWei).toBe('0');
      expect(result.chains[0].sufficient).toBe(false);
    });

    it('should return empty chains and allSufficient=false when no gas tanks exist', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { wallets: [] },
      });

      const result = await service.checkGasBalance(CLIENT_ID, PROJECT_ID);

      expect(result.chains).toEqual([]);
      expect(result.allSufficient).toBe(false);
    });

    it('should only include gas_tank wallets for the given project', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          wallets: [
            {
              walletType: 'gas_tank',
              projectId: PROJECT_ID,
              chainId: 56,
              address: '0xGasCorrect',
            },
            {
              walletType: 'gas_tank',
              projectId: 999, // different project
              chainId: 56,
              address: '0xGasOther',
            },
            {
              walletType: 'deposit', // not a gas_tank
              projectId: PROJECT_ID,
              chainId: 56,
              address: '0xDeposit',
            },
          ],
        },
      });

      mockAdminDb.query.mockResolvedValueOnce([
        {
          chain_id: 56,
          name: 'BSC',
          short_name: 'bsc',
          native_currency_symbol: 'BNB',
          native_currency_decimals: 18,
          rpc_endpoints: '[]',
          is_active: 1,
        },
      ]);

      mockedAxios.get
        .mockResolvedValueOnce({ data: { balanceWei: '100' } })
        .mockResolvedValueOnce({ data: { gasPrice: '5000000000' } });

      const result = await service.checkGasBalance(CLIENT_ID, PROJECT_ID);

      // Should only have 1 chain (the gas_tank for this project)
      expect(result.chains).toHaveLength(1);
      expect(result.chains[0].gasTankAddress).toBe('0xGasCorrect');
    });
  });

  // =========================================================================
  // Deletion
  // =========================================================================

  describe('requestDeletion', () => {
    it('should hard-delete immediately when no transactions AND no balance', async () => {
      // verifyOwnership
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      // getDeletionImpact → verifyOwnership again
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);

      // wallets (empty)
      mockedAxios.get.mockResolvedValueOnce({ data: { wallets: [] } });
      // deposits count
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 0 }]);
      // withdrawals count
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 0 }]);
      // webhooks
      mockedAxios.get.mockResolvedValueOnce({ data: { webhooks: [] } });
      // api keys
      mockedAxios.get.mockResolvedValueOnce({ data: { apiKeys: [] } });

      // Cleanup queries (6 DELETE statements + 1 final DELETE project)
      mockAdminDb.query.mockResolvedValue([]);

      const result = await service.requestDeletion(CLIENT_ID, PROJECT_ID);

      expect(result.immediate).toBe(true);
      expect(result.deleted).toBe(true);
    });

    it('should clean up wallets, keys, seeds, shares on immediate delete', async () => {
      // verifyOwnership
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      // getDeletionImpact → verifyOwnership
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);

      // wallets (empty = no transactions, no balance)
      mockedAxios.get.mockResolvedValueOnce({ data: { wallets: [] } });
      // deposits
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 0 }]);
      // withdrawals
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 0 }]);
      // webhooks
      mockedAxios.get.mockResolvedValueOnce({ data: { webhooks: [] } });
      // api keys
      mockedAxios.get.mockResolvedValueOnce({ data: { apiKeys: [] } });

      // All cleanup queries succeed
      mockAdminDb.query.mockResolvedValue([]);

      await service.requestDeletion(CLIENT_ID, PROJECT_ID);

      // Verify cleanup queries were called
      const calls = mockAdminDb.query.mock.calls;
      const sqlStatements = calls.map((c) => c[0]);

      expect(sqlStatements).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DELETE FROM cvh_wallets.deposit_addresses'),
          expect.stringContaining('DELETE FROM cvh_wallets.wallets'),
          expect.stringContaining('DELETE FROM cvh_wallets.project_chains'),
          expect.stringContaining('DELETE FROM cvh_keyvault.shamir_shares'),
          expect.stringContaining('DELETE FROM cvh_keyvault.derived_keys'),
          expect.stringContaining('DELETE FROM cvh_keyvault.project_seeds'),
          expect.stringContaining('DELETE FROM projects WHERE id'),
        ]),
      );
    });

    it('should set 30-day grace period when transactions exist', async () => {
      // verifyOwnership
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      // getDeletionImpact → verifyOwnership
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);

      // wallets
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          wallets: [
            {
              projectId: PROJECT_ID,
              chainId: 56,
              address: '0xWallet1',
              walletType: 'deposit',
            },
          ],
        },
      });
      // deposits: HAS transactions
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 5 }]);
      // withdrawals
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 2 }]);
      // webhooks
      mockedAxios.get.mockResolvedValueOnce({ data: { webhooks: [] } });
      // api keys
      mockedAxios.get.mockResolvedValueOnce({ data: { apiKeys: [] } });
      // balance check for wallet
      mockedAxios.get.mockResolvedValueOnce({
        data: { balances: [{ balance: '0', isNative: true }] },
      });

      // UPDATE for grace period
      mockAdminDb.query.mockResolvedValueOnce([]);

      const result = await service.requestDeletion(CLIENT_ID, PROJECT_ID);

      expect(result.immediate).toBe(false);
      expect(result.graceDays).toBe(30);
      expect(result.scheduledFor).toBeDefined();

      // Verify the scheduledFor is approximately 30 days from now
      const scheduledDate = new Date(result.scheduledFor!);
      const now = new Date();
      const diffDays =
        (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    it('should reject deletion of already deleted project', async () => {
      const deletedProject = { ...MOCK_PROJECT_ROW, status: 'deleted' };
      mockAdminDb.query.mockResolvedValueOnce([deletedProject]);

      try {
        await service.requestDeletion(CLIENT_ID, PROJECT_ID);
        fail('Expected BadRequestException');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain('already deleted');
      }
    });

    it('should reject deletion of project already pending deletion', async () => {
      const pendingProject = {
        ...MOCK_PROJECT_ROW,
        status: 'pending_deletion',
      };
      mockAdminDb.query.mockResolvedValueOnce([pendingProject]);

      try {
        await service.requestDeletion(CLIENT_ID, PROJECT_ID);
        fail('Expected BadRequestException');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain(
          'already has a pending deletion',
        );
      }
    });

    it('should set grace period when balance is non-zero even with no transactions', async () => {
      // verifyOwnership
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      // getDeletionImpact → verifyOwnership
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);

      // wallets
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          wallets: [
            {
              projectId: PROJECT_ID,
              chainId: 56,
              address: '0xWallet1',
              walletType: 'gas_tank',
            },
          ],
        },
      });
      // deposits: 0
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 0 }]);
      // withdrawals: 0
      mockAdminDb.query.mockResolvedValueOnce([{ cnt: 0 }]);
      // webhooks
      mockedAxios.get.mockResolvedValueOnce({ data: { webhooks: [] } });
      // api keys
      mockedAxios.get.mockResolvedValueOnce({ data: { apiKeys: [] } });
      // balance: non-zero
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          balances: [{ balance: '0.5', isNative: true }],
        },
      });

      // UPDATE for grace period
      mockAdminDb.query.mockResolvedValueOnce([]);

      const result = await service.requestDeletion(CLIENT_ID, PROJECT_ID);

      expect(result.immediate).toBe(false);
      expect(result.graceDays).toBe(30);
    });
  });

  // =========================================================================
  // Idempotency
  // =========================================================================

  describe('idempotency', () => {
    it('should not create duplicate keys when initializeKeys is called twice (seed 409)', async () => {
      // First call: full ceremony
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      mockedAxios.post
        .mockResolvedValueOnce({ data: { mnemonic: MOCK_MNEMONIC } })
        .mockResolvedValueOnce({ data: { success: true } });
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result1 = await service.initializeKeys(CLIENT_ID, PROJECT_ID);
      expect(result1.mnemonic).toBe(MOCK_MNEMONIC);

      // Second call: seed already exists (409), keys already exist
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Seed already exists' } },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { keys: MOCK_PUBLIC_KEYS },
      });

      const result2 = await service.initializeKeys(CLIENT_ID, PROJECT_ID);

      // Second call should not generate new seed or keys
      expect(result2.mnemonic).toContain('already generated');
      expect(result2.publicKeys).toEqual(MOCK_PUBLIC_KEYS);
    });

    it('should return error when requestDeletion is called on already-deleted project', async () => {
      const deletedProject = { ...MOCK_PROJECT_ROW, status: 'deleted' };
      mockAdminDb.query.mockResolvedValueOnce([deletedProject]);

      await expect(
        service.requestDeletion(CLIENT_ID, PROJECT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow creating project with same name after deletion (slug reuse)', async () => {
      // First creation: existing project found (reuse path)
      mockAdminDb.query.mockResolvedValueOnce([{ id: 100, status: 'active' }]);
      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.createProject(CLIENT_ID, {
        name: 'Reusable Project',
        chains: [56],
        custodyMode: 'full_custody',
      });

      // Reuses the existing project row
      expect(result.id).toBe(100);
      expect(result.slug).toBe('reusable-project');
    });
  });

  // =========================================================================
  // Ownership verification
  // =========================================================================

  describe('ownership verification', () => {
    it('should throw ForbiddenException when project does not belong to client', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]); // no matching project

      await expect(
        service.initializeKeys(CLIENT_ID, PROJECT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for checkGasBalance on non-owned project', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]);

      await expect(
        service.checkGasBalance(CLIENT_ID, 9999),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for requestDeletion on non-owned project', async () => {
      mockAdminDb.query.mockResolvedValueOnce([]);

      await expect(
        service.requestDeletion(CLIENT_ID, 9999),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // confirmSeedShown
  // =========================================================================

  describe('confirmSeedShown', () => {
    it('should confirm seed as shown via key-vault', async () => {
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });

      const result = await service.confirmSeedShown(CLIENT_ID, PROJECT_ID);

      expect(result.confirmed).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${KEY_VAULT_URL}/projects/${PROJECT_ID}/mark-seed-shown`,
        {},
        expect.objectContaining({ timeout: 10000 }),
      );
    });

    it('should throw HttpException when key-vault returns error', async () => {
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 404, data: { message: 'Project seed not found' } },
      });

      await expect(
        service.confirmSeedShown(CLIENT_ID, PROJECT_ID),
      ).rejects.toThrow(HttpException);
    });

    it('should throw InternalServerErrorException when key-vault is unreachable', async () => {
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]);
      mockedAxios.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        service.confirmSeedShown(CLIENT_ID, PROJECT_ID),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // cancelDeletion
  // =========================================================================

  describe('cancelDeletion', () => {
    it('should cancel pending deletion and restore to active', async () => {
      const pendingProject = {
        ...MOCK_PROJECT_ROW,
        status: 'pending_deletion',
      };
      mockAdminDb.query.mockResolvedValueOnce([pendingProject]);
      mockAdminDb.query.mockResolvedValueOnce([]); // UPDATE

      const result = await service.cancelDeletion(CLIENT_ID, PROJECT_ID);

      expect(result.success).toBe(true);
      expect(mockAdminDb.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'active'"),
        [PROJECT_ID, CLIENT_ID],
      );
    });

    it('should reject cancellation when project is not pending deletion', async () => {
      mockAdminDb.query.mockResolvedValueOnce([MOCK_PROJECT_ROW]); // status = 'active'

      try {
        await service.cancelDeletion(CLIENT_ID, PROJECT_ID);
        fail('Expected BadRequestException');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toContain(
          'not pending deletion',
        );
      }
    });
  });
});
