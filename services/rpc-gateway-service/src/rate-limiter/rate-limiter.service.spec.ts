import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(() => {
    service = new RateLimiterService();
  });

  it('should allow requests under the limit', () => {
    service.setConfig('node-1', { perSecond: 5, perMinute: 100 });

    // Record 3 requests (below limit of 5 per second)
    service.recordUsage('node-1');
    service.recordUsage('node-1');
    service.recordUsage('node-1');

    expect(service.isAllowed('node-1')).toBe(true);
  });

  it('should block requests over per-second limit', () => {
    service.setConfig('node-1', { perSecond: 3, perMinute: 100 });

    service.recordUsage('node-1');
    service.recordUsage('node-1');
    service.recordUsage('node-1');

    // 3 requests used, at per-second limit of 3
    expect(service.isAllowed('node-1')).toBe(false);
  });

  it('should block requests over per-minute limit', () => {
    service.setConfig('node-1', { perSecond: 1000, perMinute: 5 });

    // Record 5 requests (at per-minute limit)
    for (let i = 0; i < 5; i++) {
      service.recordUsage('node-1');
    }

    expect(service.isAllowed('node-1')).toBe(false);
  });

  it('should record usage correctly', () => {
    service.setConfig('node-1', { perSecond: 100, perMinute: 1000 });

    service.recordUsage('node-1');
    service.recordUsage('node-1');
    service.recordUsage('node-1');

    const usage = service.getUsage('node-1');
    expect(usage.secondCount).toBe(3);
    expect(usage.minuteCount).toBe(3);
  });

  it('should use default limits when no config is set', () => {
    // Default: 25 per second, 1000 per minute
    for (let i = 0; i < 24; i++) {
      service.recordUsage('node-default');
    }

    expect(service.isAllowed('node-default')).toBe(true);

    service.recordUsage('node-default');
    // Now at 25 — should be blocked
    expect(service.isAllowed('node-default')).toBe(false);
  });

  it('should track independent limits for different nodes', () => {
    service.setConfig('node-1', { perSecond: 2, perMinute: 100 });
    service.setConfig('node-2', { perSecond: 2, perMinute: 100 });

    service.recordUsage('node-1');
    service.recordUsage('node-1');

    // node-1 is at limit
    expect(service.isAllowed('node-1')).toBe(false);
    // node-2 is still available
    expect(service.isAllowed('node-2')).toBe(true);
  });

  it('should initialize empty usage for new nodes', () => {
    const usage = service.getUsage('brand-new-node');
    expect(usage.secondCount).toBe(0);
    expect(usage.minuteCount).toBe(0);
  });
});
