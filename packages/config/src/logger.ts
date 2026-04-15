import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Structured JSON logging for CryptoVaultHub services.
 *
 * - Production (`NODE_ENV=production`): JSON format (parsed by Loki / Grafana)
 * - Development: pretty-printed human-readable output
 *
 * Automatically includes trace_id from OpenTelemetry context or the
 * `x-trace-id` request header for distributed tracing correlation.
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        customProps: (req: any) => {
          const traceId =
            req.headers?.['x-trace-id'] ??
            req.headers?.traceparent?.split('-')?.[1] ??
            undefined;
          return {
            ...(traceId ? { trace_id: traceId } : {}),
            service: process.env.SERVICE_NAME || 'unknown',
          };
        },
        serializers: {
          // Avoid logging full request/response bodies in production
          req: (req: any) => ({
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
          }),
          res: (res: any) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
  ],
})
export class StructuredLoggerModule {}
