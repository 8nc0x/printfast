/**
 * Order model — the ecosystem's core object (Phase 2).
 * A print job is ONE item inside an order; orders can also contain stationery
 * products and services. Keep in sync with packages/db/prisma/schema.prisma.
 */

import { z } from 'zod';

export const ORDER_STATUSES = [
  'CREATED',
  'AWAITING_PAYMENT',
  'PAYMENT_PROCESSING',
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Valid forward transitions of the order state machine. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAYMENT_PROCESSING', 'CANCELLED', 'EXPIRED'],
  PAYMENT_PROCESSING: ['PAID', 'AWAITING_PAYMENT'], // back on failure/timeout
  PAID: ['ACCEPTED', 'CANCELLED'], // CANCELLED after PAID ⇒ refund flow
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  READY_FOR_PICKUP: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Orders the shop acts on must be at or beyond this status. */
export const SHOP_ORDER_VISIBLE_FROM: OrderStatus = 'PAID';

export function isShopOrderVisible(status: OrderStatus): boolean {
  return ORDER_STATUSES.indexOf(status) >= ORDER_STATUSES.indexOf(SHOP_ORDER_VISIBLE_FROM);
}

export const ITEM_KINDS = ['PRINT', 'PRODUCT', 'SERVICE'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const FULFILLMENT_MODES = ['PICKUP', 'DELIVERY'] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

// ---------- cart & checkout schemas ----------

export const cartOptionSchema = z.object({
  groupId: z.string().min(1), // e.g. 'size', 'cover'
  valueId: z.string().min(1), // e.g. 'A4', 'hard'
});
export type CartOption = z.infer<typeof cartOptionSchema>;

export const cartItemSchema = z.object({
  /** Present for catalog items (PRODUCT/SERVICE). Absent for ad-hoc PRINT. */
  itemId: z.string().uuid().optional(),
  kind: z.enum(ITEM_KINDS),
  qty: z.number().int().min(1).max(999),
  options: z.array(cartOptionSchema).default([]),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const checkoutSchema = z.object({
  shopId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1),
  fulfillment: z.enum(FULFILLMENT_MODES),
  deliveryAddress: z
    .object({
      name: z.string().min(1),
      phone: z.string().min(10).max(15),
      address: z.string().min(5),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
  notes: z.string().max(500).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** The authoritative price returned by the server quote/checkout flow. */
export interface QuoteLine {
  label: string;
  amount: number;
}

export interface QuoteResult {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  /** Filled when the shop cannot fulfill the request as asked. */
  warnings?: string[];
}
