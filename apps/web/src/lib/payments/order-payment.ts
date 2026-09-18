import 'server-only';
import { db } from '@/lib/db';
import { getPaymentProvider } from './index';
import type { Prisma } from '@printflow/db';

/**
 * Begin payment for an ecosystem Order (Phase 2). Snapshots the total on a
 * pending Payment row linked to the order, and returns checkout params
 * (UPI deep links / QR / hosted redirect) for the customer.
 */
export async function createPaymentForOrder(
  orderId: string,
  amount: number,
): Promise<{ id: string; reference: string; redirectUrl?: string; params?: Record<string, unknown> }> {
  const order = await db().order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, status: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.status !== 'AWAITING_PAYMENT') throw new Error('Order is not awaiting payment');
  if (amount <= 0) throw new Error('Payment amount must be positive');

  const provider = getPaymentProvider();
  const created = await provider.createPayment({
    jobId: order.id, // provider contract carries the internal id; webhook resolves it
    amount,
    currency: 'INR',
    orderNumber: order.number,
  });

  const payment = await db().payment.create({
    data: {
      ecosystemOrderId: order.id,
      amount,
      currency: 'INR',
      status: 'pending',
      provider: provider.name,
      paymentReference: created.paymentReference,
    },
  });

  await db().order.update({ where: { id: order.id }, data: { status: 'PAYMENT_PROCESSING' } });

  return {
    id: payment.id,
    reference: created.paymentReference,
    redirectUrl: created.redirectUrl,
    params: created.params as Prisma.JsonObject | undefined,
  };
}
