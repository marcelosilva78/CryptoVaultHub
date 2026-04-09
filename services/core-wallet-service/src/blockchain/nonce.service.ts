import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EvmProviderService } from './evm-provider.service';

/**
 * Redis-based nonce management with mutex per chain+address.
 * Prevents nonce collisions when multiple transactions are submitted concurrently.
 */
@Injectable()
export class NonceService {
  private readonly logger = new Logger(NonceService.name);
  private redis: Redis;

  /** Lock TTL in milliseconds */
  private readonly LOCK_TTL_MS = 10_000;
  /** Max wait time to acquire lock */
  private readonly LOCK_WAIT_MS = 15_000;
  /** Poll interval when waiting for lock */
  private readonly LOCK_POLL_MS = 100;

  constructor(
    private readonly config: ConfigService,
    private readonly evmProvider: EvmProviderService,
  ) {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /**
   * Acquire a nonce for the given address on the given chain.
   * Uses Redis SETNX for mutex, then either reads the cached nonce
   * or fetches from chain and increments.
   *
   * Returns { nonce, release } where release() MUST be called after tx submission.
   */
  async acquireNonce(
    chainId: number,
    address: string,
  ): Promise<{ nonce: number; release: () => Promise<void> }> {
    const lockKey = `nonce_lock:${chainId}:${address}`;
    const nonceKey = `nonce:${chainId}:${address}`;

    // Wait to acquire the lock
    const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const acquired = await this.waitForLock(lockKey, lockValue);

    if (!acquired) {
      throw new Error(
        `Failed to acquire nonce lock for ${address} on chain ${chainId} after ${this.LOCK_WAIT_MS}ms`,
      );
    }

    try {
      // Check if we have a cached nonce
      const cachedNonce = await this.redis.get(nonceKey);

      let nonce: number;

      if (cachedNonce !== null) {
        nonce = parseInt(cachedNonce, 10);
      } else {
        // Fetch from chain
        const provider = await this.evmProvider.getProvider(chainId);
        nonce = await provider.getTransactionCount(address, 'pending');
      }

      // Store the incremented nonce for the next caller
      await this.redis.set(nonceKey, (nonce + 1).toString(), 'EX', 3600);

      const release = async () => {
        await this.releaseLock(lockKey, lockValue);
      };

      return { nonce, release };
    } catch (error) {
      // Release lock on error
      await this.releaseLock(lockKey, lockValue);
      throw error;
    }
  }

  /**
   * Reset the cached nonce for an address (e.g., after a tx failure).
   * Forces the next acquireNonce call to fetch from chain.
   */
  async resetNonce(chainId: number, address: string): Promise<void> {
    const nonceKey = `nonce:${chainId}:${address}`;
    await this.redis.del(nonceKey);
    this.logger.log(
      `Nonce cache reset for ${address} on chain ${chainId}`,
    );
  }

  /**
   * Sync the cached nonce with the on-chain value.
   */
  async syncNonce(chainId: number, address: string): Promise<number> {
    const nonceKey = `nonce:${chainId}:${address}`;
    const provider = await this.evmProvider.getProvider(chainId);
    const nonce = await provider.getTransactionCount(address, 'pending');
    await this.redis.set(nonceKey, nonce.toString(), 'EX', 3600);
    this.logger.log(
      `Nonce synced for ${address} on chain ${chainId}: ${nonce}`,
    );
    return nonce;
  }

  private async waitForLock(
    lockKey: string,
    lockValue: string,
  ): Promise<boolean> {
    const deadline = Date.now() + this.LOCK_WAIT_MS;

    while (Date.now() < deadline) {
      const result = await this.redis.set(
        lockKey,
        lockValue,
        'PX',
        this.LOCK_TTL_MS,
        'NX',
      );

      if (result === 'OK') {
        return true;
      }

      // Wait before retrying
      await this.sleep(this.LOCK_POLL_MS);
    }

    return false;
  }

  private async releaseLock(
    lockKey: string,
    lockValue: string,
  ): Promise<void> {
    // Only release if we still own the lock (Lua script for atomicity)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, lockKey, lockValue);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
