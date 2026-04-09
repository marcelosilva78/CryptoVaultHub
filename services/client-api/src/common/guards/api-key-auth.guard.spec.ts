import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
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

  const mockExecutionContext = (
    request: any,
    requiredScopes?: string[],
  ): ExecutionContext => {
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

  it('should throw UnauthorizedException when X-API-Key header is missing', async () => {
    const request = mockRequest({});
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Missing X-API-Key header',
    );
  });

  it('should throw UnauthorizedException when API key is invalid', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { valid: false },
    });

    const request = mockRequest({ 'x-api-key': 'cvh_live_invalid' });
    const context = mockExecutionContext(request);

    try {
      await guard.canActivate(context);
      fail('Expected UnauthorizedException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as any).message).toBe('Invalid or expired API key');
    }
  });

  it('should return true and attach clientId for valid API key', async () => {
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

  it('should validate required scopes', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        valid: true,
        clientId: 42,
        scopes: ['read'],
      },
    });

    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(['write']);

    const request = mockRequest({ 'x-api-key': 'cvh_live_validkey123' });
    const context = mockExecutionContext(request, ['write']);

    try {
      await guard.canActivate(context);
      fail('Expected UnauthorizedException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect((err as any).message).toBe(
        'Insufficient scopes. Required: write',
      );
    }
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

  it('should handle auth service errors gracefully', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Connection refused'));

    const request = mockRequest({ 'x-api-key': 'cvh_live_validkey123' });
    const context = mockExecutionContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should send API key to auth service for validation', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        valid: true,
        clientId: 1,
        scopes: ['read'],
      },
    });

    const request = mockRequest({ 'x-api-key': 'cvh_live_testkey' });
    const context = mockExecutionContext(request);

    await guard.canActivate(context);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3003/auth/api-keys/validate',
      { apiKey: 'cvh_live_testkey', ip: '127.0.0.1' },
      { timeout: 5000 },
    );
  });
});
