import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CoSignService } from './co-sign.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CoSignService', () => {
  let service: CoSignService;

  const KEY_VAULT_URL = 'http://key-vault:3005';
  const INTERNAL_SERVICE_KEY = 'test-internal-key';

  const mockPendingOperations = [
    {
      operationId: 'cosign_01HX4N8B2K3M5P7Q9R1S',
      type: 'withdrawal',
      txHash: '0xabc123def456789',
      chainId: 1,
      chainName: 'Ethereum',
      toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68',
      amount: '1.5',
      tokenSymbol: 'ETH',
      status: 'pending_cosign',
      relatedId: 'wd_01HX001',
      createdAt: '2026-04-09T10:00:00Z',
      expiresAt: '2026-04-10T10:00:00Z',
    },
    {
      operationId: 'cosign_01HX4N8B2K3M5P7Q9R1T',
      type: 'sweep',
      txHash: '0xdef789abc123456',
      chainId: 137,
      chainName: 'Polygon',
      toAddress: '0x1234567890abcdef1234567890abcdef12345678',
      amount: '500.0',
      tokenSymbol: 'USDC',
      status: 'pending_cosign',
      relatedId: 'sweep_01HX002',
      createdAt: '2026-04-09T11:00:00Z',
      expiresAt: '2026-04-10T11:00:00Z',
    },
  ];

  const validSignature =
    '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

  beforeEach(async () => {
    jest.clearAllMocks();

    process.env.INTERNAL_SERVICE_KEY = INTERNAL_SERVICE_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoSignService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              if (key === 'KEY_VAULT_SERVICE_URL') return KEY_VAULT_URL;
              return fallback ?? '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CoSignService>(CoSignService);
  });

  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_KEY;
  });

  // ---------- listPending ----------

  describe('listPending', () => {
    it('should return pending operations for the authenticated client', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockPendingOperations });

      const result = await service.listPending(42);

      expect(result).toEqual(mockPendingOperations);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${KEY_VAULT_URL}/co-sign/pending`,
        expect.objectContaining({
          headers: { 'X-Internal-Service-Key': INTERNAL_SERVICE_KEY },
          params: { clientId: 42 },
          timeout: 10000,
        }),
      );
    });

    it('should return an empty array when no operations are pending', async () => {
      mockedAxios.get.mockResolvedValue({ data: [] });

      const result = await service.listPending(42);

      expect(result).toEqual([]);
    });

    it('should propagate downstream HTTP errors as HttpException', async () => {
      const axiosError = {
        response: {
          status: 403,
          data: { message: 'Client is not in co-sign custody mode' },
        },
      };
      mockedAxios.get.mockRejectedValue(axiosError);

      await expect(service.listPending(42)).rejects.toThrow(HttpException);
      await expect(service.listPending(42)).rejects.toThrow(
        'Client is not in co-sign custody mode',
      );
    });

    it('should throw InternalServerErrorException when downstream is unreachable', async () => {
      mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.listPending(42)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.listPending(42)).rejects.toThrow(
        'Downstream service unavailable',
      );
    });

    it('should use default fallback message when downstream error has no message', async () => {
      const axiosError = {
        response: {
          status: 500,
          data: {},
        },
      };
      mockedAxios.get.mockRejectedValue(axiosError);

      await expect(service.listPending(42)).rejects.toThrow(HttpException);
    });
  });

  // ---------- submitSignature ----------

  describe('submitSignature', () => {
    const operationId = 'cosign_01HX4N8B2K3M5P7Q9R1S';

    it('should submit a valid signature and return the result', async () => {
      const mockResult = {
        operation: {
          operationId,
          status: 'signed',
          relatedId: 'wd_01HX001',
          message: 'Co-signature accepted. Transaction queued for broadcast.',
        },
      };
      mockedAxios.post.mockResolvedValue({ data: mockResult });

      const result = await service.submitSignature(42, operationId, {
        signature: validSignature,
      });

      expect(result).toEqual(mockResult);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${KEY_VAULT_URL}/co-sign/${operationId}/sign`,
        { clientId: 42, signature: validSignature },
        expect.objectContaining({
          headers: { 'X-Internal-Service-Key': INTERNAL_SERVICE_KEY },
          timeout: 30000,
        }),
      );
    });

    it('should forward optional publicKey in the request body', async () => {
      const publicKey = '0x04abc123def456789';
      mockedAxios.post.mockResolvedValue({
        data: { operation: { operationId, status: 'signed' } },
      });

      await service.submitSignature(42, operationId, {
        signature: validSignature,
        publicKey,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ publicKey }),
        expect.any(Object),
      );
    });

    it('should reject expired operations (422 from downstream)', async () => {
      const axiosError = {
        response: {
          status: 422,
          data: {
            message: 'Operation has expired (past the expiresAt deadline)',
          },
        },
      };
      mockedAxios.post.mockRejectedValue(axiosError);

      await expect(
        service.submitSignature(42, operationId, {
          signature: validSignature,
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.submitSignature(42, operationId, {
          signature: validSignature,
        });
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(422);
      }
    });

    it('should reject already-signed operations (422 from downstream)', async () => {
      const axiosError = {
        response: {
          status: 422,
          data: { message: 'Operation has already been signed' },
        },
      };
      mockedAxios.post.mockRejectedValue(axiosError);

      await expect(
        service.submitSignature(42, operationId, {
          signature: validSignature,
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.submitSignature(42, operationId, {
          signature: validSignature,
        });
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(422);
        expect((e as HttpException).message).toContain('already been signed');
      }
    });

    it('should reject invalid signatures (422 from downstream)', async () => {
      const axiosError = {
        response: {
          status: 422,
          data: {
            message: 'Signature does not match the expected signer',
          },
        },
      };
      mockedAxios.post.mockRejectedValue(axiosError);

      await expect(
        service.submitSignature(42, operationId, {
          signature: '0xinvalid',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.submitSignature(42, operationId, {
          signature: '0xinvalid',
        });
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(422);
      }
    });

    it('should throw 404 when operation does not exist or belong to client', async () => {
      const axiosError = {
        response: {
          status: 404,
          data: {
            message:
              'Operation not found or does not belong to the authenticated client',
          },
        },
      };
      mockedAxios.post.mockRejectedValue(axiosError);

      await expect(
        service.submitSignature(42, 'cosign_NONEXISTENT', {
          signature: validSignature,
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.submitSignature(42, 'cosign_NONEXISTENT', {
          signature: validSignature,
        });
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(404);
      }
    });

    it('should throw InternalServerErrorException when downstream is unreachable', async () => {
      mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        service.submitSignature(42, operationId, {
          signature: validSignature,
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------- Full E2E-style flow ----------

  describe('full co-sign flow', () => {
    const operationId = 'cosign_01HX4N8B2K3M5P7Q9R1S';

    it('should complete the full flow: list pending -> sign -> operation marked signed', async () => {
      // Step 1: A pending operation appears for the client
      mockedAxios.get.mockResolvedValue({
        data: [mockPendingOperations[0]],
      });

      const pending = await service.listPending(42);
      expect(pending).toHaveLength(1);
      expect(pending[0].operationId).toBe(operationId);
      expect(pending[0].status).toBe('pending_cosign');

      // Step 2: Client retrieves the txHash from the pending operation
      const txHash = pending[0].txHash;
      expect(txHash).toBeDefined();

      // Step 3: Client signs the txHash and submits
      const signedResult = {
        operation: {
          operationId,
          status: 'signed',
          relatedId: 'wd_01HX001',
          message: 'Co-signature accepted. Transaction queued for broadcast.',
        },
      };
      mockedAxios.post.mockResolvedValue({ data: signedResult });

      const result = await service.submitSignature(42, operationId, {
        signature: validSignature,
      });

      expect(result.operation.status).toBe('signed');
      expect(result.operation.message).toContain('queued for broadcast');

      // Step 4: After signing, the operation no longer appears as pending
      mockedAxios.get.mockResolvedValue({ data: [] });

      const afterSign = await service.listPending(42);
      expect(afterSign).toHaveLength(0);
    });

    it('should handle multiple pending operations for the same client', async () => {
      // Both operations are pending
      mockedAxios.get.mockResolvedValue({
        data: mockPendingOperations,
      });

      const pending = await service.listPending(42);
      expect(pending).toHaveLength(2);
      expect(pending[0].type).toBe('withdrawal');
      expect(pending[1].type).toBe('sweep');

      // Sign only the first one
      mockedAxios.post.mockResolvedValue({
        data: {
          operation: {
            operationId: pending[0].operationId,
            status: 'signed',
            relatedId: pending[0].relatedId,
            message: 'Co-signature accepted. Transaction queued for broadcast.',
          },
        },
      });

      const result = await service.submitSignature(
        42,
        pending[0].operationId,
        { signature: validSignature },
      );
      expect(result.operation.status).toBe('signed');

      // After signing the first, only the second remains pending
      mockedAxios.get.mockResolvedValue({
        data: [mockPendingOperations[1]],
      });

      const remaining = await service.listPending(42);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].operationId).toBe(mockPendingOperations[1].operationId);
    });
  });
});
