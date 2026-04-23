import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CoSignOrchestratorService } from './co-sign-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

describe('CoSignOrchestratorService', () => {
  let service: CoSignOrchestratorService;
  let mockPrisma: any;
  let mockRedis: any;

  const CLIENT_ID = 1;
  const PROJECT_ID = 10;
  const HOT_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
  const TO_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const AMOUNT_RAW = '1000000000000000000'; // 1 ETH in wei
  const CLIENT_ADDRESS = '0x9876543210fedcba9876543210fedcba98765432';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };

    mockRedis = {
      getCache: jest.fn(),
      setCache: jest.fn(),
      deleteCache: jest.fn(),
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoSignOrchestratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              if (key === 'KEY_VAULT_URL') return 'http://localhost:3005';
              if (key === 'INTERNAL_SERVICE_KEY') return 'test-key';
              return fallback ?? '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CoSignOrchestratorService>(CoSignOrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildOperationHash', () => {
    it('should build correct native ETH hash matching contract encoding', () => {
      const networkId = '1';
      const expireTime = 1714000000;
      const sequenceId = 1;

      const hash = service.buildOperationHash({
        networkId,
        hotWalletAddress: HOT_WALLET,
        toAddress: TO_ADDRESS,
        amountRaw: AMOUNT_RAW,
        tokenContractAddress: null,
        expireTime,
        sequenceId,
      });

      // Verify against manual ethers encoding
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const expected = ethers.keccak256(
        abiCoder.encode(
          ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
          [networkId, HOT_WALLET, TO_ADDRESS, BigInt(AMOUNT_RAW), '0x', expireTime, sequenceId],
        ),
      );
      expect(hash).toBe(expected);
    });

    it('should build correct ERC-20 hash with token address', () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const networkId = '1';
      const expireTime = 1714000000;
      const sequenceId = 2;

      const hash = service.buildOperationHash({
        networkId,
        hotWalletAddress: HOT_WALLET,
        toAddress: TO_ADDRESS,
        amountRaw: '1000000', // 1 USDC
        tokenContractAddress: tokenAddress,
        expireTime,
        sequenceId,
      });

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const expected = ethers.keccak256(
        abiCoder.encode(
          ['string', 'address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
          [`${networkId}-ERC20`, HOT_WALLET, TO_ADDRESS, BigInt('1000000'), tokenAddress, expireTime, sequenceId],
        ),
      );
      expect(hash).toBe(expected);
    });

    it('should produce different hashes for native vs ERC-20 with same params', () => {
      const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const params = {
        networkId: '1',
        hotWalletAddress: HOT_WALLET,
        toAddress: TO_ADDRESS,
        amountRaw: AMOUNT_RAW,
        expireTime: 1714000000,
        sequenceId: 1,
      };

      const nativeHash = service.buildOperationHash({
        ...params,
        tokenContractAddress: null,
      });
      const erc20Hash = service.buildOperationHash({
        ...params,
        tokenContractAddress: tokenAddress,
      });

      expect(nativeHash).not.toBe(erc20Hash);
    });
  });

  describe('verifySignature', () => {
    it('should accept a valid signature from the correct client key', async () => {
      const wallet = ethers.Wallet.createRandom();
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const signature = await wallet.signMessage(ethers.getBytes(operationHash));

      const result = service.verifySignature(operationHash, signature, wallet.address);
      expect(result).toBe(true);
    });

    it('should reject a signature from a different key', async () => {
      const wallet1 = ethers.Wallet.createRandom();
      const wallet2 = ethers.Wallet.createRandom();
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const signature = await wallet1.signMessage(ethers.getBytes(operationHash));

      const result = service.verifySignature(operationHash, signature, wallet2.address);
      expect(result).toBe(false);
    });

    it('should reject a malformed signature', () => {
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      expect(() => {
        service.verifySignature(operationHash, '0xinvalid', CLIENT_ADDRESS);
      }).toThrow();
    });

    it('should handle case-insensitive address comparison', async () => {
      const wallet = ethers.Wallet.createRandom();
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const signature = await wallet.signMessage(ethers.getBytes(operationHash));

      // Pass address in lowercase
      const result = service.verifySignature(
        operationHash,
        signature,
        wallet.address.toLowerCase(),
      );
      expect(result).toBe(true);
    });
  });

  describe('submitCoSignature', () => {
    it('should reject an expired operation', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        id: 1n,
        operation_id: 'cosign_test',
        operation_hash: '0xabc',
        client_address: CLIENT_ADDRESS,
        status: 'pending',
        expires_at: new Date(Date.now() - 60000), // expired 1 min ago
        withdrawal_id: 100n,
      }]);

      await expect(
        service.submitCoSignature('cosign_test', CLIENT_ID, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow('expired');
    });

    it('should reject a non-pending operation', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        id: 1n,
        operation_id: 'cosign_test',
        operation_hash: '0xabc',
        client_address: CLIENT_ADDRESS,
        status: 'signed',
        expires_at: new Date(Date.now() + 86400000),
        withdrawal_id: 100n,
      }]);

      await expect(
        service.submitCoSignature('cosign_test', CLIENT_ID, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow('not pending');
    });

    it('should reject a signature from the wrong signer', async () => {
      // Create a real operation hash and sign with a different wallet
      const wrongWallet = ethers.Wallet.createRandom();
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('withdrawal-data'));
      const signature = await wrongWallet.signMessage(ethers.getBytes(operationHash));

      // The operation expects CLIENT_ADDRESS, but signature is from wrongWallet
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        id: 1n,
        operation_id: 'cosign_test',
        operation_hash: operationHash,
        client_address: CLIENT_ADDRESS,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000),
        withdrawal_id: 100n,
      }]);

      await expect(
        service.submitCoSignature('cosign_test', CLIENT_ID, signature),
      ).rejects.toThrow('does not match');
    });

    it('should accept a valid signature from the correct signer', async () => {
      const wallet = ethers.Wallet.createRandom();
      const operationHash = ethers.keccak256(ethers.toUtf8Bytes('withdrawal-data'));
      const signature = await wallet.signMessage(ethers.getBytes(operationHash));

      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        id: 1n,
        operation_id: 'cosign_valid',
        operation_hash: operationHash,
        client_address: wallet.address,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000),
        withdrawal_id: 100n,
      }]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result = await service.submitCoSignature('cosign_valid', CLIENT_ID, signature);
      expect(result.success).toBe(true);

      // Verify co-sign operation was updated to signed
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      // Verify event was published
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'cosign:signed',
        expect.objectContaining({
          operationId: 'cosign_valid',
          eventType: 'withdrawal.cosigned',
        }),
      );
    });

    it('should throw NotFoundException when operation does not exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        service.submitCoSignature('nonexistent', CLIENT_ID, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPendingOperations', () => {
    it('should query pending operations for a client and project', async () => {
      const mockOps = [
        { operation_id: 'op1', status: 'pending', chain_id: 1 },
        { operation_id: 'op2', status: 'pending', chain_id: 137 },
      ];
      mockPrisma.$queryRaw.mockResolvedValueOnce(mockOps);

      const result = await service.getPendingOperations(CLIENT_ID, PROJECT_ID);
      expect(result).toHaveLength(2);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return empty array when no pending operations', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getPendingOperations(CLIENT_ID, PROJECT_ID);
      expect(result).toHaveLength(0);
    });
  });

  describe('getOperation', () => {
    it('should return the operation by operationId and clientId', async () => {
      const mockOp = {
        operation_id: 'cosign_abc',
        status: 'pending',
        chain_id: 1,
        chain_name: 'Ethereum',
      };
      mockPrisma.$queryRaw.mockResolvedValueOnce([mockOp]);

      const result = await service.getOperation('cosign_abc', CLIENT_ID);
      expect(result.operation_id).toBe('cosign_abc');
    });

    it('should throw NotFoundException when operation not found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        service.getOperation('nonexistent', CLIENT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('expireStaleOperations', () => {
    it('should expire stale operations and cancel their withdrawals', async () => {
      const staleOps = [
        {
          id: 1n,
          operation_id: 'cosign_stale_1',
          withdrawal_id: 100n,
          client_id: 1n,
          project_id: 10n,
          chain_id: 1,
          to_address: TO_ADDRESS,
          amount_raw: AMOUNT_RAW,
        },
        {
          id: 2n,
          operation_id: 'cosign_stale_2',
          withdrawal_id: 200n,
          client_id: 1n,
          project_id: 10n,
          chain_id: 137,
          to_address: TO_ADDRESS,
          amount_raw: '500000',
        },
      ];
      mockPrisma.$queryRaw.mockResolvedValueOnce(staleOps);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const count = await service.expireStaleOperations();
      expect(count).toBe(2);

      // Should update co-sign ops to expired + cancel withdrawals (2 updates per stale op)
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(4);

      // Should publish expired events
      expect(mockRedis.publishToStream).toHaveBeenCalledTimes(2);
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'cosign:expired',
        expect.objectContaining({
          operationId: 'cosign_stale_1',
          eventType: 'withdrawal.cosign_expired',
        }),
      );
    });

    it('should return 0 when no stale operations exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const count = await service.expireStaleOperations();
      expect(count).toBe(0);
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockRedis.publishToStream).not.toHaveBeenCalled();
    });
  });
});
