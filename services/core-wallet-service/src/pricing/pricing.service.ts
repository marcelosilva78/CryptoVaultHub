import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Lightweight USD price oracle backed by the free CoinGecko `/simple/price`
 * endpoint. Prices are keyed by `coingeckoId` (set on `tokens.coingecko_id`),
 * cached in Redis for 5 minutes per id to stay well under the free tier's
 * ~30 req/min limit even with many concurrent dashboards.
 *
 * Tokens that have no `coingeckoId` (or that CoinGecko doesn't know) get
 * `null` — every caller treats null as "USD unavailable" and renders a
 * dash, never a misleading `$0.00`.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';
  /** Negative cache: when CoinGecko returns nothing for an id, remember it
   *  briefly so we don't hammer the API on every dashboard refresh. */
  private readonly NEGATIVE_TTL = 60;

  constructor(private readonly redis: RedisService) {}

  /**
   * Batched lookup. Returns a map of `coingeckoId → priceUsd`. Missing ids
   * are simply absent from the result; callers should default to null.
   *
   * Resilient to upstream failures: if the fetch throws or times out we log
   * once and return whatever we already had in cache, never blocking the
   * UI on a 3rd-party outage.
   */
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

      const body = (await res.json()) as Record<
        string,
        { usd?: number }
      >;
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
