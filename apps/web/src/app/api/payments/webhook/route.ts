import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { processSuccessfulPayment } from '@/lib/payments/process';
import { fulfillOrderPayment } from '@/lib/data/orders';
import { db } from '@/lib/db';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * PayXmint webhook — the ONLY path that can mark a job PAID in production.
 *
 * PayXmint rules enforced here (https://payxmint.com/docs §3):
 *  1. HMAC-SHA256 hex signature over the RAW body (verified inside the provider).
 *  2. Idempotency: duplicate deliveries return 200 and do nothing.
 *  3. Unique gateway reference (utr) at the DB level blocks double-credit.
 *  4. Always answer HTTP 200 after processing (even duplicates) so retries stop.
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
    await audit({ jobId: verified.jobId || null, action: 'payment_webhook_rejected', metadata: { reason: 'signature', provider: provider.name } });
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  if (verified.status !== 'success') {
    await audit({ jobId: verified.jobId || null, action: 'payment_webhook_non_success' });
    return NextResponse.json({ ok: true });
  }

  // Resolve the payment: prefer jobId from metadata; fall back to the external
  // order id carried in the webhook payload (order_id we passed at create-intent).
  let jobId = verified.jobId;
  if (!jobId) {
    const external = externalOrderIdFrom(verified.raw);
    if (external) {
      const payment = await db().payment.findFirst({
        where: { paymentReference: external },
        orderBy: { createdAt: 'desc' },
        select: { jobId: true, ecosystemOrderId: true, status: true },
      });
      if (payment?.jobId) jobId = payment.jobId;
      else if (payment?.ecosystemOrderId) {
        // Ecosystem order payment (Phase 2).
        await fulfillOrderPayment(payment.ecosystemOrderId, verified.gatewayReference, verified.raw);
        return NextResponse.json({ ok: true });
      }
    }
  }

  if (!jobId) {
    await audit({ action: 'payment_webhook_unmatched', metadata: { raw: verified.raw } });
    // 200 so PayXmint stops retrying an event we can never match.
    return NextResponse.json({ ok: true, status: 'unmatched' });
  }

  try {
    await processSuccessfulPayment(jobId, verified.gatewayReference, verified.raw);
  } catch (e) {
    // Non-200 on genuine processing failure → PayXmint will retry.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function externalOrderIdFrom(raw: unknown): string | null {
  if (raw && typeof raw === 'object' && 'order_id' in raw) {
    const v = (raw as Record<string, unknown>).order_id;
    if (typeof v === 'string') return v;
  }
  return null;
}
