import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payments';
import { processSuccessfulPayment } from '@/lib/payments/process';

export const runtime = 'nodejs';

/**
 * Status polling endpoint for the custom checkout UI (PayXmint §4 step 3).
 * Polling NEVER fulfills — it only reflects state. Fulfillment is authoritative
 * via the signed webhook; this proxy does apply already-verified success so the
 * UI can advance even if the webhook is momentarily delayed, using the same
 * idempotent path.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  // Ownership: only the job's student may poll its payment status.
  const job = await db().printJob.findFirst({
    where: { id: jobId, studentId: session.user.id },
    select: { id: true, status: true, isLocked: true },
  });
  if (!job) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (job.isLocked || job.status !== 'payment_pending') {
    return NextResponse.json({ status: job.status, locked: job.isLocked });
  }

  const payment = await db().payment.findFirst({
    where: { jobId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, paymentReference: true, provider: true },
  });
  if (!payment?.paymentReference) {
    return NextResponse.json({ status: job.status });
  }

  // Ask the provider for authoritative status. Only 'payxmint' supports
  // check-status; the dev sandbox completes via /api/payments/dev-complete.
  const provider = getPaymentProvider();
  if (typeof (provider as { checkStatus?: unknown }).checkStatus !== 'function') {
    return NextResponse.json({ status: 'PENDING', reference: payment.paymentReference });
  }

  try {
    const state = await (provider as { checkStatus(ref: string): Promise<'PENDING' | 'SUCCESS' | 'EXPIRED'> })
      .checkStatus(payment.paymentReference);

    if (state === 'SUCCESS') {
      await processSuccessfulPayment(jobId, payment.paymentReference, { source: 'status-poll' });
      return NextResponse.json({ status: 'SUCCESS', reference: payment.paymentReference });
    }
    if (state === 'EXPIRED') {
      // Expired intent → back to configured so the student can retry payment.
      await db().payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      await db().printJob.update({ where: { id: jobId }, data: { status: 'configured' } });
      return NextResponse.json({ status: 'EXPIRED' });
    }
    return NextResponse.json({ status: 'PENDING', reference: payment.paymentReference });
  } catch (e) {
    return NextResponse.json(
      { status: 'PENDING', error: e instanceof Error ? e.message : 'status check failed' },
      { status: 200 },
    );
  }
}
