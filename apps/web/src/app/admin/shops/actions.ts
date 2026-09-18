'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

export async function adminShopAction(
  shopId: string,
  action: 'approve' | 'suspend' | 'activate',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();

    const data =
      action === 'approve'
        ? { status: 'ACTIVE' as const, isActive: true }
        : action === 'suspend'
          ? { status: 'SUSPENDED' as const, isActive: false, acceptingOrders: false }
          : { status: 'ACTIVE' as const, isActive: true, acceptingOrders: true };

    await db().shop.update({ where: { id: shopId }, data });
    await db().auditLog.create({
      data: {
        actorId: admin.id,
        action: `admin.shop.${action}`,
        metadata: { shopId },
      },
    });

    revalidatePath('/admin/shops');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
