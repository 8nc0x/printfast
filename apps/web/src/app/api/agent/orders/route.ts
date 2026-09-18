import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/agent-auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Paid print jobs for the agent's shop. Structural gate: only jobs at or beyond
 * `paid` are returned — an unpaid job is impossible to reach here.
 */
export async function GET(req: Request) {
  let agent;
  try {
    agent = await requireAgent(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const jobs = await db().printJob.findMany({
    where: {
      shopId: agent.shopId,
      status: { in: ['paid', 'shop_received', 'approved', 'printing'] },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      student: { select: { name: true } },
      groups: true,
    },
  });

  return NextResponse.json({
    orders: jobs.map((j) => ({
      orderId: j.id,
      orderNumber: j.orderNumber,
      status: j.status,
      customerName: j.student?.name ?? 'Student',
      totalPages: j.totalPages,
      colorPages: j.colorPages,
      copies: j.copies,
      amount: j.priceAmount != null ? Number(j.priceAmount) : null,
      hasFinalPdf: Boolean(j.finalPdfPath),
      createdAt: j.createdAt.toISOString(),
      groups: j.groups.map((g) => ({
        id: g.id,
        pages: g.pages,
        paperSize: g.paperSize,
        color: g.color,
        sides: g.sides,
        copies: g.copies,
        quality: g.quality,
      })),
    })),
  });
}
