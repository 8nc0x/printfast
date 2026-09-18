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

export async function adminUserAction(
  userId: string,
  action: 'ban' | 'unban',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();

    // Guard: cannot ban an admin/super_admin.
    const target = await db().user.findUnique({ where: { id: userId }, select: { role: true } });
    if (target && (target.role === 'admin' || target.role === 'super_admin')) {
      throw new Error('Cannot ban an administrator');
    }

    await db().user.update({ where: { id: userId }, data: { isBanned: action === 'ban' } });
    await db().auditLog.create({
      data: {
        actorId: admin.id,
        action: `admin.user.${action}`,
        metadata: { userId },
      },
    });

    revalidatePath('/admin/users');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
