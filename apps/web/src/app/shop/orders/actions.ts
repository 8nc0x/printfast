'use server';

import { revalidatePath } from 'next/cache';
import type { JobStatus } from '@printflow/shared';
import { auth } from '@/auth';
import { transitionJob, getFinalPdfUrl } from '@/lib/data/shop-actions';

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
