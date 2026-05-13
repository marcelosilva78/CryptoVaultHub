import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * USD price oracle for the cron-worker. Mirrors
 * services/core-wallet-service/src/pricing/pricing.service.ts and reads
 * the same Redis cache keys (price:usd:<coingeckoId>) so a price already
 * fetched by core-wallet (e.g. when the deposits endpoint was called) is
 * reused here for free. CoinGecko free-tier rate limits are amortised
 * across both services.
 *
 * Kept as a small duplicate rather than extracted to a shared package
 * because (a) the only call surface is one method, (b) cross-service
 * coupling to a shared internal package complicates the build matrix.
 * If a third caller appears, promote to packages/pricing.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';
  private readonly NEGATIVE_TTL = 60;

  constructor(private readonly redis: RedisService) {}

  async getPricesUsd(
    coingeckoIds: string[],
  ): Promise<Record<string, number>> {
    const ids = Array.from(new Set(coingeckoIds.filter(Boolean)));
    if (ids.length === 0) return {};

    const result: Record<string, number> = {};
    const missing: string[] = [];

    await Promise.all(
      ids.map(async (id) => {
        const cached = await this.redis.getCache(`price:usd:${id}`);
        if (cached !== null) {
          if (cached !== '__miss__') {
            const n = Number(cached);
            if (Number.isFinite(n)) result[id] = n;
          }
          return;
        }
        missing.push(id);
      }),
    );

    if (missing.length === 0) return result;

    try {
      const url = `${this.BASE_URL}?ids=${encodeURIComponent(missing.join(','))}&vs_currencies=usd`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        this.logger.warn(
          `CoinGecko returned HTTP ${res.status} for ids=${missing.join(',')}`,
        );
        await Promise.all(
          missing.map((id) =>
            this.redis.setCache(`price:usd:${id}`, '__miss__', this.NEGATIVE_TTL),
          ),
        );
        return result;
      }

      const body = (await res.json()) as Record<string, { usd?: number }>;
      await Promise.all(
        missing.map(async (id) => {
          const price = body[id]?.usd;
          if (typeof price === 'number' && Number.isFinite(price)) {
            result[id] = price;
            await this.redis.setCache(
              `price:usd:${id}`,
              String(price),
              this.CACHE_TTL,
            );
          } else {
            await this.redis.setCache(
              `price:usd:${id}`,
              '__miss__',
              this.NEGATIVE_TTL,
            );
          }
        }),
      );
    } catch (err) {
      this.logger.warn(
        `CoinGecko fetch failed: ${(err as Error).message} — returning cached subset`,
      );
    }

    return result;
  }
}
