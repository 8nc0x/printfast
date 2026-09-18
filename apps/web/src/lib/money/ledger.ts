import 'server-only';
import { db } from '@/lib/db';
import type { Prisma } from '@printflow/db';

/**
 * Immutable financial ledger.
 *
 * Rules (enforced here, tested in CI):
 *  1. Rows are INSERT-ONLY. No updates, no deletes. Corrections = reversing entry.
 *  2. Every settlement writes ALL sides of the transaction in ONE DB transaction:
 *     SHOP_EARNING + PLATFORM_FEE + REFERRAL_* + GATEWAY_FEE.
 *  3. Amounts are snapshots — never recomputed from current config values.
 */

interface SettlementInput {
  paymentId: string;
  /** 'print' → legacy print job payment; 'order' → ecosystem order; 'subscription' → shop plan */
  sourceType: 'print' | 'order' | 'subscription';
  sourceId: string;
  grossAmount: number;
  platformFee: number;
  shopId: string | null;
  shopAmount: number;
  gatewayFee: number;
  /** Referral reward (customer referrer) attached to this transaction, if any. */
  referral?: { referrerId: string; amount: number } | null;
  /** Shop-referral commission (shop referrer), if any. */
  shopReferral?: { referrerId: string; amount: number; pct: number } | null;
  currency?: string;
}

/**
 * Record the full settlement for one payment. Idempotent: if any ledger row
 * already exists for this paymentId, the whole settlement is skipped.
 */
export async function recordSettlement(input: SettlementInput): Promise<void> {
  const existing = await db().ledgerEntry.findFirst({
    where: { paymentId: input.paymentId },
    select: { id: true },
  });
  if (existing) return; // idempotent — webhook + reconcile may both call this

  const rows: Prisma.LedgerEntryCreateManyInput[] = [];
  const orderId = input.sourceType === 'order' ? input.sourceId : null;

  // Customer paid → gateway receives gross (collection side).
  rows.push({
    type: input.sourceType === 'subscription' ? 'SUBSCRIPTION_PAYMENT' : 'ORDER_PAYMENT',
    amount: dec(input.grossAmount),
    side: 1,
    account: 'gateway',
    orderId,
    paymentId: input.paymentId,
    refType: input.sourceType,
    refId: input.sourceId,
    memo: 'gross collected',
  });
  // Shop earns its share.
  if (input.shopId && input.shopAmount > 0) {
    rows.push({
      type: 'SHOP_EARNING',
      amount: dec(input.shopAmount),
      side: 1,
      account: `shop:${input.shopId}`,
      orderId,
      paymentId: input.paymentId,
      refType: input.sourceType,
      refId: input.sourceId,
      memo: 'shop earning',
    });
  }
  // Platform fee.
  if (input.platformFee > 0) {
    rows.push({
      type: 'PLATFORM_FEE',
      amount: dec(input.platformFee),
      side: 1,
      account: 'platform',
      orderId,
      paymentId: input.paymentId,
      refType: input.sourceType,
      refId: input.sourceId,
      memo: 'platform fee',
    });
  }
  // Customer-referral reward carved out of the platform fee.
  if (input.referral && input.referral.amount > 0) {
    rows.push({
      type: 'REFERRAL_REWARD',
      amount: dec(input.referral.amount),
      side: 1,
      account: `user:${input.referral.referrerId}`,
      orderId,
      paymentId: input.paymentId,
      refType: input.sourceType,
      refId: input.sourceId,
      memo: 'customer referral reward',
    });
  }
  // Shop-referral commission on subscriptions.
  if (input.shopReferral && input.shopReferral.amount > 0) {
    rows.push({
      type: 'REFERRAL_COMMISSION',
      amount: dec(input.shopReferral.amount),
      side: 1,
      account: `user:${input.shopReferral.referrerId}`,
      orderId,
      paymentId: input.paymentId,
      refType: input.sourceType,
      refId: input.sourceId,
      memo: `shop referral commission (${input.shopReferral.pct}%)`,
    });
  }
  // Gateway fee (cost).
  if (input.gatewayFee > 0) {
    rows.push({
      type: 'GATEWAY_FEE',
      amount: dec(input.gatewayFee),
      side: -1,
      account: 'platform',
      orderId,
      paymentId: input.paymentId,
      refType: input.sourceType,
      refId: input.sourceId,
      memo: 'gateway fee',
    });
  }

  await db().ledgerEntry.createMany({ data: rows });
}

/** Configurable platform settings with sane defaults (admin-editable rows). */
export async function getMoneyConfig(): Promise<{
  platformFee: number;
  referralReward: number;
  shopCommissionPct: number;
}> {
  const rows = await db().platformConfig.findMany({
    where: { key: { in: ['platform_fee', 'referral_reward', 'shop_commission_pct'] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => {
    const v = map.get(k) as { amount?: number; pct?: number } | undefined;
    const n = v?.amount ?? v?.pct;
    return typeof n === 'number' ? n : d;
  };
  return {
    platformFee: num('platform_fee', 2),
    referralReward: num('referral_reward', 1),
    shopCommissionPct: num('shop_commission_pct', 20),
  };
}

function dec(n: number): Prisma.Decimal {
  // Prisma accepts numbers for Decimal fields; round to 2dp first.
  return Math.round((n + Number.EPSILON) * 100) / 100 as unknown as Prisma.Decimal;
}
