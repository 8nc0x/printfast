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

export async function updateConfigAction(
  key: string,
  field: 'amount' | 'pct',
  value: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    if (!(value >= 0)) throw new Error('Value must be zero or more');

    await db().platformConfig.upsert({
      where: { key },
      create: { key, value: field === 'pct' ? { pct: value } : { amount: value }, updatedBy: admin.id },
      update: { value: field === 'pct' ? { pct: value } : { amount: value }, updatedBy: admin.id },
    });
    await db().auditLog.create({
      data: {
        actorId: admin.id,
        action: 'admin.config.update',
        metadata: { key, value, field },
      },
    });

    revalidatePath('/admin/config');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
