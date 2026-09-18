'use server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { createPaymentForOrder } from '@/lib/payments/order-payment';

export async function startOrderPayment(
  orderId: string,
): Promise<{ redirectUrl?: string; params?: Record<string, unknown>; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) throw new Error('Please sign in');

    // Ownership check.
    const order = await db().order.findFirst({
      where: { id: orderId, customerId: session.user.id },
      select: { id: true, status: true, total: true },
    });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PAYMENT_PROCESSING') {
      throw new Error('This order is already paid');
    }

    const payment = await createPaymentForOrder(orderId, Number(order.total));
    return { redirectUrl: payment.redirectUrl, params: payment.params };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not start payment' };
  }
}
