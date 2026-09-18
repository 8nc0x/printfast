import 'server-only';
import { auth } from '@/auth';
import { db } from '@/lib/db';

/**
 * Resolve the shop for the signed-in shop owner. Returns null when unauthenticated
 * or no shop exists yet. Single helper so every shop page scopes consistently.
 */
export async function resolveShopId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;

  if (session.user.role === 'shop_owner') {
    const owned = await db().shop.findFirst({
      where: { ownerId: session.user.id, isActive: true },
      select: { id: true },
    });
    if (owned) return owned.id;
  }

  // Fallback (MVP single-shop mode): first active shop.
  const fallback = await db().shop.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return fallback?.id ?? null;
}
