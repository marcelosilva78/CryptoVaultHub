import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const LOCK_PREFIX = 'flush:lock:';
const LOCK_TTL_SECONDS = 300; // 5 minutes max lock

/**
 * FlushGuardService: Redis-based lock per address to prevent
 * concurrent flushes on the same deposit address.
 */
@Injectable()
export class FlushGuardService {
  private readonly logger = new Logger(FlushGuardService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Try to acquire a lock for a given address.
   * Returns true if lock acquired, false if already locked.
   */
  async acquireLock(address: string, operationUid: string): Promise<boolean> {
    const client = this.redis.getClient();
    const key = `${LOCK_PREFIX}${address.toLowerCase()}`;

    // SET NX with TTL for atomic lock
    const result = await client.set(
      key,
      operationUid,
      'EX',
      LOCK_TTL_SECONDS,
      'NX',
    );

    if (result === 'OK') {
      this.logger.debug(`Lock acquired for ${address} by ${operationUid}`);
      return true;
    }

    this.logger.debug(
      `Lock denied for ${address} — already held by another operation`,
    );
    return false;
  }

  /**
   * Release the lock for a given address, but only if we hold it.
   */
  async releaseLock(address: string, operationUid: string): Promise<void> {
    const client = this.redis.getClient();
    const key = `${LOCK_PREFIX}${address.toLowerCase()}`;

    // Only delete if the value matches our operationUid (Lua for atomicity)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await client.eval(script, 1, key, operationUid);
    this.logger.debug(`Lock released for ${address} by ${operationUid}`);
  }

  /**
   * Check if an address is currently locked.
   */
  async isLocked(address: string): Promise<boolean> {
    const client = this.redis.getClient();
    const key = `${LOCK_PREFIX}${address.toLowerCase()}`;
    const value = await client.get(key);
    return value !== null;
  }
}
