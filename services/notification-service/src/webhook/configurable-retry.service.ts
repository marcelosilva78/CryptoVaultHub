import { Injectable, Logger } from '@nestjs/common';

interface RetryConfig {
  retryMaxAttempts: number;
  retryBackoffType: 'exponential' | 'linear' | 'fixed';
  retryBackoffBaseMs: number;
  retryBackoffMaxMs: number;
  retryJitter: boolean;
  retryTimeoutMs: number;
  retryOnStatusCodes: string[];
  failOnStatusCodes: string[];
}

/**
 * Computes retry delays per webhook configuration.
 * Supports exponential, linear, and fixed backoff with optional jitter.
 */
@Injectable()
export class ConfigurableRetryService {
  private readonly logger = new Logger(ConfigurableRetryService.name);

  /**
   * Compute the delay for the next retry attempt.
   */
  computeDelay(config: RetryConfig, attemptNumber: number): number {
    let delay: number;

    switch (config.retryBackoffType) {
      case 'exponential':
        // 2^attempt * base, e.g., 1s, 2s, 4s, 8s, 16s...
        delay =
          Math.pow(2, attemptNumber - 1) * config.retryBackoffBaseMs;
        break;

      case 'linear':
        // attempt * base, e.g., 1s, 2s, 3s, 4s, 5s...
        delay = attemptNumber * config.retryBackoffBaseMs;
        break;

      case 'fixed':
        // Always the same delay
        delay = config.retryBackoffBaseMs;
        break;

      default:
        delay = config.retryBackoffBaseMs;
    }

    // Cap at max delay
    delay = Math.min(delay, config.retryBackoffMaxMs);

    // Apply jitter (random 0-25% reduction)
    if (config.retryJitter) {
      const jitterFactor = 1 - Math.random() * 0.25;
      delay = Math.floor(delay * jitterFactor);
    }

    return delay;
  }

  /**
   * Determine whether a given HTTP status code should trigger a retry.
   */
  shouldRetry(
    config: RetryConfig,
    httpStatus: number | null,
    attemptNumber: number,
  ): boolean {
    // Exceeded max attempts
    if (attemptNumber >= config.retryMaxAttempts) {
      return false;
    }

    // No HTTP status (network error, timeout) — always retry
    if (httpStatus === null) {
      return true;
    }

    const statusStr = httpStatus.toString();

    // If status is in fail_on list, don't retry
    if (config.failOnStatusCodes.includes(statusStr)) {
      return false;
    }

    // If status is in retry_on list, retry
    if (config.retryOnStatusCodes.includes(statusStr)) {
      return true;
    }

    // Default: retry on 5xx, don't retry on other status codes
    return httpStatus >= 500;
  }

  /**
   * Extract retry config from a webhook entity.
   */
  extractConfig(webhook: any): RetryConfig {
    return {
      retryMaxAttempts: webhook.retryMaxAttempts ?? 5,
      retryBackoffType: webhook.retryBackoffType ?? 'exponential',
      retryBackoffBaseMs: webhook.retryBackoffBaseMs ?? 1000,
      retryBackoffMaxMs: webhook.retryBackoffMaxMs ?? 3600000,
      retryJitter: webhook.retryJitter ?? true,
      retryTimeoutMs: webhook.retryTimeoutMs ?? 10000,
      retryOnStatusCodes: this.parseStatusCodes(
        webhook.retryOnStatusCodes,
      ),
      failOnStatusCodes: this.parseStatusCodes(
        webhook.failOnStatusCodes,
      ),
    };
  }

  private parseStatusCodes(codes: any): string[] {
    if (Array.isArray(codes)) return codes.map(String);
    if (typeof codes === 'string') {
      try {
        return JSON.parse(codes);
      } catch {
        return [];
      }
    }
    return [];
  }
}
