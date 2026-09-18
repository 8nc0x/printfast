'use server';

import { auth } from '@/auth';
import { createOrderFromCheckout, quoteOrder } from '@/lib/data/orders';
import type { CheckoutInput } from '@printflow/shared';

export async function checkoutAction(
  input: CheckoutInput,
  useWallet = 0,
): Promise<{ error?: string; redirectUrl?: string }> {
  try {
    const session = await auth();
    if (!session?.user) throw new Error('Please sign in to place an order');

    const result = await createOrderFromCheckout(input, session.user.id, useWallet);

    // Wallet-only orders are already fulfilled — go straight to tracking.
    if (!result.payment?.reference || result.payment.reference === 'wallet') {
      return { redirectUrl: `/orders/${result.orderId}` };
    }

    // Send the customer to the order payment page (UPI/QR checkout).
    return { redirectUrl: `/orders/${result.orderId}/pay` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not place the order' };
  }
}

export async function quoteAction(input: CheckoutInput): Promise<{ total?: number; error?: string }> {
  try {
    const q = await quoteOrder(input);
    return { total: q.total };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Quote failed' };
  }
}
