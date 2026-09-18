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

export async function updatePlanAction(
  planId: string,
  input: { price: number; trialDays: number; features: Record<string, unknown> },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    if (!(input.price >= 0)) throw new Error('Invalid price');
    if (!(input.trialDays >= 0)) throw new Error('Invalid trial days');

    await db().subscriptionPlan.update({
      where: { id: planId },
      data: {
        price: input.price,
        trialDays: input.trialDays,
        features: input.features as object,
      },
    });
    await db().auditLog.create({
      data: {
        actorId: admin.id,
        action: 'admin.plan.update',
        metadata: { planId, price: input.price, trialDays: input.trialDays },
      },
    });

    revalidatePath('/admin/plans');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
