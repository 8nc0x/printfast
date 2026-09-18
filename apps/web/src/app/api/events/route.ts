import { auth } from '@/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE stream for dashboards.
 *  - shop_owner → changes to any job/order of their shop (new paid orders!)
 *  - student    → changes to their own jobs/orders (status updates)
 * Pushes a compact "changed" event; clients re-fetch the affected list.
 * Fallback: dashboards keep working with the refresh button if SSE drops.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('unauthorized', { status: 401 });

  const userId = session.user.id;
  const role = session.user.role;

  // Resolve the shop for owners.
  let shopId: string | null = null;
  if (role === 'shop_owner') {
    const shop = await db().shop.findFirst({
      where: { ownerId: userId, isActive: true },
      select: { id: true },
    });
    shopId = shop?.id ?? null;
  }

  const encoder = new TextEncoder();
  let lastCheck = new Date(Date.now() - 5000);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client gone */
        }
      };
      send('hello', { role, t: Date.now() });

      const interval = setInterval(async () => {
        try {
          if (role === 'shop_owner' && shopId) {
            const job = await db().printJob.findFirst({
              where: { shopId, updatedAt: { gt: lastCheck } },
              select: { id: true },
            });
            const order = await db().order.findFirst({
              where: { shopId, updatedAt: { gt: lastCheck } },
              select: { id: true },
            });
            if (job || order) {
              lastCheck = new Date();
              send('changed', { jobs: Boolean(job), orders: Boolean(order) });
              return;
            }
          } else {
            const job = await db().printJob.findFirst({
              where: { studentId: userId, updatedAt: { gt: lastCheck } },
              select: { id: true },
            });
            const order = await db().order.findFirst({
              where: { customerId: userId, updatedAt: { gt: lastCheck } },
              select: { id: true },
            });
            if (job || order) {
              lastCheck = new Date();
              send('changed', { jobs: Boolean(job), orders: Boolean(order) });
              return;
            }
          }
          send('ping', { t: Date.now() });
        } catch {
          /* keep stream alive */
        }
      }, 4000);

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
