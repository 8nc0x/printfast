'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { requestWithdrawal } from '@/lib/money/wallets';

export async function withdrawAction(
  input: { amount: number; upiVpa: string },
): Promise<{ error?: string; ok?: boolean }> {
  try {
    const session = await auth();
    if (!session?.user) throw new Error('Please sign in');
    if (!input.upiVpa || !input.upiVpa.includes('@')) throw new Error('Enter a valid UPI ID');
    if (!(input.amount > 0)) throw new Error('Enter an amount');

    await requestWithdrawal(session.user.id, input.amount, input.upiVpa.trim());
    revalidatePath('/wallet');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Withdrawal failed' };
  }
}
