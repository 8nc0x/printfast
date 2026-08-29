'use server';

import { auth } from '@/auth';
import { createPaymentForJob } from '@/lib/payments/process';

export async function startPayment(jobId: string): Promise<{ redirectUrl?: string; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'student') return { error: 'Unauthorized' };
  try {
    const res = await createPaymentForJob(jobId, session.user.id);
    return { redirectUrl: res.redirectUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not start payment' };
  }
}
