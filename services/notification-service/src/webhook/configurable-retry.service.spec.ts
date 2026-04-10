import { ConfigurableRetryService } from './configurable-retry.service';

describe('ConfigurableRetryService', () => {
  describe('exponential backoff', () => {
    let service: ConfigurableRetryService;

    beforeEach(() => {
      service = new ConfigurableRetryService({
        strategy: 'exponential',
        baseDelayMs: 1000,
        maxDelayMs: 60_000,
        jitterEnabled: false,
        jitterMaxMs: 0,
        retryableStatusCodes: [500, 502, 503, 429],
        failStatusCodes: [400, 401, 403, 404],
      });
    });

    it('should calculate exponential backoff delay correctly', () => {
      expect(service.calculateDelay(0)).toBe(1000); // 1000 * 2^0 = 1000
      expect(service.calculateDelay(1)).toBe(2000); // 1000 * 2^1 = 2000
      expect(service.calculateDelay(2)).toBe(4000); // 1000 * 2^2 = 4000
      expect(service.calculateDelay(3)).toBe(8000); // 1000 * 2^3 = 8000
      expect(service.calculateDelay(4)).toBe(16000); // 1000 * 2^4 = 16000
    });

    it('should respect max delay', () => {
      // 1000 * 2^10 = 1024000, but max is 60000
      const delay = service.calculateDelay(10);
      expect(delay).toBe(60_000);
    });
  });

  describe('linear backoff', () => {
    let service: ConfigurableRetryService;

    beforeEach(() => {
      service = new ConfigurableRetryService({
        strategy: 'linear',
        baseDelayMs: 2000,
        maxDelayMs: 30_000,
        jitterEnabled: false,
        jitterMaxMs: 0,
        retryableStatusCodes: [500],
        failStatusCodes: [400],
      });
    });

    it('should calculate linear backoff delay correctly', () => {
      expect(service.calculateDelay(0)).toBe(2000); // 2000 * 1
      expect(service.calculateDelay(1)).toBe(4000); // 2000 * 2
      expect(service.calculateDelay(2)).toBe(6000); // 2000 * 3
      expect(service.calculateDelay(3)).toBe(8000); // 2000 * 4
    });

    it('should respect max delay for linear strategy', () => {
      // 2000 * 20 = 40000, capped at 30000
      expect(service.calculateDelay(19)).toBe(30_000);
    });
  });

  describe('fixed backoff', () => {
    it('should always return the same delay for fixed strategy', () => {
      const service = new ConfigurableRetryService({
        strategy: 'fixed',
        baseDelayMs: 5000,
        maxDelayMs: 60_000,
        jitterEnabled: false,
        jitterMaxMs: 0,
        retryableStatusCodes: [500],
        failStatusCodes: [400],
      });

      expect(service.calculateDelay(0)).toBe(5000);
      expect(service.calculateDelay(1)).toBe(5000);
      expect(service.calculateDelay(5)).toBe(5000);
      expect(service.calculateDelay(100)).toBe(5000);
    });
  });

  describe('jitter', () => {
    it('should add randomness within bounds when jitter is enabled', () => {
      const service = new ConfigurableRetryService({
        strategy: 'fixed',
        baseDelayMs: 1000,
        maxDelayMs: 60_000,
        jitterEnabled: true,
        jitterMaxMs: 500,
        retryableStatusCodes: [500],
        failStatusCodes: [400],
      });

      // Run multiple times to verify jitter adds variance
      const delays = new Set<number>();
      for (let i = 0; i < 50; i++) {
        delays.add(service.calculateDelay(0));
      }

      // With jitter, all delays should be >= baseDelay and < baseDelay + jitterMax
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThan(1500);
      }

      // With 50 samples and continuous random values, we should see some variance
      expect(delays.size).toBeGreaterThan(1);
    });

    it('should not add jitter when disabled', () => {
      const service = new ConfigurableRetryService({
        strategy: 'fixed',
        baseDelayMs: 1000,
        maxDelayMs: 60_000,
        jitterEnabled: false,
        jitterMaxMs: 500,
        retryableStatusCodes: [500],
        failStatusCodes: [400],
      });

      const delay1 = service.calculateDelay(0);
      const delay2 = service.calculateDelay(0);

      expect(delay1).toBe(1000);
      expect(delay2).toBe(1000);
    });
  });

  describe('shouldRetry', () => {
    let service: ConfigurableRetryService;

    beforeEach(() => {
      service = new ConfigurableRetryService({
        strategy: 'exponential',
        baseDelayMs: 1000,
        maxDelayMs: 60_000,
        jitterEnabled: false,
        jitterMaxMs: 0,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        failStatusCodes: [400, 401, 403, 404],
      });
    });

    it('should return true for retryable status codes', () => {
      expect(service.shouldRetry(500)).toBe(true);
      expect(service.shouldRetry(502)).toBe(true);
      expect(service.shouldRetry(503)).toBe(true);
      expect(service.shouldRetry(504)).toBe(true);
      expect(service.shouldRetry(429)).toBe(true);
      expect(service.shouldRetry(408)).toBe(true);
    });

    it('should return false for fail status codes', () => {
      expect(service.shouldRetry(400)).toBe(false);
      expect(service.shouldRetry(401)).toBe(false);
      expect(service.shouldRetry(403)).toBe(false);
      expect(service.shouldRetry(404)).toBe(false);
    });

    it('should return false for unknown status codes', () => {
      expect(service.shouldRetry(200)).toBe(false);
      expect(service.shouldRetry(301)).toBe(false);
      expect(service.shouldRetry(418)).toBe(false);
    });

    it('should prioritize fail codes over retryable codes if overlapping', () => {
      const overlappingService = new ConfigurableRetryService({
        strategy: 'fixed',
        baseDelayMs: 1000,
        maxDelayMs: 60_000,
        jitterEnabled: false,
        jitterMaxMs: 0,
        retryableStatusCodes: [500, 400],
        failStatusCodes: [400],
      });

      // 400 is in both lists, but fail takes precedence
      expect(overlappingService.shouldRetry(400)).toBe(false);
    });
  });
});
