import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import type { UserRole } from '@printflow/shared';

/**
 * Edge-safe base config. Imported by BOTH middleware (Edge runtime) and the full
 * Node auth. It must NOT import bcrypt, Supabase, or anything Node-only — the
 * Credentials provider and DB callbacks live in auth.ts instead.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    // Runs in the Edge middleware — reads persisted claims, no DB access.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = (token.role as UserRole) ?? 'student';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
