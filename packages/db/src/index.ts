// Prisma client singleton. ONE entry point for all DB access in the monorepo —
// the web app, workers, and scripts all import getDb() from here.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'production'
          ? ['error']
          : ['error', 'warn'],
    });
  }
  return globalForPrisma.prisma;
}

export type { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
