import axios from 'axios';
import { ApiKeyService } from './api-key.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('ApiKeyService (client-api)', () => {
  const cfg = {
    get: (k: string, d?: any) =>
      k === 'AUTH_SERVICE_URL' ? 'http://auth' : d,
  } as any;
  const projects = {
    listProjects: jest
      .fn()
      .mockResolvedValue([{ id: '11', name: 'BrPay' }, { id: '12', name: 'Other' }]),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('list returns masked keys with project names attached', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        keys: [
          {
            id: '1',
            keyPrefix: 'cvh_live_a',
            scopes: ['wallets:read'],
            label: 'Prod',
            ipAllowlist: null,
            allowedChains: null,
            expiresAt: null,
            lastUsedAt: null,
            usageCount: 0,
            createdAt: '2026-05-08T00:00:00Z',
            projectId: 11,
          },
        ],
      },
    });
    const svc = new ApiKeyService(cfg, projects);
    const out = await svc.list(7);
    expect(out.keys).toHaveLength(1);
    expect(out.keys[0].projectName).toBe('BrPay');
  });

  it('create rejects projectId not owned by client', async () => {
    const svc = new ApiKeyService(cfg, projects);
    await expect(
      svc.create(7, { projectId: 999, scopes: ['wallets:read'] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create rejects unknown scope strings', async () => {
    const svc = new ApiKeyService(cfg, projects);
    await expect(
      svc.create(7, { projectId: 11, scopes: ['totally:bogus'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('create forwards to auth-service internal endpoint and returns rawKey once', async () => {
    mockAxios.post.mockResolvedValue({
      data: {
        success: true,
        apiKey: {
          id: '5',
          key: 'cvh_live_full_secret',
          prefix: 'cvh_live_f',
          clientId: 7,
          scopes: ['wallets:read'],
        },
      },
    });
    const svc = new ApiKeyService(cfg, projects);
    const out = await svc.create(7, {
      projectId: 11,
      scopes: ['wallets:read'],
      label: 'L',
    });
    expect(out.apiKey.key).toBe('cvh_live_full_secret');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://auth/auth/internal/api-keys',
      expect.objectContaining({ clientId: 7, projectId: 11 }),
      expect.any(Object),
    );
  });

  it('revoke verifies ownership before forwarding to auth-service', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        keys: [{ id: '5', keyPrefix: 'cvh_live_f', projectId: 11 }],
      },
    });
    mockAxios.delete.mockResolvedValue({ data: { success: true } });
    const svc = new ApiKeyService(cfg, projects);
    await svc.revoke(7, 5);
    expect(mockAxios.delete).toHaveBeenCalledWith(
      'http://auth/auth/internal/api-keys/5',
      expect.any(Object),
    );
  });

  it('revoke rejects key not owned by the calling client', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, keys: [] } });
    const svc = new ApiKeyService(cfg, projects);
    await expect(svc.revoke(7, 99)).rejects.toThrow(ForbiddenException);
  });
});
