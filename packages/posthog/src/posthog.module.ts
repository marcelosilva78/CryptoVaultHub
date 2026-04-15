import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHogService } from './posthog.service';

export const POSTHOG_SERVICE = 'POSTHOG_SERVICE';

/**
 * NestJS module that provides PostHogService as an injectable token.
 *
 * Usage:
 *   imports: [PostHogModule]
 *
 * Then inject via:
 *   @Inject(POSTHOG_SERVICE) private readonly posthog: PostHogService
 *
 * If POSTHOG_API_KEY or POSTHOG_HOST are not configured, the provider
 * resolves to `null` — callers must guard with `if (this.posthog)`.
 */
@Global()
@Module({
  providers: [
    {
      provide: POSTHOG_SERVICE,
      useFactory: (config: ConfigService): PostHogService | null => {
        const logger = new Logger('PostHogModule');
        const apiKey = config.get<string>('POSTHOG_API_KEY');
        const host = config.get<string>('POSTHOG_HOST');
        if (apiKey && host) {
          logger.log('PostHog tracking enabled');
          return new PostHogService(apiKey, host);
        }
        logger.warn('PostHog not configured — tracking disabled');
        return null;
      },
      inject: [ConfigService],
    },
  ],
  exports: [POSTHOG_SERVICE],
})
export class PostHogModule {}
