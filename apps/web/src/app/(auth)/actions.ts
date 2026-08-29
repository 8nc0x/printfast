'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { USER_ROLES } from '@printflow/shared';
import { supabaseAdmin } from '@/lib/supabase/admin';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  role: z.enum(USER_ROLES).default('student'),
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

  const { name, email, password, role } = parsed.data;
  const db = supabaseAdmin();

  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) {
    return { error: 'An account with this email already exists' };
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { error } = await db.from('users').insert({
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    name,
    role,
    password_hash,
  });

  if (error) {
    return { error: 'Could not create account. Please try again.' };
  }

  return { ok: true };
}
