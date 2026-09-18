'use server';

import { revalidatePath } from 'next/cache';
import type { JobStatus, OrderStatus } from '@printflow/shared';
import { auth } from '@/auth';
import { transitionJob, getFinalPdfUrl } from '@/lib/data/shop-actions';
import { transitionOrder } from '@/lib/data/orders';
import { db } from '@/lib/db';

async function requireShopOwner() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'shop_owner') throw new Error('Unauthorized');
  return session.user;
}

export async function shopTransition(jobId: string, to: JobStatus): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireShopOwner();
    await transitionJob(jobId, to, user.id);
    revalidatePath('/shop/orders');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
  }
}

export async function shopFinalPdfUrl(jobId: string): Promise<{ url?: string; error?: string }> {
  try {
    await requireShopOwner();
    const url = await getFinalPdfUrl(jobId);
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not available' };
  }
}

/** Ecosystem-order transition (Phase 2 unified board). */
export async function shopOrderTransition(
  orderId: string,
  to: OrderStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireShopOwner();

    // Scope: the order must belong to the owner's shop.
    const shop = await db().shop.findFirst({
      where: { ownerId: user.id, isActive: true },
      select: { id: true },
    });
    if (!shop) throw new Error('No shop configured');

    const order = await db().order.findFirst({
      where: { id: orderId, shopId: shop.id },
      select: { id: true },
    });
    if (!order) throw new Error('Order not found');

    await transitionOrder(orderId, to, user.id);
    revalidatePath('/shop/orders');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
  }
}
