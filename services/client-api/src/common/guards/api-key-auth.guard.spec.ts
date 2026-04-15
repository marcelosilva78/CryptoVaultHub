import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let configService: ConfigService;
  let reflector: Reflector;

  const mockRequest = (headers: Record<string, string> = {}) => ({
    headers,
    ip: '127.0.0.1',
  });

  const mockExecutionContext = (request: any): ExecutionContext => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return ctx;
  };

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('http://localhost:3003'),
    } as any;

    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as any;

    guard = new ApiKeyAuthGuard(configService, reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Missing credentials ───────────────────────────────

  it('should return 401 for missing API key and no Bearer token', async () => {
    const request = mockRequest({});
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Missing authentication',
    );
  });

  // ─── Invalid API key ───────────────────────────────────

  it('should return 401 for invalid API key', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { valid: false },
    });

    const request = mockRequest({ 'x-api-key': 'cvh_live_invalid' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // ─── Valid API key ─────────────────────────────────────

  it('should allow request with valid API key', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        valid: true,
        clientId: 42,
        scopes: ['read', 'write'],
        allowedChains: [1, 137],
      },
    });

    const request = mockRequest({ 'x-api-key': 'cvh_live_validkey123' });
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request).toHaveProperty('clientId', 42);
    expect(request).toHaveProperty('scopes', ['read', 'write']);
    expect(request).toHaveProperty('allowedChains', [1, 137]);
  });

  // ─── Scope checking ───────────────────────────────────

  it('should return 403 for valid key with insufficient scopes', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        valid: true,
        clientId: 42,
        scopes: ['read'],
      },
    });

    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(['write']);

    const request = mockRequest({ 'x-api-key': 'cvh_live_validkey123' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should pass when required scopes match', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        valid: true,
        clientId: 42,
        scopes: ['read', 'write'],
      },
    });

    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(['read']);

    const request = mockRequest({ 'x-api-key': 'cvh_live_validkey123' });
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  // ─── clientId and scopes attachment ─────────────────────

  it('should attach clientId and scopes to request', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        valid: true,
        clientId: 99,
        scopes: ['read', 'write', 'admin'],
        ipAllowlist: ['10.0.0.0/24'],
        allowedChains: [1],
      },
    });

    const request = mockRequest({ 'x-api-key': 'cvh_live_fullkey' });
    const context = mockExecutionContext(request);

    await guard.canActivate(context);

    expect(request).toHaveProperty('clientId', 99);
    expect(request).toHaveProperty('scopes', ['read', 'write', 'admin']);
    expect(request).toHaveProperty('allowedChains', [1]);
  });

  // ─── IP allowlist ──────────────────────────────────────

  it('should check IP allowlist when configured (valid IP)', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        valid: true,
        clientId: 5,
        scopes: ['read'],
        ipAllowlist: ['127.0.0.1'],
      },
    });

    const request = mockRequest({ 'x-api-key': 'cvh_live_testkey' });
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    // Verify request IP was sent to auth-service for validation
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3003/auth/api-keys/validate',
      { apiKey: 'cvh_live_testkey', ip: '127.0.0.1' },
      { timeout: 5000 },
    );
  });

  it('should reject request from non-allowed IP (auth-service returns invalid)', async () => {
    // When the IP is not in the allowlist, auth-service returns valid: false
    mockedAxios.post.mockResolvedValueOnce({
      data: { valid: false },
    });

    const request = mockRequest({ 'x-api-key': 'cvh_live_restrictedkey' });
    request.ip = '192.168.99.99';
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // ─── Network errors ────────────────────────────────────

  it('should handle auth-service network error gracefully (fail-closed)', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Connection refused'));

    const request = mockRequest({ 'x-api-key': 'cvh_live_validkey123' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // ─── JWT Bearer authentication ─────────────────────────

  it('should authenticate with valid JWT Bearer token', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        user: {
          id: 10,
          email: 'portal@test.com',
          role: 'viewer',
          clientId: 3,
          clientRole: 'viewer',
        },
      },
    });

    const request = mockRequest({
      authorization: 'Bearer valid-jwt-token',
    });
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request).toHaveProperty('clientId', 3);
    expect((request as any).scopes).toEqual(['read']); // viewer => ['read']
    expect((request as any).allowedChains).toBeNull();
  });

  it('should return 401 for invalid JWT token', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Unauthorized'));

    const request = mockRequest({
      authorization: 'Bearer invalid-token',
    });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
