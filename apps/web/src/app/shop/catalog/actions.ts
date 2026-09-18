'use server';

import { revalidatePath } from 'next/cache';
import { resolveShopId } from '@/lib/data/shop-context';
import {
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  type CatalogItemInput,
} from '@/lib/data/catalog';

async function requireShop() {
  const shopId = await resolveShopId();
  if (!shopId) throw new Error('No shop configured for this account');
  return shopId;
}

export async function addCatalogItemAction(input: CatalogItemInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const shopId = await requireShop();
    if (!input.name?.trim()) throw new Error('Name is required');
    if (!(input.price >= 0)) throw new Error('Price must be zero or more');
    await createCatalogItem(shopId, input);
    revalidatePath('/shop/catalog');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function updateStockAction(
  itemId: string,
  stock: number,
  trackStock: boolean,
  lowStockThreshold: number | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const shopId = await requireShop();
    await updateCatalogItem(shopId, itemId, {});
    const { db } = await import('@/lib/db');
    await db().catalogItem.updateMany({
      where: { id: itemId, shopId },
      data: { stock: Math.max(0, stock), trackStock, lowStockThreshold },
    });
    revalidatePath('/shop/catalog');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function updateCatalogItemAction(
  itemId: string,
  input: Partial<CatalogItemInput>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const shopId = await requireShop();
    await updateCatalogItem(shopId, itemId, input);
    revalidatePath('/shop/catalog');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function toggleCatalogItemAction(
  itemId: string,
  isVisible: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const shopId = await requireShop();
    await updateCatalogItem(shopId, itemId, { isVisible });
    revalidatePath('/shop/catalog');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function deleteCatalogItemAction(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const shopId = await requireShop();
    await deleteCatalogItem(shopId, itemId);
    revalidatePath('/shop/catalog');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}
