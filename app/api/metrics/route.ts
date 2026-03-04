import { NextRequest, NextResponse } from 'next/server';
import { registry } from '../../../lib/metrics';
import { withMetrics } from '../../../lib/withMetrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Handles GET requests to the metrics endpoint.
 * 
 * This endpoint is part of the metrics API route and is responsible for collecting
 * and returning Prometheus metrics in the appropriate format. It's typically used by
 * monitoring systems to scrape application metrics.
 * 
 * @returns {Promise<NextResponse>} A NextResponse object containing:
 *   - On success (200): Serialized Prometheus metrics with proper content-type header
 *   - On error (500): Error message if metrics collection fails
 * 
 * @throws Catches and logs errors during metrics collection, returning a 500 status
 * 
 * @example
 * GET /api/metrics
 * 
 * @remarks
 * - Uses Prometheus client register to collect metrics
 * - Sets appropriate Content-Type header for Prometheus format
 * - Errors are logged to console for debugging purposes
 */
export const GET = withMetrics('/api/metrics', async (_req: NextRequest) => {
  try {
    const metrics = await registry.metrics();
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': registry.contentType,
      },
    });
  } catch (err) {
    console.error('Failed to collect metrics', err);
    return new NextResponse('Error collecting metrics', { status: 500 });
  }
});
