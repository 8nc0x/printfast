import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDevPaymentMode } from '@/lib/payments';
import { processSuccessfulPayment } from '@/lib/payments/process';
import { db } from '@/lib/db';

/**
 * Local-only helper that simulates a successful gateway callback so the PAID flow
 * can be exercised without live credentials. Disabled in production and when a
 * real gateway base URL is configured.
 */
export async function POST(req: Request) {
  if (!isDevPaymentMode()) {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });

  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return NextResponse.json({ ok: false, error: 'jobId required' }, { status: 400 });

  // Ownership check — a student can only complete their own job.
  const job = await db().printJob.findFirst({
    where: { id: jobId, studentId: session.user.id },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  await processSuccessfulPayment(jobId, `DEV-${Date.now()}`, { simulated: true });
  return NextResponse.json({ ok: true });
}
