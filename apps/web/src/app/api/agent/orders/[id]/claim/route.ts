import { NextResponse } from 'next/server';
import { canTransition } from '@printflow/shared';
import { requireAgent } from '@/lib/agent-auth';
import { db } from '@/lib/db';
import { signedUrl } from '@/lib/storage';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * Claim a print job: agent picks it up for printing. Moves `shop_received` →
 * `approved` (or accepts an already-approved job for idempotent re-claims) and
 * returns a short-TTL signed URL for the final PDF.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let agent;
  try {
    agent = await requireAgent(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const job = await db().printJob.findFirst({
    where: { id, shopId: agent.shopId },
    include: { groups: true },
  });
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!['shop_received', 'approved', 'printing'].includes(job.status)) {
    return NextResponse.json({ error: 'job not claimable' }, { status: 409 });
  }
  if (!job.finalPdfPath) {
    return NextResponse.json({ error: 'final PDF not ready' }, { status: 409 });
  }

  if (canTransition(job.status, 'approved')) {
    await db().printJob.update({ where: { id: job.id }, data: { status: 'approved' } });
    await audit({ actorId: agent.id, jobId: job.id, action: 'agent_claimed', fromStatus: job.status, toStatus: 'approved' });
  }

  const pdfUrl = await signedUrl('finals', job.finalPdfPath, 600);

  return NextResponse.json({
    orderId: job.id,
    orderNumber: job.orderNumber,
    pdfUrl,
    groups: job.groups.map((g) => ({
      id: g.id,
      pages: g.pages,
      paperSize: g.paperSize,
      color: g.color,
      sides: g.sides,
      copies: g.copies,
      quality: g.quality,
    })),
  });
}
