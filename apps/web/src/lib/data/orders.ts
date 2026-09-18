import 'server-only';
import {
  canTransitionOrder,
  isShopOrderVisible,
  checkoutSchema,
  optionsSurcharge,
  optionLabels,
  validateSelections,
  parseItemOptions,
  type CheckoutInput,
  type OrderStatus,
  type QuoteResult,
} from '@printflow/shared';
import { db } from '@/lib/db';

// ---------- order numbers ----------

async function nextOrderNumber(): Promise<string> {
  // PP-<base36 timestamp>-<rand> — short, unique, human-typeable.
  for (let i = 0; i < 8; i++) {
    const n = `PP-${Date.now().toString(36).toUpperCase().slice(-5)}${crypto
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, 3)
      .toUpperCase()}`;
    const exists = await db().order.findUnique({ where: { number: n }, select: { id: true } });
    if (!exists) return n;
  }
  throw new Error('Could not generate order number');
}

// ---------- platform fee (PlatformConfig, admin-editable) ----------

export async function getPlatformFee(): Promise<number> {
  const row = await db().platformConfig.findUnique({ where: { key: 'platform_fee' } });
  const v = row?.value as { amount?: number } | undefined;
  return typeof v?.amount === 'number' ? v.amount : 0;
}

// ---------- quote ----------

/**
 * Authoritative quote. Prices ALWAYS come from the DB (catalog item price or
 * per-shop pricing rules) — never from client input.
 */
export async function quoteOrder(input: CheckoutInput): Promise<QuoteResult> {
  const parsed = checkoutSchema.parse(input);
  const lines: QuoteResult['lines'] = [];
  let subtotal = 0;
  const warnings: string[] = [];

  for (const item of parsed.items) {
    if (item.kind === 'PRINT') {
      throw new Error('PRINT items are created via the print wizard and attached to the order');
    }
    if (!item.itemId) throw new Error('Catalog item required');

    const catalogItem = await db().catalogItem.findFirst({
      where: { id: item.itemId, shopId: parsed.shopId, isVisible: true },
    });
    if (!catalogItem) {
      warnings.push('One item is no longer available and was excluded.');
      continue;
    }

    const qty = Math.max(catalogItem.minQty, Math.min(item.qty, catalogItem.maxQty ?? item.qty));
    if (qty !== item.qty) {
      warnings.push(`${catalogItem.name}: quantity adjusted to ${qty}.`);
    }

    // Options: validate against the item's config, then price the deltas.
    const itemOptions = parseItemOptions(catalogItem.options);
    validateSelections(itemOptions, item.options ?? []);
    const surcharge = optionsSurcharge(itemOptions, item.options ?? []);

    const unitPrice = Number(catalogItem.price) + surcharge;
    const amount = round2(unitPrice * qty);
    subtotal += amount;
    const chosen = optionLabels(itemOptions, item.options ?? []);
    lines.push({
      label: `${catalogItem.name}${chosen.length > 0 ? ` (${chosen.join(' · ')})` : ''} × ${qty}${
        catalogItem.unit !== 'piece' ? ` ${catalogItem.unit}` : ''
      }`,
      amount,
    });
  }

  // Delivery fee — shop-controlled config.
  let deliveryFee = 0;
  if (parsed.fulfillment === 'DELIVERY') {
    const config = await db().shopDelivery.findUnique({ where: { shopId: parsed.shopId } });
    if (!config || !config.enabled) {
      throw new Error('This shop does not offer delivery');
    }
    if (Number(config.minOrder) > 0 && subtotal < Number(config.minOrder)) {
      throw new Error(`Minimum order for delivery is ₹${Number(config.minOrder)}`);
    }
    deliveryFee =
      config.freeAbove != null && subtotal >= Number(config.freeAbove) ? 0 : Number(config.fee);
  }

  const platformFee = await getPlatformFee();
  const total = round2(subtotal + deliveryFee + platformFee);

  return {
    currency: 'INR',
    lines: [
      ...lines,
      ...(deliveryFee > 0 ? [{ label: 'Delivery', amount: round2(deliveryFee) }] : []),
      ...(platformFee > 0 ? [{ label: 'Platform fee', amount: round2(platformFee) }] : []),
    ],
    subtotal: round2(subtotal),
    deliveryFee: round2(deliveryFee),
    platformFee: round2(platformFee),
    total,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ---------- checkout ----------

export interface CreatedOrder {
  orderId: string;
  orderNumber: string;
  quote: QuoteResult;
  payment: { id: string; reference: string; redirectUrl?: string; params?: Record<string, unknown> };
}

/**
 * Create the order + snapshot pricing, and start payment. The order becomes
 * visible to the shop only when its payment succeeds (status gate: >= PAID).
 * Applies up to `useWallet` of the customer's REFERRAL wallet balance against
 * the total; the remainder goes to the gateway.
 */
export async function createOrderFromCheckout(
  input: CheckoutInput,
  customerId: string,
  useWallet = 0,
): Promise<CreatedOrder> {
  const parsed = checkoutSchema.parse(input);
  const q = await quoteOrder(parsed);

  if (q.subtotal <= 0) throw new Error('Nothing to order');

  const shop = await db().shop.findFirst({
    where: { id: parsed.shopId, isActive: true, acceptingOrders: true },
    select: { id: true },
  });
  if (!shop) throw new Error('Shop is not accepting orders right now');

  // Wallet application: clamp to balance and to the total.
  const { getWalletBalance } = await import('@/lib/money/wallets');
  const balance = await getWalletBalance(customerId, 'REFERRAL');
  const walletApplied = Math.max(0, Math.min(useWallet, balance, q.total));
  const payable = round2(q.total - walletApplied);

  const orderNumber = await nextOrderNumber();

  // Re-resolve each catalog item to build snapshot line items.
  const itemCreates: {
    itemId: string;
    kind: 'PRODUCT' | 'SERVICE';
    nameSnapshot: string;
    unitPrice: number;
    qty: number;
    lineTotal: number;
    optionsSnapshot: { groupId: string; valueId: string }[];
  }[] = [];

  for (const item of parsed.items) {
    if (item.kind === 'PRINT' || !item.itemId) continue;
    const catalogItem = await db().catalogItem.findFirst({
      where: { id: item.itemId, shopId: parsed.shopId, isVisible: true },
    });
    if (!catalogItem) continue;
    const qty = Math.max(catalogItem.minQty, Math.min(item.qty, catalogItem.maxQty ?? item.qty));

    // Re-price options server-side and snapshot labels for order history.
    const itemOptions = parseItemOptions(catalogItem.options);
    validateSelections(itemOptions, item.options ?? []);
    const surcharge = optionsSurcharge(itemOptions, item.options ?? []);
    const chosen = optionLabels(itemOptions, item.options ?? []);

    const unitPrice = round2(Number(catalogItem.price) + surcharge);
    itemCreates.push({
      itemId: catalogItem.id,
      kind: catalogItem.kind as 'PRODUCT' | 'SERVICE',
      nameSnapshot: chosen.length > 0 ? `${catalogItem.name} (${chosen.join(' · ')})` : catalogItem.name,
      unitPrice,
      qty,
      lineTotal: round2(unitPrice * qty),
      optionsSnapshot: item.options ?? [],
    });
  }

  if (itemCreates.length === 0) throw new Error('No valid items in this order');

  const order = await db().order.create({
    data: {
      number: orderNumber,
      shopId: parsed.shopId,
      customerId,
      status: 'AWAITING_PAYMENT',
      fulfillment: parsed.fulfillment,
      deliveryAddress: (parsed.deliveryAddress ?? null) as never,
      subtotal: q.subtotal,
      deliveryFee: q.deliveryFee,
      platformFee: q.platformFee,
      total: q.total,
      walletApplied: walletApplied,
      pricingSnapshot: q as never,
      notes: parsed.notes ?? null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h payment window
      items: {
        create: itemCreates.map(({ optionsSnapshot, ...data }) => ({
          ...data,
          options: optionsSnapshot,
        })),
      },
    },
  });

  await db().orderEvent.create({
    data: { orderId: order.id, to: 'AWAITING_PAYMENT', actorId: customerId, note: 'Order created' },
  });

  // Debit the wallet first (guard inside debitWallet re-checks balance).
  if (walletApplied > 0) {
    const { debitWallet } = await import('@/lib/money/wallets');
    await debitWallet(customerId, 'REFERRAL', walletApplied, `order_credit:${orderNumber}`, order.id);
  }

  // Start payment via the provider for the REMAINDER (if any).
  if (payable > 0) {
    const { createPaymentForOrder } = await import('@/lib/payments/order-payment');
    const payment = await createPaymentForOrder(order.id, payable);
    return { orderId: order.id, orderNumber, quote: q, payment };
  }

  // Fully covered by wallet → fulfill immediately.
  await fulfillOrderPayment(order.id, 'wallet', { wallet: true });
  return {
    orderId: order.id,
    orderNumber,
    quote: q,
    payment: { id: '', reference: 'wallet' },
  };
}

// ---------- shop board ----------

export interface ShopOrderRow {
  id: string;
  number: string;
  status: OrderStatus;
  fulfillment: 'PICKUP' | 'DELIVERY';
  customerName: string | null;
  total: number;
  itemCount: number;
  printJobCount: number;
  createdAt: string;
}

/**
 * Paid orders for the shop's unified board. The where-clause status gate makes
 * unpaid orders structurally invisible here.
 */
export async function getShopOrders(shopId: string): Promise<ShopOrderRow[]> {
  const statuses: OrderStatus[] = [
    'PAID', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'COMPLETED',
  ];
  const rows = await db().order.findMany({
    where: { shopId, status: { in: statuses } },
    orderBy: { createdAt: 'asc' },
    include: {
      customer: { select: { name: true } },
      items: { select: { id: true, printJobId: true } },
    },
  });
  return rows
    .filter((o) => isShopOrderVisible(o.status))
    .map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      fulfillment: o.fulfillment,
      customerName: o.customer?.name ?? null,
      total: Number(o.total),
      itemCount: o.items.length,
      printJobCount: o.items.filter((i) => i.printJobId).length,
      createdAt: o.createdAt.toISOString(),
    }));
}

export function groupShopOrders(orders: ShopOrderRow[]) {
  const inBucket = (s: OrderStatus[]) => orders.filter((o) => s.includes(o.status));
  return {
    new: inBucket(['PAID']),
    accepted: inBucket(['ACCEPTED']),
    preparing: inBucket(['PREPARING']),
    ready: inBucket(['READY', 'READY_FOR_PICKUP']),
    out: inBucket(['OUT_FOR_DELIVERY']),
    completed: inBucket(['COMPLETED']),
  };
}

// ---------- transitions (shop + system) ----------

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorId?: string | null,
): Promise<void> {
  const order = await db().order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, customerId: true, number: true },
  });
  if (!order) throw new Error('Order not found');

  if (!canTransitionOrder(order.status, to)) {
    throw new Error(`Cannot move ${order.status} → ${to}`);
  }

  await db().order.update({ where: { id: order.id }, data: { status: to } });
  await db().orderEvent.create({
    data: { orderId: order.id, from: order.status, to, actorId: actorId ?? null },
  });

  // Inventory: deduct stock for tracked products when the order is COMPLETED.
  if (to === 'COMPLETED') {
    await deductStockForOrder(order.id);
  }

  const { notify } = await import('@/lib/data/audit');
  const NOTIFY_ON: Partial<Record<OrderStatus, string>> = {
    ACCEPTED: 'order_accepted',
    READY: 'order_ready',
    OUT_FOR_DELIVERY: 'order_out_for_delivery',
    COMPLETED: 'order_completed',
    CANCELLED: 'order_cancelled',
  };
  const type = NOTIFY_ON[to];
  if (type) {
    await notify({ userId: order.customerId, type, payload: { orderNumber: order.number } });
  }
}

/** Idempotent fulfillment when an ecosystem order's payment succeeds. */
export async function fulfillOrderPayment(
  orderId: string,
  gatewayReference: string,
  raw: unknown,
): Promise<void> {
  const order = await db().order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PAYMENT_PROCESSING') {
    return; // already fulfilled — idempotent
  }

  await db().order.update({ where: { id: orderId }, data: { status: 'PAID' } });
  await db().orderEvent.create({
    data: { orderId, from: order.status, to: 'PAID', note: `Payment verified (${gatewayReference})` },
  });

  // ── Money settlement (immutable ledger + referral reward) ──
  try {
    const { recordSettlement, getMoneyConfig } = await import('@/lib/money/ledger');
    const { creditCustomerReferral } = await import('@/lib/money/referrals');
    const payment = await db().payment.findFirst({
      where: { ecosystemOrderId: orderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const config = await getMoneyConfig();
    const amount = Number(order.total);
    await recordSettlement({
      paymentId: payment?.id ?? '',
      sourceType: 'order',
      sourceId: orderId,
      grossAmount: amount,
      platformFee: order.platformFee ? Number(order.platformFee) : config.platformFee,
      shopId: order.shopId,
      shopAmount: Math.max(0, amount - (order.platformFee ? Number(order.platformFee) : config.platformFee) - Number(order.deliveryFee)),
      gatewayFee: 0,
    });
    await creditCustomerReferral({
      customerId: order.customerId,
      sourceType: 'order',
      sourceId: orderId,
      paymentId: payment?.id ?? '',
    });
  } catch {
    // Settlement retry handled by reconcile cron; fulfillment proceeds.
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Deduct stock for tracked catalog items on order completion. */
async function deductStockForOrder(orderId: string): Promise<void> {
  const items = await db().orderItem.findMany({
    where: { orderId, item: { trackStock: true } },
    select: { itemId: true, qty: true },
  });
  for (const item of items) {
    if (!item.itemId) continue;
    await db().catalogItem.update({
      where: { id: item.itemId },
      data: { stock: { decrement: item.qty } },
    });
  }
  // Low-stock alerts (in-app, best-effort).
  try {
    const { notify } = await import('@/lib/data/audit');
    const shop = await db().order.findUnique({
      where: { id: orderId },
      select: { shopId: true },
    });
    if (!shop) return;
    const low = await db().catalogItem.findMany({
      where: {
        shopId: shop.shopId,
        trackStock: true,
        lowStockThreshold: { not: null },
        stock: { lte: 5 },
      },
      select: { id: true, name: true, stock: true, lowStockThreshold: true },
    });
    for (const item of low) {
      if (item.lowStockThreshold != null && item.stock <= item.lowStockThreshold) {
        const owner = await db().shop.findUnique({
          where: { id: shop.shopId },
          select: { ownerId: true },
        });
        if (owner?.ownerId) {
          await notify({
            userId: owner.ownerId,
            type: 'low_stock',
            payload: { item: item.name, stock: item.stock },
          });
        }
      }
    }
  } catch {
    /* best-effort */
  }
}
