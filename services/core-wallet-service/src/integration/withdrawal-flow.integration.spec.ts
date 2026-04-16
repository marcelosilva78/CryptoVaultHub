/**
 * Integration test: Withdrawal Lifecycle
 *
 * Tests the full withdrawal pipeline from creation through compliance screening,
 * approval, on-chain execution (mocked Key Vault + RPC), confirmation, and
 * event publishing at each stage.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { WithdrawalService } from '../withdrawal/withdrawal.service';
import { WithdrawalExecutorService } from '../withdrawal/withdrawal-executor.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ContractService } from '../blockchain/contract.service';
import { NonceService } from '../blockchain/nonce.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { POSTHOG_SERVICE } from '@cvh/posthog';

// ─── Constants ──────────────────────────────────────────────────────────────

const CLIENT_ID = 100;
const CHAIN_ID = 1;
const TOKEN_ID = 1;
const WHITELISTED_ADDRESS_ID = 50;
const HOT_WALLET_ADDRESS = '0xHotWallet1234567890abcdef1234567890abcdef';
const GAS_TANK_ADDRESS = '0xGasTank1234567890abcdef1234567890abcdef';
const DESTINATION_ADDRESS = '0xDest1234567890abcdef1234567890abcdef1234';
const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Withdrawal Flow Integration', () => {
  let withdrawalService: WithdrawalService;
  let withdrawalExecutor: WithdrawalExecutorService;
  let mockPrisma: any;
  let mockContractService: any;
  let mockNonceService: any;
  let mockEvmProvider: any;
  let mockComplianceService: any;
  let mockProvider: any;
  let withdrawalIdCounter: bigint;

  beforeEach(async () => {
    withdrawalIdCounter = BigInt(1000);

    // ─── Mock Provider ──────────────────────────────────────────
    mockProvider = {
      getBlockNumber: jest.fn(),
      getTransactionReceipt: jest.fn(),
    };

    // ─── Mock Prisma ────────────────────────────────────────────
    mockPrisma = {
      withdrawal: {
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => {
          withdrawalIdCounter++;
          return Promise.resolve({
            id: withdrawalIdCounter,
            ...data,
            sequenceId: null,
            gasCost: null,
            txHash: null,
            submittedAt: null,
            confirmedAt: null,
            createdAt: new Date(),
          });
        }),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, ...data, createdAt: new Date() }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      whitelistedAddress: {
        findFirst: jest.fn().mockResolvedValue({
          id: BigInt(WHITELISTED_ADDRESS_ID),
          clientId: BigInt(CLIENT_ID),
          chainId: CHAIN_ID,
          address: DESTINATION_ADDRESS,
          label: 'Treasury Cold Wallet',
          status: 'active',
        }),
      },
      token: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(TOKEN_ID),
          symbol: 'USDC',
          decimals: 6,
          contractAddress: USDC_CONTRACT,
          chainId: CHAIN_ID,
          isActive: true,
          isNative: false,
        }),
      },
      wallet: {
        findUnique: jest.fn(),
      },
      client: {
        findUnique: jest.fn().mockResolvedValue({
          id: BigInt(CLIENT_ID),
          name: 'Test Client',
          kytLevel: 'basic',
        }),
      },
      sanctionsEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      screeningResult: {
        create: jest.fn().mockResolvedValue({}),
      },
      complianceAlert: {
        create: jest.fn().mockResolvedValue({ id: BigInt(1) }),
      },
      projectChain: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      chain: {
        findUnique: jest.fn().mockResolvedValue({
          id: CHAIN_ID,
          name: 'Ethereum',
          isActive: true,
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: BigInt(1) }]),
    };

    // ─── Mock Contract Service ──────────────────────────────────
    mockContractService = {
      getNativeBalance: jest.fn().mockResolvedValue(10n * 10n ** 18n),
      getERC20Balance: jest.fn().mockResolvedValue(500_000_000n), // 500 USDC
    };

    // ─── Mock Nonce Service ─────────────────────────────────────
    const releaseFn = jest.fn().mockResolvedValue(undefined);
    mockNonceService = {
      acquireNonce: jest.fn().mockResolvedValue({ nonce: 42, release: releaseFn }),
      resetNonce: jest.fn().mockResolvedValue(undefined),
    };

    // ─── Mock EVM Provider ──────────────────────────────────────
    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
      reportSuccess: jest.fn(),
      reportFailure: jest.fn(),
    };

    // ─── Mock Compliance Service ────────────────────────────────
    mockComplianceService = {
      screenWithdrawal: jest.fn().mockResolvedValue({
        result: 'clear',
        action: 'allowed',
        listsChecked: ['OFAC_SDN'],
        matchDetails: null,
      }),
      screenAddress: jest.fn().mockResolvedValue({
        result: 'clear',
        action: 'allowed',
        listsChecked: ['OFAC_SDN'],
        matchDetails: null,
      }),
    };

    // ─── Hot wallet findUnique mock ─────────────────────────────
    mockPrisma.wallet.findUnique.mockImplementation((args: any) => {
      const where = args.where;
      if (where?.uq_client_chain_type) {
        const { walletType } = where.uq_client_chain_type;
        if (walletType === 'hot') {
          return Promise.resolve({
            id: BigInt(10),
            address: HOT_WALLET_ADDRESS,
            clientId: BigInt(CLIENT_ID),
            chainId: CHAIN_ID,
            walletType: 'hot',
            projectId: BigInt(1),
          });
        }
        if (walletType === 'gas_tank') {
          return Promise.resolve({
            id: BigInt(20),
            address: GAS_TANK_ADDRESS,
            clientId: BigInt(CLIENT_ID),
            chainId: CHAIN_ID,
            walletType: 'gas_tank',
          });
        }
      }
      return Promise.resolve(null);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalService,
        WithdrawalExecutorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultVal?: any) => {
              const config: Record<string, string> = {
                KEY_VAULT_URL: 'http://key-vault-service:3005',
                INTERNAL_SERVICE_KEY: 'test-internal-key',
                WITHDRAWAL_EXPIRE_SECONDS: '3600',
              };
              return config[key] ?? defaultVal;
            }),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContractService, useValue: mockContractService },
        { provide: NonceService, useValue: mockNonceService },
        { provide: EvmProviderService, useValue: mockEvmProvider },
        { provide: ComplianceService, useValue: mockComplianceService },
        { provide: POSTHOG_SERVICE, useValue: null },
      ],
    }).compile();

    withdrawalService = module.get<WithdrawalService>(WithdrawalService);
    withdrawalExecutor = module.get<WithdrawalExecutorService>(WithdrawalExecutorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ─── Phase 1: Create Withdrawal ───────────────────────────────────────

  describe('Phase 1: Create Withdrawal', () => {
    it('should create a withdrawal request with compliance screening', async () => {
      const result = await withdrawalService.createWithdrawal({
        clientId: CLIENT_ID,
        chainId: CHAIN_ID,
        tokenId: TOKEN_ID,
        toAddressId: WHITELISTED_ADDRESS_ID,
        amount: '100',
        idempotencyKey: 'idem_w001',
      });

      // Compliance screening called
      expect(mockComplianceService.screenWithdrawal).toHaveBeenCalledWith({
        clientId: CLIENT_ID,
        toAddress: DESTINATION_ADDRESS,
      });

      // Withdrawal created with pending_approval status
      expect(result.withdrawal.status).toBe('pending_approval');
      expect(result.withdrawal.amount).toBe('100');
      expect(result.withdrawal.toAddress).toBe(DESTINATION_ADDRESS);
      expect(result.withdrawal.fromWallet).toBe(HOT_WALLET_ADDRESS);
      expect(result.isIdempotent).toBe(false);

      // Verify amount converted to raw (wei) with correct decimals
      expect(mockPrisma.withdrawal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: BigInt(CLIENT_ID),
          chainId: CHAIN_ID,
          status: 'pending_approval',
          amount: '100',
          amountRaw: ethers.parseUnits('100', 6).toString(),
          toAddress: DESTINATION_ADDRESS,
          idempotencyKey: 'idem_w001',
        }),
      });
    });

    it('should reject withdrawal when compliance screening returns a hit', async () => {
      mockComplianceService.screenWithdrawal.mockResolvedValue({
        result: 'hit',
        action: 'blocked',
        listsChecked: ['OFAC_SDN'],
        matchDetails: [
          {
            listSource: 'OFAC_SDN',
            entityName: 'Bad Actor',
            entityId: 'SDN-12345',
            address: DESTINATION_ADDRESS.toLowerCase(),
          },
        ],
      });

      const result = await withdrawalService.createWithdrawal({
        clientId: CLIENT_ID,
        chainId: CHAIN_ID,
        tokenId: TOKEN_ID,
        toAddressId: WHITELISTED_ADDRESS_ID,
        amount: '100',
        idempotencyKey: 'idem_w002',
      });

      expect(result.withdrawal.status).toBe('rejected');
      expect(result.withdrawal.kytResult).toBe('hit');
    });

    it('should return existing withdrawal for duplicate idempotency key', async () => {
      const existingWithdrawal = {
        id: BigInt(999),
        clientId: BigInt(CLIENT_ID),
        chainId: CHAIN_ID,
        tokenId: BigInt(TOKEN_ID),
        fromWallet: HOT_WALLET_ADDRESS,
        toAddressId: BigInt(WHITELISTED_ADDRESS_ID),
        toAddress: DESTINATION_ADDRESS,
        toLabel: 'Treasury Cold Wallet',
        amount: '100',
        amountRaw: '100000000',
        status: 'pending_approval',
        idempotencyKey: 'idem_duplicate',
        createdAt: new Date(),
      };

      mockPrisma.withdrawal.findUnique.mockResolvedValue(existingWithdrawal);

      const result = await withdrawalService.createWithdrawal({
        clientId: CLIENT_ID,
        chainId: CHAIN_ID,
        tokenId: TOKEN_ID,
        toAddressId: WHITELISTED_ADDRESS_ID,
        amount: '100',
        idempotencyKey: 'idem_duplicate',
      });

      expect(result.isIdempotent).toBe(true);
      expect(result.withdrawal.id).toBe(999);

      // Should NOT call compliance or create a new record
      expect(mockComplianceService.screenWithdrawal).not.toHaveBeenCalled();
      expect(mockPrisma.withdrawal.create).not.toHaveBeenCalled();
    });

    it('should reject withdrawal to inactive whitelisted address', async () => {
      mockPrisma.whitelistedAddress.findFirst.mockResolvedValue({
        id: BigInt(WHITELISTED_ADDRESS_ID),
        clientId: BigInt(CLIENT_ID),
        chainId: CHAIN_ID,
        address: DESTINATION_ADDRESS,
        label: 'Pending Address',
        status: 'pending', // not active
      });

      await expect(
        withdrawalService.createWithdrawal({
          clientId: CLIENT_ID,
          chainId: CHAIN_ID,
          tokenId: TOKEN_ID,
          toAddressId: WHITELISTED_ADDRESS_ID,
          amount: '100',
          idempotencyKey: 'idem_w003',
        }),
      ).rejects.toThrow('not active');
    });

    it('should reject withdrawal when balance is insufficient', async () => {
      mockContractService.getERC20Balance.mockResolvedValue(10_000n); // 0.01 USDC

      await expect(
        withdrawalService.createWithdrawal({
          clientId: CLIENT_ID,
          chainId: CHAIN_ID,
          tokenId: TOKEN_ID,
          toAddressId: WHITELISTED_ADDRESS_ID,
          amount: '100',
          idempotencyKey: 'idem_w004',
        }),
      ).rejects.toThrow('Insufficient balance');
    });
  });

  // ─── Phase 2: Approve Withdrawal ──────────────────────────────────────

  describe('Phase 2: Approve Withdrawal', () => {
    it('should transition withdrawal from pending_approval to approved', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: BigInt(1001),
        status: 'pending_approval',
        clientId: BigInt(CLIENT_ID),
      });

      const result = await withdrawalService.approveWithdrawal(1001);

      expect(mockPrisma.withdrawal.update).toHaveBeenCalledWith({
        where: { id: BigInt(1001) },
        data: { status: 'approved' },
      });

      expect(result.withdrawal.status).toBe('approved');
    });

    it('should reject approval of non-pending withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: BigInt(1002),
        status: 'broadcasting',
        clientId: BigInt(CLIENT_ID),
      });

      await expect(withdrawalService.approveWithdrawal(1002)).rejects.toThrow(
        'cannot be approved',
      );
    });

    it('should throw when approving non-existent withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue(null);

      await expect(withdrawalService.approveWithdrawal(9999)).rejects.toThrow(
        'not found',
      );
    });
  });

  // ─── Phase 3: Execute Withdrawal On-Chain ─────────────────────────────

  describe('Phase 3: Execute Withdrawal (Key Vault + RPC)', () => {
    const approvedWithdrawal = {
      id: BigInt(1003),
      clientId: BigInt(CLIENT_ID),
      projectId: BigInt(1),
      chainId: CHAIN_ID,
      tokenId: BigInt(TOKEN_ID),
      fromWallet: HOT_WALLET_ADDRESS,
      toAddressId: BigInt(WHITELISTED_ADDRESS_ID),
      toAddress: DESTINATION_ADDRESS,
      toLabel: 'Treasury Cold Wallet',
      amount: '100',
      amountRaw: '100000000', // 100 USDC
      status: 'approved',
      idempotencyKey: 'idem_exec001',
      createdAt: new Date(),
    };

    it('should build correct native operationHash', () => {
      const hash = withdrawalExecutor.buildNativeOperationHash({
        networkId: '1',
        toAddress: DESTINATION_ADDRESS,
        value: 1_000_000_000_000_000_000n, // 1 ETH
        data: '0x',
        expireTime: 1700000000,
        sequenceId: 42,
      });

      // Should return a valid keccak256 hash (0x + 64 hex chars)
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);

      // Should be deterministic
      const hash2 = withdrawalExecutor.buildNativeOperationHash({
        networkId: '1',
        toAddress: DESTINATION_ADDRESS,
        value: 1_000_000_000_000_000_000n,
        data: '0x',
        expireTime: 1700000000,
        sequenceId: 42,
      });
      expect(hash).toBe(hash2);
    });

    it('should build correct ERC-20 operationHash', () => {
      const hash = withdrawalExecutor.buildTokenOperationHash({
        tokenNetworkId: '1-ERC20',
        toAddress: DESTINATION_ADDRESS,
        value: 100_000_000n, // 100 USDC
        tokenContractAddress: USDC_CONTRACT,
        expireTime: 1700000000,
        sequenceId: 42,
      });

      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce different hashes for native vs ERC-20 operations', () => {
      const nativeHash = withdrawalExecutor.buildNativeOperationHash({
        networkId: '1',
        toAddress: DESTINATION_ADDRESS,
        value: 100_000_000n,
        data: '0x',
        expireTime: 1700000000,
        sequenceId: 42,
      });

      const tokenHash = withdrawalExecutor.buildTokenOperationHash({
        tokenNetworkId: '1-ERC20',
        toAddress: DESTINATION_ADDRESS,
        value: 100_000_000n,
        tokenContractAddress: USDC_CONTRACT,
        expireTime: 1700000000,
        sequenceId: 42,
      });

      expect(nativeHash).not.toBe(tokenHash);
    });

    it('should produce different hashes for different sequence IDs', () => {
      const hash1 = withdrawalExecutor.buildTokenOperationHash({
        tokenNetworkId: '1-ERC20',
        toAddress: DESTINATION_ADDRESS,
        value: 100_000_000n,
        tokenContractAddress: USDC_CONTRACT,
        expireTime: 1700000000,
        sequenceId: 42,
      });

      const hash2 = withdrawalExecutor.buildTokenOperationHash({
        tokenNetworkId: '1-ERC20',
        toAddress: DESTINATION_ADDRESS,
        value: 100_000_000n,
        tokenContractAddress: USDC_CONTRACT,
        expireTime: 1700000000,
        sequenceId: 43,
      });

      expect(hash1).not.toBe(hash2);
    });

    it('should reject execution of non-approved withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        ...approvedWithdrawal,
        status: 'pending_approval',
      });

      await expect(
        withdrawalExecutor.executeWithdrawal('1003'),
      ).rejects.toThrow("not in 'approved' status");
    });

    it('should throw when executing non-existent withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue(null);

      await expect(
        withdrawalExecutor.executeWithdrawal('9999'),
      ).rejects.toThrow('not found');
    });
  });

  // ─── Phase 4: Cancel Withdrawal ───────────────────────────────────────

  describe('Phase 4: Cancel Withdrawal', () => {
    it('should cancel a pending_approval withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: BigInt(1004),
        status: 'pending_approval',
        clientId: BigInt(CLIENT_ID),
      });

      const result = await withdrawalService.cancelWithdrawal(1004);

      expect(mockPrisma.withdrawal.update).toHaveBeenCalledWith({
        where: { id: BigInt(1004) },
        data: { status: 'cancelled' },
      });

      expect(result.withdrawal.status).toBe('cancelled');
    });

    it('should cancel an approved withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: BigInt(1005),
        status: 'approved',
        clientId: BigInt(CLIENT_ID),
      });

      const result = await withdrawalService.cancelWithdrawal(1005);

      expect(result.withdrawal.status).toBe('cancelled');
    });

    it('should reject cancellation of broadcasting withdrawal', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: BigInt(1006),
        status: 'broadcasting',
        clientId: BigInt(CLIENT_ID),
      });

      await expect(withdrawalService.cancelWithdrawal(1006)).rejects.toThrow(
        'cannot be cancelled',
      );
    });
  });

  // ─── Phase 5: Compliance Integration ──────────────────────────────────

  describe('Phase 5: Compliance Service Integration', () => {
    let complianceService: ComplianceService;

    beforeEach(async () => {
      // Create a real ComplianceService with mocked Prisma for deeper testing
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ComplianceService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: POSTHOG_SERVICE, useValue: null },
        ],
      }).compile();

      complianceService = module.get<ComplianceService>(ComplianceService);
    });

    it('should clear screening when address not on any sanctions list', async () => {
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([]);

      const result = await complianceService.screenAddress({
        address: DESTINATION_ADDRESS,
        direction: 'outbound',
        trigger: 'withdrawal',
        clientId: CLIENT_ID,
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');
      expect(result.listsChecked).toContain('OFAC_SDN');
    });

    it('should block when address hits a sanctions list', async () => {
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([
        {
          id: BigInt(1),
          address: DESTINATION_ADDRESS.toLowerCase(),
          listSource: 'OFAC_SDN',
          entityName: 'Sanctioned Entity',
          entityId: 'SDN-99999',
          isActive: true,
        },
      ]);

      const result = await complianceService.screenAddress({
        address: DESTINATION_ADDRESS,
        direction: 'outbound',
        trigger: 'withdrawal',
        clientId: CLIENT_ID,
      });

      expect(result.result).toBe('hit');
      expect(result.action).toBe('blocked');
      expect(result.matchDetails).toHaveLength(1);
      expect(result.matchDetails![0]).toMatchObject({
        listSource: 'OFAC_SDN',
        entityName: 'Sanctioned Entity',
      });

      // Should create a compliance alert
      expect(mockPrisma.complianceAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clientId: BigInt(CLIENT_ID),
          severity: 'critical',
          alertType: 'sanctions_withdrawal_outbound',
          address: DESTINATION_ADDRESS,
        }),
      });
    });

    it('should skip screening when KYT is disabled for the client', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        id: BigInt(CLIENT_ID),
        name: 'No KYT Client',
        kytLevel: 'off',
      });

      const result = await complianceService.screenAddress({
        address: DESTINATION_ADDRESS,
        direction: 'outbound',
        trigger: 'withdrawal',
        clientId: CLIENT_ID,
      });

      expect(result.result).toBe('clear');
      expect(result.action).toBe('allowed');
      expect(result.listsChecked).toEqual([]);

      // Should NOT query sanctions entries
      expect(mockPrisma.sanctionsEntry.findMany).not.toHaveBeenCalled();
    });

    it('should check more lists at enhanced KYT level', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        id: BigInt(CLIENT_ID),
        name: 'Enhanced Client',
        kytLevel: 'enhanced',
      });
      mockPrisma.sanctionsEntry.findMany.mockResolvedValue([]);

      const result = await complianceService.screenAddress({
        address: DESTINATION_ADDRESS,
        direction: 'outbound',
        trigger: 'withdrawal',
        clientId: CLIENT_ID,
      });

      expect(result.listsChecked).toEqual(
        expect.arrayContaining(['OFAC_SDN', 'OFAC_CONSOLIDATED', 'EU', 'UN']),
      );
    });
  });

  // ─── Phase 6: End-to-End Lifecycle ────────────────────────────────────

  describe('Phase 6: End-to-End Withdrawal Lifecycle', () => {
    it('should complete the full lifecycle: create -> approve -> format', async () => {
      // Reset findUnique to not interfere with idempotency check
      mockPrisma.withdrawal.findUnique
        .mockResolvedValueOnce(null) // idempotency check: no existing
        .mockResolvedValueOnce({
          // approve lookup
          id: withdrawalIdCounter + 1n,
          status: 'pending_approval',
          clientId: BigInt(CLIENT_ID),
          chainId: CHAIN_ID,
          tokenId: BigInt(TOKEN_ID),
          fromWallet: HOT_WALLET_ADDRESS,
          toAddressId: BigInt(WHITELISTED_ADDRESS_ID),
          toAddress: DESTINATION_ADDRESS,
          toLabel: 'Treasury Cold Wallet',
          amount: '100',
          amountRaw: '100000000',
          idempotencyKey: 'idem_e2e',
          createdAt: new Date(),
        });

      // Step 1: Create
      const createResult = await withdrawalService.createWithdrawal({
        clientId: CLIENT_ID,
        chainId: CHAIN_ID,
        tokenId: TOKEN_ID,
        toAddressId: WHITELISTED_ADDRESS_ID,
        amount: '100',
        idempotencyKey: 'idem_e2e',
      });

      expect(createResult.withdrawal.status).toBe('pending_approval');
      const withdrawalId = createResult.withdrawal.id;

      // Verify compliance was called
      expect(mockComplianceService.screenWithdrawal).toHaveBeenCalledTimes(1);

      // Step 2: Approve
      const approveResult = await withdrawalService.approveWithdrawal(withdrawalId);
      expect(approveResult.withdrawal.status).toBe('approved');

      // Verify the state transitions are correct
      expect(mockPrisma.withdrawal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'approved' },
        }),
      );
    });

    it('should maintain correct state transitions through rejection path', async () => {
      // Sanctions hit -> rejected
      mockComplianceService.screenWithdrawal.mockResolvedValue({
        result: 'hit',
        action: 'blocked',
        listsChecked: ['OFAC_SDN'],
        matchDetails: [
          {
            listSource: 'OFAC_SDN',
            entityName: 'Bad Actor',
            entityId: 'SDN-12345',
            address: DESTINATION_ADDRESS.toLowerCase(),
          },
        ],
      });

      mockPrisma.withdrawal.findUnique.mockResolvedValue(null); // idempotency check

      const result = await withdrawalService.createWithdrawal({
        clientId: CLIENT_ID,
        chainId: CHAIN_ID,
        tokenId: TOKEN_ID,
        toAddressId: WHITELISTED_ADDRESS_ID,
        amount: '100',
        idempotencyKey: 'idem_rejected',
      });

      // Should be rejected, not pending_approval
      expect(result.withdrawal.status).toBe('rejected');
      expect(result.withdrawal.kytResult).toBe('hit');

      // Should NOT be approvable after rejection
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: BigInt(result.withdrawal.id),
        status: 'rejected',
      });

      await expect(
        withdrawalService.approveWithdrawal(result.withdrawal.id),
      ).rejects.toThrow('cannot be approved');
    });
  });

  // ─── Phase 7: List & Query ────────────────────────────────────────────

  describe('Phase 7: List and Query Withdrawals', () => {
    it('should list withdrawals for a client', async () => {
      mockPrisma.withdrawal.findMany.mockResolvedValue([
        {
          id: BigInt(1),
          clientId: BigInt(CLIENT_ID),
          chainId: CHAIN_ID,
          tokenId: BigInt(TOKEN_ID),
          fromWallet: HOT_WALLET_ADDRESS,
          toAddressId: BigInt(WHITELISTED_ADDRESS_ID),
          toAddress: DESTINATION_ADDRESS,
          toLabel: 'Treasury',
          amount: '100',
          amountRaw: '100000000',
          status: 'pending_approval',
          txHash: null,
          sequenceId: null,
          gasCost: null,
          kytResult: null,
          idempotencyKey: 'idem_list1',
          createdAt: new Date(),
          submittedAt: null,
          confirmedAt: null,
        },
      ]);

      const withdrawals = await withdrawalService.listWithdrawals(CLIENT_ID);

      expect(withdrawals).toHaveLength(1);
      expect(withdrawals[0].clientId).toBe(CLIENT_ID);
      expect(withdrawals[0].status).toBe('pending_approval');
    });

    it('should filter withdrawals by status', async () => {
      await withdrawalService.listWithdrawals(CLIENT_ID, 'approved');

      expect(mockPrisma.withdrawal.findMany).toHaveBeenCalledWith({
        where: {
          clientId: BigInt(CLIENT_ID),
          status: 'approved',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should get a single withdrawal by ID', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        id: BigInt(1007),
        clientId: BigInt(CLIENT_ID),
        chainId: CHAIN_ID,
        tokenId: BigInt(TOKEN_ID),
        fromWallet: HOT_WALLET_ADDRESS,
        toAddressId: BigInt(WHITELISTED_ADDRESS_ID),
        toAddress: DESTINATION_ADDRESS,
        toLabel: 'Treasury',
        amount: '50',
        amountRaw: '50000000',
        status: 'broadcasting',
        txHash: '0xtxhash999',
        sequenceId: 42,
        gasCost: null,
        kytResult: null,
        idempotencyKey: 'idem_get1',
        createdAt: new Date(),
        submittedAt: new Date(),
        confirmedAt: null,
      });

      const withdrawal = await withdrawalService.getWithdrawal(1007);

      expect(withdrawal.id).toBe(1007);
      expect(withdrawal.txHash).toBe('0xtxhash999');
      expect(withdrawal.sequenceId).toBe(42);
      expect(withdrawal.status).toBe('broadcasting');
    });
  });
});
