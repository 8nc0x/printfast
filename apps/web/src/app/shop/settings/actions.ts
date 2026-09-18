'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { resolveShopId } from '@/lib/data/shop-context';
import { db } from '@/lib/db';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function updateShopProfile(input: {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  category: string;
  slug: string;
  acceptingOrders: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) throw new Error('Not signed in');
    const shopId = await resolveShopId();
    if (!shopId) throw new Error('No shop configured');

    if (!input.name.trim()) throw new Error('Shop name is required');
    const slug = slugify(input.slug || input.name);
    if (!slug) throw new Error('Slug is required');

    // Slug uniqueness (excluding self).
    const clash = await db().shop.findFirst({
      where: { slug, id: { not: shopId } },
      select: { id: true },
    });
    if (clash) throw new Error('That shop link is taken — try another.');

    await db().shop.update({
      where: { id: shopId },
      data: {
        name: input.name.trim(),
        address: input.address.trim() || null,
        phone: input.phone.trim() || null,
        whatsapp: input.whatsapp.trim() || null,
        category: input.category.trim() || null,
        slug,
        acceptingOrders: input.acceptingOrders,
      },
    });

    revalidatePath('/shop/settings');
    revalidatePath(`/s/${slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
}

export async function updateDeliveryConfig(input: {
  enabled: boolean;
  fee: number;
  minOrder: number;
  freeAbove: number | null;
  radiusKm: number;
  prepMinutes: number;
  deliveryMinutes: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) throw new Error('Not signed in');
    const shopId = await resolveShopId();
    if (!shopId) throw new Error('No shop configured');

    if (input.fee < 0 || input.minOrder < 0) throw new Error('Fees cannot be negative');

    await db().shopDelivery.upsert({
      where: { shopId },
      create: {
        shopId,
        enabled: input.enabled,
        fee: input.fee,
        minOrder: input.minOrder,
        freeAbove: input.freeAbove,
        radiusKm: input.radiusKm,
        prepMinutes: input.prepMinutes,
        deliveryMinutes: input.deliveryMinutes,
      },
      update: {
        enabled: input.enabled,
        fee: input.fee,
        minOrder: input.minOrder,
        freeAbove: input.freeAbove,
        radiusKm: input.radiusKm,
        prepMinutes: input.prepMinutes,
        deliveryMinutes: input.deliveryMinutes,
      },
    });

    revalidatePath('/shop/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
}
