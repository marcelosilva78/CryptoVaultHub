import { JwtOnlyAuthGuard } from './jwt-only-auth.guard';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtOnlyAuthGuard', () => {
  function makeContext(headers: Record<string, string>) {
    const req: any = { headers, ip: '1.2.3.4' };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  function makeGuard() {
    return new JwtOnlyAuthGuard(
      { get: () => 'http://auth' } as unknown as ConfigService,
    );
  }

  it('rejects requests presenting an X-API-Key header', async () => {
    const guard = makeGuard();
    await expect(
      guard.canActivate(makeContext({ 'x-api-key': 'cvh_live_xxx' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests with no Authorization header', async () => {
    const guard = makeGuard();
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
