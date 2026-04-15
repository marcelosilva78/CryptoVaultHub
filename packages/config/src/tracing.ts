import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

/**
 * Initialise OpenTelemetry tracing for a CryptoVaultHub micro-service.
 *
 * MUST be called at the very top of `main.ts` — **before** any NestJS
 * imports — so that the auto-instrumentations can monkey-patch HTTP,
 * Express and mysql2 modules before they are loaded.
 *
 * Tracing only activates when `TRACING_ENABLED=true`.
 */
export function initTracing(serviceName: string): void {
  if (process.env.TRACING_ENABLED !== 'true') {
    return;
  }

  const endpoint =
    process.env.JAEGER_ENDPOINT || 'http://jaeger:4318/v1/traces';

  const exporter = new OTLPTraceExporter({ url: endpoint });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-mysql2': { enabled: true },
        // Disable noisy / irrelevant instrumentations
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown
  const shutdown = async () => {
    try {
      await sdk?.shutdown();
    } catch {
      // ignore errors during shutdown
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
