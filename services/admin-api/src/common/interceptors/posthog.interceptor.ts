import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PostHogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PostHogInterceptor.name);
  private posthog: any = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('POSTHOG_API_KEY');
    const host = this.configService.get<string>('POSTHOG_HOST');
    if (apiKey && host) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PostHog } = require('posthog-node');
        this.posthog = new PostHog(apiKey, { host });
      } catch {
        this.logger.warn('posthog-node not available - tracking disabled');
      }
    } else {
      this.logger.warn('PostHog not configured - tracking disabled');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): any {
    if (!this.posthog) return next.handle();

    const start = Date.now();
    const request = context.switchToHttp().getRequest();
    const observable = next.handle() as any;

    return new (observable.constructor as any)((subscriber: any) => {
      observable.subscribe({
        next: (value: any) => {
          try {
            const response = context.switchToHttp().getResponse();
            this.posthog.capture({
              distinctId: request.user?.userId || 'anonymous',
              event: 'admin.api.request',
              properties: {
                adminUserId: request.user?.userId || 'anonymous',
                method: request.method,
                path: request.url,
                statusCode: response.statusCode,
                responseTimeMs: Date.now() - start,
                traceId: request.headers['x-trace-id'] || uuidv4(),
              },
            });
          } catch {
            // Tracking failure must never break the response
          }
          subscriber.next(value);
        },
        error: (err: any) => {
          try {
            this.posthog.capture({
              distinctId: request.user?.userId || 'anonymous',
              event: 'admin.api.request',
              properties: {
                adminUserId: request.user?.userId || 'anonymous',
                method: request.method,
                path: request.url,
                statusCode: err.status || 500,
                responseTimeMs: Date.now() - start,
                traceId: request.headers['x-trace-id'] || uuidv4(),
                error: err.message,
              },
            });
          } catch {
            // Tracking failure must never mask the original error
          }
          subscriber.error(err);
        },
        complete: () => subscriber.complete(),
      });
    });
  }
}
