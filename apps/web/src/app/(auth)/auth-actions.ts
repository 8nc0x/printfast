'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export type LoginState = { error?: string };

export async function loginWithCredentials(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: (formData.get('callbackUrl') as string) || '/dashboard',
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Invalid email or password' };
    }
    throw err; // re-throw redirect
  }
}

export async function loginWithGoogle(formData: FormData) {
  await signIn('google', {
    redirectTo: (formData.get('callbackUrl') as string) || '/dashboard',
  });
}
