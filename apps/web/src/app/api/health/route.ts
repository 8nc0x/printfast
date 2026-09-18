import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Health check for uptime monitoring + load balancers.
 * Verifies DB connectivity and reports operational depth (online agents).
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db().$queryRaw`SELECT 1`;

    // Online agents (heartbeat within 5 minutes) — operational signal.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineAgents = await db().agent.count({
      where: { status: 'active', lastSeenAt: { gte: fiveMinAgo } },
    });

    return NextResponse.json({
      ok: true,
      db: 'up',
      onlineAgents,
      latencyMs: Date.now() - startedAt,
      t: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        db: 'down',
        error: e instanceof Error ? e.message : 'unknown',
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
