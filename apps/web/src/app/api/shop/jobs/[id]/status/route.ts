import { NextResponse } from 'next/server';
import { JOB_STATUSES, type JobStatus } from '@printflow/shared';
import { requireShopToken } from '@/lib/shop-token';
import { transitionJob } from '@/lib/data/shop-actions';
import { db } from '@/lib/db';

/** Advance a job's status from the Electron client (approve/print/ready/etc.). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let payload;
  try {
    payload = requireShopToken(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };

  if (!status || !JOB_STATUSES.includes(status as JobStatus)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  // Scope to this shop.
  const row = await db().printJob.findUnique({
    where: { id },
    select: { shopId: true },
  });
  if (!row || row.shopId !== payload.shopId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const updated = await transitionJob(id, status as JobStatus, payload.sub);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 409 });
  }
}
