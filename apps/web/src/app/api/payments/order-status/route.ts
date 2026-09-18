import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payments';
import { fulfillOrderPayment } from '@/lib/data/orders';

export const runtime = 'nodejs';

/**
 * Status polling for ecosystem-order checkout. Polling NEVER fulfills on its own
 * authority — it reflects provider state and applies the same idempotent
 * fulfillment the webhook uses (the webhook remains authoritative).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  const order = await db().order.findFirst({
    where: { id: orderId, customerId: session.user.id },
    select: { id: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PAYMENT_PROCESSING') {
    return NextResponse.json({ status: order.status });
  }

  const payment = await db().payment.findFirst({
    where: { ecosystemOrderId: orderId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, paymentReference: true },
  });
  if (!payment?.paymentReference) {
    return NextResponse.json({ status: order.status });
  }

  const provider = getPaymentProvider();
  if (typeof (provider as { checkStatus?: unknown }).checkStatus !== 'function') {
    return NextResponse.json({ status: 'PENDING' });
  }

  try {
    const state = await (provider as { checkStatus(ref: string): Promise<'PENDING' | 'SUCCESS' | 'EXPIRED'> })
      .checkStatus(payment.paymentReference);

    if (state === 'SUCCESS') {
      await fulfillOrderPayment(orderId, payment.paymentReference, { source: 'order-status-poll' });
      return NextResponse.json({ status: 'PAID' });
    }
    if (state === 'EXPIRED') {
      await db().payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      await db().order.update({ where: { id: orderId }, data: { status: 'AWAITING_PAYMENT' } });
      return NextResponse.json({ status: 'EXPIRED' });
    }
    return NextResponse.json({ status: 'PENDING' });
  } catch (e) {
    return NextResponse.json(
      { status: 'PENDING', error: e instanceof Error ? e.message : 'status check failed' },
      { status: 200 },
    );
  }
}
