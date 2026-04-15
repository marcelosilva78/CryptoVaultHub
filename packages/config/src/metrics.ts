import {
  Module,
  Controller,
  Get,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import * as promClient from 'prom-client';

/* ──────────────────────────────────────────────────────────────
 * Default Prometheus metrics (CPU, memory, event-loop lag, GC)
 * ────────────────────────────────────────────────────────────── */
promClient.collectDefaultMetrics();

/* ──────────────────────────────────────────────────────────────
 * Custom application-level metrics
 * ────────────────────────────────────────────────────────────── */
export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
});

export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/* ──────────────────────────────────────────────────────────────
 * GET /metrics controller
 * ────────────────────────────────────────────────────────────── */
@Controller()
class MetricsController {
  @Get('metrics')
  @SetMetadata('isPublic', true)
  getMetrics(): Promise<string> {
    return promClient.register.metrics();
  }
}

/* ──────────────────────────────────────────────────────────────
 * Interceptor: tracks request count & duration automatically
 * ────────────────────────────────────────────────────────────── */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const route: string = req.route?.path ?? req.url ?? 'unknown';
    const end = httpRequestDuration.startTimer({ method, route });

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const status = String(res.statusCode);
          end({ status });
          httpRequestsTotal.inc({ method, route, status });
        },
        error: () => {
          const res = context.switchToHttp().getResponse();
          const status = String(res.statusCode || 500);
          end({ status });
          httpRequestsTotal.inc({ method, route, status });
        },
      }),
    );
  }
}

/* ──────────────────────────────────────────────────────────────
 * NestJS Module — import this in each service's AppModule
 * ────────────────────────────────────────────────────────────── */
@Module({
  controllers: [MetricsController],
  providers: [MetricsInterceptor],
  exports: [MetricsInterceptor],
})
export class MetricsModule {}
