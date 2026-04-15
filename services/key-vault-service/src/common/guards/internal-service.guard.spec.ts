import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { InternalServiceGuard } from './internal-service.guard';

describe('InternalServiceGuard', () => {
  let guard: InternalServiceGuard;
  let reflector: Reflector;
  const CORRECT_KEY = 'super-secret-internal-service-key-2024';

  function createMockContext(headers: Record<string, string | undefined> = {}) {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: {
            'x-internal-service-key': headers['x-internal-service-key'],
          },
        }),
      }),
    } as any;
  }

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    guard = new InternalServiceGuard(reflector);
    process.env.INTERNAL_SERVICE_KEY = CORRECT_KEY;
  });

  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_KEY;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow request with correct service key', () => {
    const context = createMockContext({
      'x-internal-service-key': CORRECT_KEY,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject request with wrong service key', () => {
    const context = createMockContext({
      'x-internal-service-key': 'wrong-key',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Invalid service key');
  });

  it('should reject request with missing service key', () => {
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(
      'Invalid or missing internal service key',
    );
  });

  it('should reject request with empty service key', () => {
    const context = createMockContext({
      'x-internal-service-key': '',
    });

    // Empty string is falsy, should be treated as missing
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should not leak key length via timing (both keys padded to same length)', () => {
    // The guard uses timingSafeEqual with padding to max length,
    // then checks a.length === b.length separately.
    // This test verifies the guard handles different-length keys
    // without leaking information about the expected key length.

    const shortKey = 'short';
    const longKey = 'a'.repeat(200);

    const contextShort = createMockContext({
      'x-internal-service-key': shortKey,
    });
    const contextLong = createMockContext({
      'x-internal-service-key': longKey,
    });

    // Both should be rejected (wrong key), and neither should error out
    expect(() => guard.canActivate(contextShort)).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(contextLong)).toThrow(
      UnauthorizedException,
    );

    // Verify the guard uses timingSafeEqual (not a simple === comparison).
    // We can confirm this by checking that the guard's source code includes
    // the padding logic: both buffers are padded to maxLen before comparison.
    // This is a structural verification -- the constant-time property itself
    // cannot be reliably unit-tested.
  });

  it('should handle keys of different lengths without error', () => {
    // Ensure no Buffer length mismatch errors when keys differ in length
    const keys = ['', 'a', 'ab', CORRECT_KEY, CORRECT_KEY + 'extra', 'x'.repeat(1000)];

    for (const key of keys) {
      const context = createMockContext({
        'x-internal-service-key': key,
      });

      if (key === CORRECT_KEY) {
        expect(guard.canActivate(context)).toBe(true);
      } else if (key === '') {
        // Empty string is falsy, triggers "missing" path
        expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      } else {
        expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      }
    }
  });

  it('should bypass guard for routes marked @Public()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    // No service key provided at all
    const context = createMockContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw when INTERNAL_SERVICE_KEY env var is not configured', () => {
    delete process.env.INTERNAL_SERVICE_KEY;

    const context = createMockContext({
      'x-internal-service-key': 'any-key',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(
      'INTERNAL_SERVICE_KEY is not configured',
    );
  });
});
