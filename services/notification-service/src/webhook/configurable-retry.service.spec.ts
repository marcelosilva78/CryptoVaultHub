import { ConfigurableRetryService } from './configurable-retry.service';

describe('ConfigurableRetryService', () => {
  let service: ConfigurableRetryService;

  beforeEach(() => {
    service = new ConfigurableRetryService();
  });

  describe('exponential backoff', () => {
    it('should calculate exponential backoff delay correctly', () => {
      const config = service.extractConfig({
        retryBackoffType: 'exponential',
        retryBackoffBaseMs: 1000,
        retryBackoffMaxMs: 60_000,
        retryJitter: false,
      });

      expect(service.computeDelay(config, 1)).toBe(1000); // 2^0 * 1000 = 1000
      expect(service.computeDelay(config, 2)).toBe(2000); // 2^1 * 1000 = 2000
      expect(service.computeDelay(config, 3)).toBe(4000); // 2^2 * 1000 = 4000
      expect(service.computeDelay(config, 4)).toBe(8000); // 2^3 * 1000 = 8000
      expect(service.computeDelay(config, 5)).toBe(16000); // 2^4 * 1000 = 16000
    });

    it('should respect max delay', () => {
      const config = service.extractConfig({
        retryBackoffType: 'exponential',
        retryBackoffBaseMs: 1000,
        retryBackoffMaxMs: 60_000,
        retryJitter: false,
      });

      // 2^10 * 1000 = 1024000, but max is 60000
      const delay = service.computeDelay(config, 11);
      expect(delay).toBe(60_000);
    });
  });

  describe('linear backoff', () => {
    it('should calculate linear backoff delay correctly', () => {
      const config = service.extractConfig({
        retryBackoffType: 'linear',
        retryBackoffBaseMs: 2000,
        retryBackoffMaxMs: 30_000,
        retryJitter: false,
      });

      expect(service.computeDelay(config, 1)).toBe(2000); // 2000 * 1
      expect(service.computeDelay(config, 2)).toBe(4000); // 2000 * 2
      expect(service.computeDelay(config, 3)).toBe(6000); // 2000 * 3
      expect(service.computeDelay(config, 4)).toBe(8000); // 2000 * 4
    });

    it('should respect max delay for linear strategy', () => {
      const config = service.extractConfig({
        retryBackoffType: 'linear',
        retryBackoffBaseMs: 2000,
        retryBackoffMaxMs: 30_000,
        retryJitter: false,
      });

      // 2000 * 20 = 40000, capped at 30000
      expect(service.computeDelay(config, 20)).toBe(30_000);
    });
  });

  describe('fixed backoff', () => {
    it('should always return the same delay for fixed strategy', () => {
      const config = service.extractConfig({
        retryBackoffType: 'fixed',
        retryBackoffBaseMs: 5000,
        retryBackoffMaxMs: 60_000,
        retryJitter: false,
      });

      expect(service.computeDelay(config, 1)).toBe(5000);
      expect(service.computeDelay(config, 2)).toBe(5000);
      expect(service.computeDelay(config, 5)).toBe(5000);
      expect(service.computeDelay(config, 100)).toBe(5000);
    });
  });

  describe('jitter', () => {
    it('should add randomness within bounds when jitter is enabled', () => {
      const config = service.extractConfig({
        retryBackoffType: 'fixed',
        retryBackoffBaseMs: 1000,
        retryBackoffMaxMs: 60_000,
        retryJitter: true,
      });

      // Run multiple times to verify jitter adds variance
      const delays = new Set<number>();
      for (let i = 0; i < 50; i++) {
        delays.add(service.computeDelay(config, 1));
      }

      // With jitter (random 0-25% reduction), delays should be between 750 and 1000
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(750);
        expect(delay).toBeLessThanOrEqual(1000);
      }

      // With 50 samples and continuous random values, we should see some variance
      expect(delays.size).toBeGreaterThan(1);
    });

    it('should not add jitter when disabled', () => {
      const config = service.extractConfig({
        retryBackoffType: 'fixed',
        retryBackoffBaseMs: 1000,
        retryBackoffMaxMs: 60_000,
        retryJitter: false,
      });

      const delay1 = service.computeDelay(config, 1);
      const delay2 = service.computeDelay(config, 1);

      expect(delay1).toBe(1000);
      expect(delay2).toBe(1000);
    });
  });

  describe('shouldRetry', () => {
    it('should return true for 5xx status codes by default', () => {
      const config = service.extractConfig({
        retryMaxAttempts: 10,
        retryJitter: false,
      });

      expect(service.shouldRetry(config, 500, 1)).toBe(true);
      expect(service.shouldRetry(config, 502, 1)).toBe(true);
      expect(service.shouldRetry(config, 503, 1)).toBe(true);
      expect(service.shouldRetry(config, 504, 1)).toBe(true);
    });

    it('should return true for retryable status codes', () => {
      const config = service.extractConfig({
        retryMaxAttempts: 10,
        retryOnStatusCodes: ['408', '429'],
        retryJitter: false,
      });

      expect(service.shouldRetry(config, 429, 1)).toBe(true);
      expect(service.shouldRetry(config, 408, 1)).toBe(true);
    });

    it('should return false for fail status codes', () => {
      const config = service.extractConfig({
        retryMaxAttempts: 10,
        failOnStatusCodes: ['400', '401', '403', '404'],
        retryJitter: false,
      });

      expect(service.shouldRetry(config, 400, 1)).toBe(false);
      expect(service.shouldRetry(config, 401, 1)).toBe(false);
      expect(service.shouldRetry(config, 403, 1)).toBe(false);
      expect(service.shouldRetry(config, 404, 1)).toBe(false);
    });

    it('should return false for non-5xx unknown status codes', () => {
      const config = service.extractConfig({
        retryMaxAttempts: 10,
        retryJitter: false,
      });

      expect(service.shouldRetry(config, 200, 1)).toBe(false);
      expect(service.shouldRetry(config, 301, 1)).toBe(false);
      expect(service.shouldRetry(config, 418, 1)).toBe(false);
    });

    it('should prioritize fail codes over retryable codes if overlapping', () => {
      const config = service.extractConfig({
        retryMaxAttempts: 10,
        retryOnStatusCodes: ['500', '400'],
        failOnStatusCodes: ['400'],
        retryJitter: false,
      });

      // 400 is in both lists, but fail takes precedence
      expect(service.shouldRetry(config, 400, 1)).toBe(false);
    });

    it('should return false when max attempts exceeded', () => {
      const config = service.extractConfig({
        retryMaxAttempts: 5,
        retryJitter: false,
      });

      expect(service.shouldRetry(config, 500, 5)).toBe(false);
      expect(service.shouldRetry(config, 500, 6)).toBe(false);
    });

    it('should always retry on null status (network error)', () => {
      const config = service.extractConfig({
        retryMaxAttempts: 5,
        retryJitter: false,
      });

      expect(service.shouldRetry(config, null, 1)).toBe(true);
      expect(service.shouldRetry(config, null, 2)).toBe(true);
    });
  });

  describe('extractConfig', () => {
    it('should extract config with defaults', () => {
      const config = service.extractConfig({});

      expect(config.retryMaxAttempts).toBe(5);
      expect(config.retryBackoffType).toBe('exponential');
      expect(config.retryBackoffBaseMs).toBe(1000);
      expect(config.retryBackoffMaxMs).toBe(3600000);
      expect(config.retryJitter).toBe(true);
      expect(config.retryTimeoutMs).toBe(10000);
      expect(config.retryOnStatusCodes).toEqual([]);
      expect(config.failOnStatusCodes).toEqual([]);
    });

    it('should parse JSON string status codes', () => {
      const config = service.extractConfig({
        retryOnStatusCodes: '["429","503"]',
        failOnStatusCodes: '["400"]',
      });

      expect(config.retryOnStatusCodes).toEqual(['429', '503']);
      expect(config.failOnStatusCodes).toEqual(['400']);
    });

    it('should handle array status codes', () => {
      const config = service.extractConfig({
        retryOnStatusCodes: [429, 503],
        failOnStatusCodes: [400],
      });

      expect(config.retryOnStatusCodes).toEqual(['429', '503']);
      expect(config.failOnStatusCodes).toEqual(['400']);
    });
  });
});
