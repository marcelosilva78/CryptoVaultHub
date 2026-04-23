import { context, trace, propagation } from '@opentelemetry/api';

/**
 * Inject the current OpenTelemetry trace context into BullMQ job data.
 *
 * Call this when enqueueing a job so the worker can continue the trace:
 *
 * ```ts
 * await queue.add('withdrawal', injectTraceContext({ txId, amount }));
 * ```
 */
export function injectTraceContext(
  jobData: Record<string, any>,
): Record<string, any> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return { ...jobData, _traceContext: carrier };
}

/**
 * Extract the trace context that was injected into a BullMQ job's data.
 *
 * Returns the reconstructed parent context, or the current active context
 * if no trace context was present (backward-compatible with jobs enqueued
 * before trace propagation was added).
 */
export function extractTraceContext(
  jobData: Record<string, any>,
): ReturnType<typeof context.active> {
  if (!jobData?._traceContext) return context.active();
  return propagation.extract(context.active(), jobData._traceContext);
}

/**
 * Create a new span linked to the trace context from a BullMQ job.
 *
 * Usage inside a worker processor:
 *
 * ```ts
 * const span = createWorkerSpan(job.name, job.data);
 * try {
 *   // ... process job
 *   span.setStatus({ code: SpanStatusCode.OK });
 * } catch (err) {
 *   span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
 *   throw err;
 * } finally {
 *   span.end();
 * }
 * ```
 */
export function createWorkerSpan(
  jobName: string,
  jobData: Record<string, any>,
) {
  const tracer = trace.getTracer('bullmq-worker');
  const parentContext = extractTraceContext(jobData);
  return tracer.startSpan(`bullmq.process.${jobName}`, {}, parentContext);
}
