import { NextRequest, NextResponse } from 'next/server';
import { httpRequestsTotal, httpRequestDuration } from './metrics';

type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse | Response>;

/**
 * Wraps a Next.js App Router route handler to record Prometheus HTTP metrics.
 * Tracks request count and duration labelled by method, route, and status code.
 *
 * @example
 * export const GET = withMetrics('/api/test-image', async (req) => { ... });
 */
export function withMetrics(route: string, handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    const end = httpRequestDuration.startTimer();
    let status = 500;
    try {
      const res = await handler(req, ctx);
      status = res.status;
      return res;
    } finally {
      const labels = { method: req.method, route, status_code: String(status) };
      httpRequestsTotal.inc(labels);
      end(labels);
    }
  };
}
