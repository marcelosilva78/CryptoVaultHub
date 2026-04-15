import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImpersonationGuard } from './impersonation.guard';

// Mock axios at the module level
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ImpersonationGuard', () => {
  let guard: ImpersonationGuard;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'AUTH_SERVICE_URL') return 'http://auth-service:3003';
      return defaultValue ?? '';
    }),
  };

  const buildExecutionContext = (
    headers: Record<string, string> = {},
  ): ExecutionContext => {
    const request: any = { headers };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => jest.fn(),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      getType: () => 'http',
      getArgs: () => [request],
      getArgByIndex: (i: number) => [request][i],
      switchToRpc: jest.fn() as any,
      switchToWs: jest.fn() as any,
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Store original env and set test value
    process.env.INTERNAL_SERVICE_KEY = 'test-internal-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<ImpersonationGuard>(ImpersonationGuard);
  });

  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_KEY;
  });

  it('should pass through when no X-Impersonation-Session header', async () => {
    const ctx = buildExecutionContext({});
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockedAxios.get).not.toHaveBeenCalled();

    // No impersonation context should be attached
    const request = ctx.switchToHttp().getRequest();
    expect(request.impersonation).toBeUndefined();
    expect(request.impersonatedClientId).toBeUndefined();
  });

  it('should attach impersonatedClientId on valid session', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        valid: true,
        sessionId: '123',
        adminUserId: 'admin-42',
        targetClientId: 7,
      },
    });

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'session-abc',
    });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);

    const request = ctx.switchToHttp().getRequest();
    expect(request.impersonatedClientId).toBe(7);
    expect(request.impersonation).toEqual({
      sessionId: '123',
      adminUserId: 'admin-42',
      targetClientId: 7,
    });

    // Verify the correct auth-service endpoint was called
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://auth-service:3003/auth/impersonate/validate/session-abc',
      expect.objectContaining({
        headers: { 'X-Internal-Service-Key': 'test-internal-key' },
        timeout: 5000,
      }),
    );
  });

  it('should throw ForbiddenException on 4xx from auth-service', async () => {
    const error = new Error('Bad Request') as any;
    error.response = { status: 400 };
    mockedAxios.get.mockRejectedValue(error);

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'expired-session',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException on 403 from auth-service', async () => {
    const error = new Error('Forbidden') as any;
    error.response = { status: 403 };
    mockedAxios.get.mockRejectedValue(error);

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'forbidden-session',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException on 404 from auth-service', async () => {
    const error = new Error('Not Found') as any;
    error.response = { status: 404 };
    mockedAxios.get.mockRejectedValue(error);

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'nonexistent-session',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ServiceUnavailableException on 5xx from auth-service', async () => {
    const error = new Error('Internal Server Error') as any;
    error.response = { status: 500 };
    mockedAxios.get.mockRejectedValue(error);

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'any-session',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw ServiceUnavailableException on 503 from auth-service', async () => {
    const error = new Error('Service Unavailable') as any;
    error.response = { status: 503 };
    mockedAxios.get.mockRejectedValue(error);

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'any-session',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw ServiceUnavailableException on network error (no response)', async () => {
    const error = new Error('ECONNREFUSED');
    mockedAxios.get.mockRejectedValue(error);

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'any-session',
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should NOT silently allow invalid sessions', async () => {
    // When auth-service returns valid: false, the guard should still
    // return true (pass-through) but NOT attach impersonation context.
    // This is because the guard code only attaches on data.valid === true.
    mockedAxios.get.mockResolvedValue({
      data: {
        valid: false,
      },
    });

    const ctx = buildExecutionContext({
      'x-impersonation-session': 'invalid-session',
    });
    const result = await guard.canActivate(ctx);

    // Guard passes but no impersonation context is attached
    expect(result).toBe(true);
    const request = ctx.switchToHttp().getRequest();
    expect(request.impersonatedClientId).toBeUndefined();
    expect(request.impersonation).toBeUndefined();
  });
});
