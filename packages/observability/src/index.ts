import { trace, SpanStatusCode } from '@opentelemetry/api';

export { SpanStatusCode, type Span } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;

export function isTracingEnabled(): boolean {
  return process.env.OTEL_ENABLED === 'true';
}

/** Start OpenTelemetry SDK (console exporter in dev). No-op when OTEL_ENABLED is not true. */
export function initTracing(serviceName: string): void {
  if (!isTracingEnabled() || sdk) return;

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new ConsoleSpanExporter(),
  });

  sdk.start();

  const shutdown = () => sdk?.shutdown().catch(console.error);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

export async function shutdownTracing(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}

export function getTracer(instrumentation: string) {
  return trace.getTracer(instrumentation);
}

export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  attrs: Record<string, string | number | boolean | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isTracingEnabled()) {
    return fn();
  }

  const tracer = trace.getTracer(tracerName);
  return tracer.startActiveSpan(spanName, async (span) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined) span.setAttribute(key, value);
    }
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
