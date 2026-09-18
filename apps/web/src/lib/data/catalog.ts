import 'server-only';
import { db } from '@/lib/db';
import { parseItemOptions, type OptionGroup } from '@printflow/shared';
import type { Prisma } from '@printflow/db';

export interface CatalogItemView {
  id: string;
  kind: 'PRINT' | 'PRODUCT' | 'SERVICE';
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  price: number;
  isVisible: boolean;
  minQty: number;
  maxQty: number | null;
  /** Parsed option groups (spec §4.2); null when the item has none. */
  options: OptionGroup[] | null;
  sortOrder: number;
  trackStock: boolean;
  stock: number;
  lowStockThreshold: number | null;
}

function toView(item: Prisma.CatalogItemGetPayload<object>): CatalogItemView {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    description: item.description,
    category: item.category,
    unit: item.unit,
    price: Number(item.price),
    isVisible: item.isVisible,
    minQty: item.minQty,
    maxQty: item.maxQty,
    options: parseItemOptions(item.options)
      ? Object.values(parseItemOptions(item.options)!)
      : null,
    sortOrder: item.sortOrder,
    trackStock: item.trackStock,
    stock: item.stock,
    lowStockThreshold: item.lowStockThreshold,
  };
}

/** Visible catalog for customers (tracked items with zero stock are hidden). */
export async function getPublicCatalog(shopId: string): Promise<CatalogItemView[]> {
  const items = await db().catalogItem.findMany({
    where: {
      shopId,
      isVisible: true,
      OR: [{ trackStock: false }, { stock: { gt: 0 } }],
    },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return items.map(toView);
}

/** Full catalog for the shop owner. */
export async function getShopCatalog(shopId: string): Promise<CatalogItemView[]> {
  const items = await db().catalogItem.findMany({
    where: { shopId },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return items.map(toView);
}

export interface CatalogItemInput {
  kind: 'PRINT' | 'PRODUCT' | 'SERVICE';
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string;
  price: number;
  isVisible?: boolean;
  minQty?: number;
  maxQty?: number | null;
  /** Option groups keyed by group id (validated client-side, re-validated on read). */
  options?: Record<string, unknown> | null;
}

export async function createCatalogItem(shopId: string, input: CatalogItemInput) {
  // Validate the option config against the shared schema before persisting.
  const { itemOptionsSchema } = await import('@printflow/shared');
  const parsedOptions = input.options ? itemOptionsSchema.parse(input.options) : null;

  return db().catalogItem.create({
    data: {
      shopId,
      kind: input.kind,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      unit: input.unit ?? 'piece',
      price: input.price,
      isVisible: input.isVisible ?? true,
      minQty: input.minQty ?? 1,
      maxQty: input.maxQty ?? null,
      options: (parsedOptions ?? null) as never,
    },
  });
}

export async function updateCatalogItem(
  shopId: string,
  itemId: string,
  input: Partial<CatalogItemInput>,
) {
  // Scope by shop — an owner can only edit their own items.
  const { itemOptionsSchema } = await import('@printflow/shared');
  const parsedOptions =
    input.options === undefined
      ? undefined
      : input.options
        ? itemOptionsSchema.parse(input.options)
        : null;

  const { count } = await db().catalogItem.updateMany({
    where: { id: itemId, shopId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
      ...(input.minQty !== undefined ? { minQty: input.minQty } : {}),
      ...(input.maxQty !== undefined ? { maxQty: input.maxQty } : {}),
      ...(parsedOptions !== undefined ? { options: parsedOptions as never } : {}),
    },
  });
  if (count === 0) throw new Error('Item not found');
}

export async function deleteCatalogItem(shopId: string, itemId: string) {
  const { count } = await db().catalogItem.deleteMany({
    where: { id: itemId, shopId },
  });
  if (count === 0) throw new Error('Item not found');
}

/** The shop's delivery configuration (creates defaults on first read). */
export async function getDeliveryConfig(shopId: string) {
  let config = await db().shopDelivery.findUnique({ where: { shopId } });
  if (!config) {
    config = await db().shopDelivery.create({ data: { shopId } });
  }
  return config;
}
