import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import {
  WithdrawalExecutorService,
  ExecuteWithdrawalResult,
} from './withdrawal-executor.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { NonceService } from '../blockchain/nonce.service';

// Mock global fetch for Key Vault calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('WithdrawalExecutorService', () => {
  let service: WithdrawalExecutorService;
  let mockPrisma: any;
  let mockEvmProvider: any;
  let mockNonceService: any;
  let mockProvider: any;

  const KEY_VAULT_URL = 'http://key-vault:3005';
  const INTERNAL_SERVICE_KEY = 'test-internal-key';

  const mockWithdrawal = {
    id: BigInt(1),
    clientId: BigInt(42),
    chainId: 1,
    projectId: BigInt(10),
    tokenId: BigInt(1),
    toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
    amount: '1.5',
    amountRaw: '1500000000000000000',
    status: 'approved',
    txHash: null,
    sequenceId: null,
    fromWallet: '0xHotWalletAddress',
  };

  const mockToken = {
    id: BigInt(1),
    chainId: 1,
    symbol: 'ETH',
    decimals: 18,
    isActive: true,
    isNative: true,
    contractAddress: null,
  };

  const mockErc20Token = {
    id: BigInt(2),
    chainId: 1,
    symbol: 'USDC',
    decimals: 6,
    isActive: true,
    isNative: false,
    contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  };

  const mockProjectChain = {
    projectId: BigInt(10),
    chainId: 1,
    hotWalletAddress: '0xProjectHotWallet',
    hotWalletSequenceId: 5,
    walletFactoryAddress: '0xFactory',
  };

  const mockGasTank = {
    address: '0xGasTankAddress',
    clientId: BigInt(42),
    chainId: 1,
    walletType: 'gas_tank',
  };

  const mockSignResponse = {
    success: true,
    clientId: 42,
    signature: '0x' + 'ab'.repeat(65),
    v: 27,
    r: '0x' + 'aa'.repeat(32),
    s: '0x' + 'bb'.repeat(32),
    address: '0xSignerAddress',
  };

  const mockGasTankDecrypt = {
    success: true,
    // Use a deterministic test private key (DO NOT use in production)
    privateKey: '0x' + '11'.repeat(32),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock provider with getNextSequenceId
    mockProvider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: 1n }),
    };

    mockPrisma = {
      withdrawal: {
        findUnique: jest.fn().mockResolvedValue(mockWithdrawal),
        update: jest.fn().mockResolvedValue({ ...mockWithdrawal, status: 'broadcasting' }),
      },
      token: {
        findUnique: jest.fn().mockResolvedValue(mockToken),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue(mockGasTank),
      },
      projectChain: {
        findUnique: jest.fn().mockResolvedValue(mockProjectChain),
        update: jest.fn(),
      },
    };

    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
    };

    mockNonceService = {
      acquireNonce: jest.fn().mockResolvedValue({
        nonce: 42,
        release: jest.fn().mockResolvedValue(undefined),
      }),
      resetNonce: jest.fn().mockResolvedValue(undefined),
    };

    // Default mock for fetch (Key Vault sign + decrypt)
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/sign')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSignResponse),
        });
      }
      if (url.includes('/decrypt-gas-tank')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGasTankDecrypt),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: () => 'Not found' });
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalExecutorService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => {
              if (key === 'KEY_VAULT_URL') return KEY_VAULT_URL;
              if (key === 'INTERNAL_SERVICE_KEY') return INTERNAL_SERVICE_KEY;
              if (key === 'WITHDRAWAL_EXPIRE_SECONDS') return 3600;
              return fallback;
            }),
          },
        },
        { provide: EvmProviderService, useValue: mockEvmProvider },
        { provide: NonceService, useValue: mockNonceService },
      ],
    }).compile();

    service = module.get<WithdrawalExecutorService>(WithdrawalExecutorService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- executeWithdrawal: basics ----------

  describe('executeWithdrawal — validation', () => {
    it('should throw NotFoundException when withdrawal does not exist', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue(null);

      await expect(service.executeWithdrawal('999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw Error when withdrawal status is not approved', async () => {
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        ...mockWithdrawal,
        status: 'pending_approval',
      });

      await expect(service.executeWithdrawal('1')).rejects.toThrow(
        "not in 'approved' status",
      );
    });

    it('should throw Error when token is not found', async () => {
      mockPrisma.token.findUnique.mockResolvedValue(null);

      await expect(service.executeWithdrawal('1')).rejects.toThrow(
        'Token',
      );
    });

    it('should throw Error when gas tank wallet is not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      // Use legacy path (no project chain)
      mockPrisma.projectChain.findUnique.mockResolvedValue(null);

      await expect(service.executeWithdrawal('1')).rejects.toThrow(
        'Hot wallet not found',
      );
    });
  });

  // ---------- operationHash building ----------

  describe('buildNativeOperationHash', () => {
    it('should produce a valid keccak256 hash for native ETH', () => {
      const hash = service.buildNativeOperationHash({
        networkId: '1',
        toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
        value: BigInt('1500000000000000000'),
        data: '0x',
        expireTime: 1700000000,
        sequenceId: 5,
      });

      // Should be a valid 66-character hex string (0x + 64 hex chars)
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should produce deterministic output for the same inputs', () => {
      const params = {
        networkId: '137',
        toAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        value: BigInt('500000'),
        data: '0x',
        expireTime: 1700000000,
        sequenceId: 10,
      };

      const hash1 = service.buildNativeOperationHash(params);
      const hash2 = service.buildNativeOperationHash(params);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different sequence IDs', () => {
      const baseParams = {
        networkId: '1',
        toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
        value: BigInt('1000'),
        data: '0x',
        expireTime: 1700000000,
      };

      const hash1 = service.buildNativeOperationHash({
        ...baseParams,
        sequenceId: 5,
      });
      const hash2 = service.buildNativeOperationHash({
        ...baseParams,
        sequenceId: 6,
      });

      expect(hash1).not.toBe(hash2);
    });

    it('should match ethers ABI encoding (keccak256 of abi.encode)', () => {
      const params = {
        networkId: '1',
        toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
        value: BigInt('1500000000000000000'),
        data: '0x',
        expireTime: 1700000000,
        sequenceId: 5,
      };

      const hash = service.buildNativeOperationHash(params);

      // Manually verify using ethers
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encoded = abiCoder.encode(
        ['string', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
        [
          params.networkId,
          params.toAddress,
          params.value,
          params.data,
          params.expireTime,
          params.sequenceId,
        ],
      );
      const expected = ethers.keccak256(encoded);

      expect(hash).toBe(expected);
    });
  });

  describe('buildTokenOperationHash', () => {
    it('should produce a valid keccak256 hash for ERC-20 tokens', () => {
      const hash = service.buildTokenOperationHash({
        tokenNetworkId: '1-ERC20',
        toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
        value: BigInt('1500000'),
        tokenContractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        expireTime: 1700000000,
        sequenceId: 5,
      });

      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should use tokenNetworkId format: chainId-ERC20', () => {
      const params = {
        tokenNetworkId: '137-ERC20',
        toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
        value: BigInt('1000000'),
        tokenContractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        expireTime: 1700000000,
        sequenceId: 10,
      };

      const hash = service.buildTokenOperationHash(params);

      // Manually verify
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encoded = abiCoder.encode(
        ['string', 'address', 'uint256', 'address', 'uint256', 'uint256'],
        [
          params.tokenNetworkId,
          params.toAddress,
          params.value,
          params.tokenContractAddress,
          params.expireTime,
          params.sequenceId,
        ],
      );
      const expected = ethers.keccak256(encoded);

      expect(hash).toBe(expected);
    });

    it('should produce different hashes for native vs ERC-20 with same amount', () => {
      const nativeHash = service.buildNativeOperationHash({
        networkId: '1',
        toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
        value: BigInt('1000'),
        data: '0x',
        expireTime: 1700000000,
        sequenceId: 5,
      });

      const tokenHash = service.buildTokenOperationHash({
        tokenNetworkId: '1-ERC20',
        toAddress: '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
        value: BigInt('1000'),
        tokenContractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        expireTime: 1700000000,
        sequenceId: 5,
      });

      expect(nativeHash).not.toBe(tokenHash);
    });
  });

  // ---------- getNextSequenceId ----------

  describe('getNextSequenceId', () => {
    it('should return the next sequence ID from the contract', async () => {
      // Mock the ethers Contract to return a sequence ID
      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(7)),
      };

      // We need to mock ethers.Contract constructor
      const ContractSpy = jest
        .spyOn(ethers, 'Contract')
        .mockReturnValue(mockContract as any);

      const seqId = await service.getNextSequenceId(
        '0xHotWalletAddress',
        mockProvider,
      );

      expect(seqId).toBe(7);
      expect(mockContract.getNextSequenceId).toHaveBeenCalled();

      ContractSpy.mockRestore();
    });
  });

  // ---------- getProjectWalletInfo ----------

  describe('getProjectWalletInfo', () => {
    it('should return project wallet info when project has a hot wallet', async () => {
      const result = await service.getProjectWalletInfo(BigInt(10), 1);

      expect(result).toEqual({
        hotWalletAddress: '0xProjectHotWallet',
        sequenceId: 5,
        walletFactoryAddress: '0xFactory',
      });
    });

    it('should return null when project chain does not exist', async () => {
      mockPrisma.projectChain.findUnique.mockResolvedValue(null);

      const result = await service.getProjectWalletInfo(BigInt(999), 1);

      expect(result).toBeNull();
    });

    it('should return null when project chain has no hot wallet address', async () => {
      mockPrisma.projectChain.findUnique.mockResolvedValue({
        ...mockProjectChain,
        hotWalletAddress: null,
      });

      const result = await service.getProjectWalletInfo(BigInt(10), 1);

      expect(result).toBeNull();
    });
  });

  // ---------- Key Vault interactions ----------

  describe('Key Vault signing', () => {
    it('should call Key Vault sign endpoint with correct headers and payload', async () => {
      // Use the private signViaKeyVault method indirectly through executeWithdrawal
      // The fetch mock verifies the correct URL and payload
      const signCalls: Array<{ url: string; options: any }> = [];
      mockFetch.mockImplementation((url: string, options: any) => {
        signCalls.push({ url, options });
        if (url.includes('/sign')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSignResponse),
          });
        }
        if (url.includes('/decrypt-gas-tank')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockGasTankDecrypt),
          });
        }
        return Promise.resolve({ ok: false, status: 404, text: () => 'Not found' });
      });

      // We need to mock getNextSequenceId and the transaction send
      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash123' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await service.executeWithdrawal('1');

      // Verify the sign call
      const signCall = signCalls.find((c) => c.url.includes('/sign'));
      expect(signCall).toBeDefined();
      expect(signCall!.url).toBe(`${KEY_VAULT_URL}/keys/42/sign`);
      const signBody = JSON.parse(signCall!.options.body);
      expect(signBody.keyType).toBe('platform');
      expect(signBody.requestedBy).toBe('withdrawal-executor');
      expect(signCall!.options.headers['X-Internal-Service-Key']).toBe(
        INTERNAL_SERVICE_KEY,
      );
    });

    it('should throw Error when Key Vault sign fails', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/sign')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('HSM timeout'),
          });
        }
        if (url.includes('/decrypt-gas-tank')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockGasTankDecrypt),
          });
        }
        return Promise.resolve({ ok: false, status: 404, text: () => 'Not found' });
      });

      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      await expect(service.executeWithdrawal('1')).rejects.toThrow(
        'Key Vault sign failed',
      );
    });
  });

  // ---------- Sequence ID management ----------

  describe('sequence ID management', () => {
    it('should increment project sequence ID after successful broadcast', async () => {
      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await service.executeWithdrawal('1');

      expect(mockPrisma.projectChain.update).toHaveBeenCalledWith({
        where: {
          uq_project_chain: {
            projectId: BigInt(10),
            chainId: 1,
          },
        },
        data: {
          hotWalletSequenceId: { increment: 1 },
        },
      });
    });

    it('should NOT increment project sequence ID when using legacy client hot wallet', async () => {
      // No project chain -> legacy path
      mockPrisma.projectChain.findUnique.mockResolvedValue(null);

      const mockHotWallet = {
        address: '0xLegacyHotWallet',
        clientId: BigInt(42),
        chainId: 1,
        walletType: 'hot',
      };

      // First call is for hot wallet (via projectChain returning null -> falls to legacy)
      // Second call is for gas_tank wallet
      mockPrisma.wallet.findUnique
        .mockResolvedValueOnce(mockHotWallet) // hot wallet lookup
        .mockResolvedValueOnce(mockGasTank); // gas tank lookup

      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(3)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await service.executeWithdrawal('1');

      // projectChain.update should NOT have been called
      expect(mockPrisma.projectChain.update).not.toHaveBeenCalled();
    });
  });

  // ---------- Nonce management ----------

  describe('nonce management', () => {
    it('should acquire nonce before sending transaction', async () => {
      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await service.executeWithdrawal('1');

      expect(mockNonceService.acquireNonce).toHaveBeenCalledWith(
        1,
        '0xGasTankAddress',
      );

      // Verify the nonce was used in the transaction
      expect(mockWallet.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ nonce: 42 }),
      );
    });

    it('should release nonce lock after successful transaction', async () => {
      const releaseFn = jest.fn().mockResolvedValue(undefined);
      mockNonceService.acquireNonce.mockResolvedValue({
        nonce: 42,
        release: releaseFn,
      });

      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await service.executeWithdrawal('1');

      expect(releaseFn).toHaveBeenCalled();
    });

    it('should reset nonce cache on transaction failure', async () => {
      const releaseFn = jest.fn().mockResolvedValue(undefined);
      mockNonceService.acquireNonce.mockResolvedValue({
        nonce: 42,
        release: releaseFn,
      });

      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockRejectedValue(new Error('gas too low')),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await expect(service.executeWithdrawal('1')).rejects.toThrow(
        'gas too low',
      );

      // Nonce should be reset on failure
      expect(mockNonceService.resetNonce).toHaveBeenCalledWith(
        1,
        '0xGasTankAddress',
      );
      // Release should still be called (in finally block)
      expect(releaseFn).toHaveBeenCalled();
    });
  });

  // ---------- Full execution flow ----------

  describe('executeWithdrawal — full flow', () => {
    it('should execute a native ETH withdrawal end-to-end', async () => {
      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xsendMultiSigData'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest
          .fn()
          .mockResolvedValue({ hash: '0xbroadcastedTxHash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      const result = await service.executeWithdrawal('1');

      // Verify result
      expect(result.txHash).toBe('0xbroadcastedTxHash');
      expect(result.sequenceId).toBe(5);
      expect(result.submittedAt).toBeInstanceOf(Date);

      // Verify withdrawal was updated to broadcasting
      expect(mockPrisma.withdrawal.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: expect.objectContaining({
          status: 'broadcasting',
          txHash: '0xbroadcastedTxHash',
          sequenceId: 5,
        }),
      });

      // Verify encodeFunctionData was called with sendMultiSig (native)
      expect(mockContract.interface.encodeFunctionData).toHaveBeenCalledWith(
        'sendMultiSig',
        expect.arrayContaining([
          '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
          BigInt('1500000000000000000'),
          '0x',
        ]),
      );
    });

    it('should execute an ERC-20 withdrawal with sendMultiSigToken', async () => {
      // Use ERC-20 token
      mockPrisma.token.findUnique.mockResolvedValue(mockErc20Token);
      mockPrisma.withdrawal.findUnique.mockResolvedValue({
        ...mockWithdrawal,
        tokenId: BigInt(2),
        amountRaw: '1500000', // 1.5 USDC (6 decimals)
      });

      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(8)),
        interface: {
          encodeFunctionData: jest
            .fn()
            .mockReturnValue('0xsendMultiSigTokenData'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest
          .fn()
          .mockResolvedValue({ hash: '0xerc20TxHash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      const result = await service.executeWithdrawal('1');

      expect(result.txHash).toBe('0xerc20TxHash');
      expect(result.sequenceId).toBe(8);

      // Verify encodeFunctionData was called with sendMultiSigToken (ERC-20)
      expect(mockContract.interface.encodeFunctionData).toHaveBeenCalledWith(
        'sendMultiSigToken',
        expect.arrayContaining([
          '0x742D35Cc6634C0532925A3b844Bc9E7595F2BD68',
          BigInt('1500000'),
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        ]),
      );
    });

    it('should use project hot wallet when available', async () => {
      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(5)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await service.executeWithdrawal('1');

      // The transaction should be sent to the project hot wallet
      expect(mockWallet.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '0xProjectHotWallet',
        }),
      );
    });

    it('should fall back to legacy client hot wallet when no project chain', async () => {
      mockPrisma.projectChain.findUnique.mockResolvedValue(null);

      const mockHotWallet = {
        address: '0xLegacyHotWallet',
        clientId: BigInt(42),
        chainId: 1,
        walletType: 'hot',
      };
      mockPrisma.wallet.findUnique
        .mockResolvedValueOnce(mockHotWallet) // hot wallet
        .mockResolvedValueOnce(mockGasTank); // gas tank

      const mockContract = {
        getNextSequenceId: jest.fn().mockResolvedValue(BigInt(3)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xencoded'),
        },
      };
      jest.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);

      const mockWallet = {
        sendTransaction: jest.fn().mockResolvedValue({ hash: '0xtxhash' }),
      };
      jest.spyOn(ethers, 'Wallet').mockReturnValue(mockWallet as any);

      await service.executeWithdrawal('1');

      expect(mockWallet.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '0xLegacyHotWallet',
        }),
      );
    });
  });
});
