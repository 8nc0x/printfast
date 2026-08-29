import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { processSuccessfulPayment } from '@/lib/payments/process';
import { audit } from '@/lib/data/audit';

/**
 * Gateway webhook. The ONLY path that can mark a job PAID. Verifies the signature
 * server-side, then applies the payment idempotently.
 */
export async function POST(req: Request) {
  const provider = getPaymentProvider();
  let verified;
  try {
    verified = await provider.verifyCallback(req);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }

  if (!verified.ok) {
    await audit({ jobId: verified.jobId || null, action: 'payment_callback_rejected', metadata: { reason: 'signature' } });
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  if (verified.status !== 'success') {
    await audit({ jobId: verified.jobId, action: 'payment_failed' });
    return NextResponse.json({ ok: true });
  }

  try {
    await processSuccessfulPayment(verified.jobId, verified.gatewayReference, verified.raw);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
