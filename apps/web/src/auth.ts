import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { UserRole } from '@printflow/shared';
import { authConfig } from '@/auth.config';
import { db } from '@/lib/db';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function getUserByEmail(email: string) {
  return db().user.findUnique({ where: { email: email.toLowerCase() } });
}

/**
 * Full Node-runtime auth: extends the edge-safe base with the Credentials
 * provider (bcrypt) and DB-backed callbacks. Used by the API route + server
 * actions, never by middleware.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await getUserByEmail(parsed.data.email);
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        const existing = await getUserByEmail(user.email);
        if (!existing) {
          await db().user.create({
            data: {
              email: user.email.toLowerCase(),
              name: user.name ?? null,
              image: user.image ?? null,
              role: 'student',
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      // Resolve canonical id + role once, at sign-in (user is set then).
      if (user?.email) {
        const dbUser = await getUserByEmail(user.email);
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role as UserRole;
        }
      }
      return token;
    },
  },
});
