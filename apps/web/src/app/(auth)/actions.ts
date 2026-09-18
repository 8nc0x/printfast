'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { USER_ROLES } from '@printflow/shared';
import { db } from '@/lib/db';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  role: z.enum(USER_ROLES).default('student'),
  ref: z.string().max(12).optional(), // referral code captured at signup
});

export type RegisterState = { error?: string; ok?: boolean };

export async function registerUser(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role') ?? 'student',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { name, email, password, role, ref } = parsed.data;

  const existing = await db().user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  if (existing) {
    return { error: 'An account with this email already exists' };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await db().user.create({
      data: {
        email: email.toLowerCase(),
        name,
        role,
        passwordHash,
      },
    });

    // Referral capture (first writer wins; best-effort).
    if (ref) {
      const { attachReferrer, ensureReferralCode } = await import('@/lib/money/referrals');
      await attachReferrer(user.id, ref).catch(() => {});
      await ensureReferralCode(user.id).catch(() => {}); // give the new user their own code
    }
  } catch {
    return { error: 'Could not create account. Please try again.' };
  }

  return { ok: true };
}
