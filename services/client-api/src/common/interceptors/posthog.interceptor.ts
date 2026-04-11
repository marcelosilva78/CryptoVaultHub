import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PostHogService } from '@cvh/posthog';

@Injectable()
export class PostHogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PostHogInterceptor.name);
  private posthog: PostHogService | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('POSTHOG_API_KEY');
    const host = this.configService.get<string>('POSTHOG_HOST');
    if (apiKey && host) {
      this.posthog = new PostHogService(apiKey, host);
    } else {
      this.logger.warn('PostHog not configured - tracking disabled');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): any {
    if (!this.posthog) return next.handle();

    const start = Date.now();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Use response.on('finish') instead of pipe/tap to avoid the rxjs
    // dual-version conflict that occurs in npm workspaces where transitive
    // NestJS deps install a local rxjs copy alongside the root one.
    response.on('finish', () => {
      try {
        this.posthog!.trackApiRequest({
          clientId: request.clientId?.toString() || 'anonymous',
          method: request.method,
          path: request.url,
          statusCode: response.statusCode,
          responseTimeMs: Date.now() - start,
          traceId: request.headers['x-trace-id'] || uuidv4(),
        });
      } catch {
        // Tracking failure must never affect the response
      }
    });

    return next.handle();
  }
}
