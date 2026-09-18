import { requireAgent } from '@/lib/agent-auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Agent event stream (SSE). Pushes a ping when any job for this shop changes
 * state so the agent can immediately re-poll /api/agent/orders. Fallback: the
 * agent polls every 10s anyway, so SSE only reduces latency.
 */
export async function GET(req: Request) {
  let agent;
  try {
    agent = await requireAgent(req);
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  const shopId = agent.shopId;
  let lastSeenAt = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('hello', { v: 1 });

      const interval = setInterval(async () => {
        try {
          const changed = await db().printJob.findFirst({
            where: { shopId, updatedAt: { gt: lastSeenAt } },
            select: { id: true },
          });
          if (changed) {
            lastSeenAt = new Date();
            send('jobs-changed', { orderId: changed.id });
          } else {
            send('ping', { t: Date.now() });
          }
        } catch {
          /* keep the stream alive */
        }
      }, 5000);

      // Close on client disconnect.
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
