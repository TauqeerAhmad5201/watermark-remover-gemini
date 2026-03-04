import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

// Use a global singleton to survive Next.js module re-evaluation & HMR
const globalForMetrics = global as typeof globalThis & {
  promRegistry?: Registry;
  httpRequestsTotal?: Counter;
  httpRequestDuration?: Histogram;
};

function getRegistry(): Registry {
  if (!globalForMetrics.promRegistry) {
    const registry = new Registry();
    collectDefaultMetrics({
      register: registry,
      prefix: 'watermark_app_',
      labels: { app: 'watermark-app' },
      eventLoopMonitoringPrecision: 10, // collect event loop lag every 10ms
    });

    globalForMetrics.httpRequestsTotal = new Counter({
      name: 'watermark_app_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [registry],
    });

    globalForMetrics.httpRequestDuration = new Histogram({
      name: 'watermark_app_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [registry],
    });

    globalForMetrics.promRegistry = registry;
  }
  return globalForMetrics.promRegistry;
}

export const registry = getRegistry();

export const httpRequestsTotal = globalForMetrics.httpRequestsTotal!;
export const httpRequestDuration = globalForMetrics.httpRequestDuration!;
