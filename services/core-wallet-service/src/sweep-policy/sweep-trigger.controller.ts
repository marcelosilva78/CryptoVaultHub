import { Controller, Post, Param, ParseIntPipe } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Manual "sweep now" trigger. Sets a short-lived Redis flag that the
 * cron-worker's sweep cycle reads on its next tick (within ~30s) and uses
 * to bypass the policy gate for the (chainId, clientId) pair.
 *
 * The actual sweep happens asynchronously in cron-worker; this endpoint
 * returns 202 Accepted immediately after queueing the flag.
 */
@Controller('sweep')
export class SweepTriggerController {
  constructor(private readonly redis: RedisService) {}

  @Post('trigger/:clientId/:chainId')
  async trigger(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    const key = `sweep:bypass:${chainId}:${clientId}`;
    // TTL is intentionally short — if the cron worker doesn't pick it up
    // within 5 minutes the flag self-expires, preventing a stale flag from
    // forcing a sweep hours later if the worker was offline.
    await this.redis.getClient().set(key, String(Date.now()), 'EX', 300);
    return {
      success: true,
      message: 'Sweep queued — next sweep cycle (≤ 30s) will bypass policy gates and process all confirmed deposits',
      key,
    };
  }
}
