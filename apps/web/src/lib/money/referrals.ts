import 'server-only';
import { db } from '@/lib/db';
import { creditWallet, ensureWallet } from './wallets';
import { getMoneyConfig } from './ledger';

/**
 * Referral system.
 *  - Customer → customer: referrer earns `referral_reward` (₹1) per eligible
 *    transaction of the referred user, credited to their REFERRAL wallet.
 *  - Shop → shop: referrer earns `shop_commission_pct` of a referred shop's
 *    subscription payment.
 *  - One referrer per user, forever (ReferralEvent.referredId is unique).
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

/** Mint a unique referral code for a user (idempotent). */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await db().user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (user?.referralCode) return user.referralCode;

  for (let i = 0; i < 10; i++) {
    let code = '';
    for (let c = 0; c < 6; c++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    try {
      const updated = await db().user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch {
      /* code collision — retry */
    }
  }
  throw new Error('Could not allocate referral code');
}

/** Attach a referrer at signup. Idempotent; first writer wins. */
export async function attachReferrer(newUserId: string, referralCode: string): Promise<boolean> {
  const referrer = await db().user.findUnique({
    where: { referralCode: referralCode.trim().toUpperCase() },
    select: { id: true },
  });
  if (!referrer || referrer.id === newUserId) return false;

  const existing = await db().referralEvent.findUnique({
    where: { referredId: newUserId },
    select: { id: true },
  });
  if (existing) return false; // already has a referrer — forever

  await db().user.update({
    where: { id: newUserId },
    data: { referredById: referrer.id },
  });
  await db().referralEvent.create({
    data: {
      referrerId: referrer.id,
      referredId: newUserId,
      kind: 'customer',
      amount: 0, // recorded at credit time
    },
  });
  return true;
}

/**
 * Credit the customer-referral reward for an eligible transaction.
 * Called from settlement (payment success) — snapshot amounts from config AT
 * THIS MOMENT and write immutable ledger + wallet rows.
 */
export async function creditCustomerReferral(params: {
  customerId: string;
  sourceType: 'print' | 'order';
  sourceId: string;
  paymentId: string;
}): Promise<{ credited: boolean; referrerId?: string; amount?: number }> {
  const referral = await db().referralEvent.findUnique({
    where: { referredId: params.customerId },
    select: { id: true, referrerId: true, kind: true, creditedAt: true },
  });
  if (!referral || referral.kind !== 'customer') return { credited: false };

  // Once-per-referred-user reward on their FIRST eligible transaction.
  if (referral.creditedAt) return { credited: false };

  const config = await getMoneyConfig();
  if (config.referralReward <= 0) return { credited: false };

  await ensureWallet(referral.referrerId, 'REFERRAL');
  await creditWallet(
    referral.referrerId,
    'REFERRAL',
    config.referralReward,
    'referral_reward',
    params.paymentId,
  );

  await db().referralEvent.update({
    where: { id: referral.id },
    data: {
      amount: config.referralReward,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      creditedAt: new Date(),
    },
  });

  return { credited: true, referrerId: referral.referrerId, amount: config.referralReward };
}

/**
 * Credit the shop-referral commission for a subscription payment.
 * Runs on every subscription settlement (recurring), per admin config.
 */
export async function creditShopReferral(params: {
  shopOwnerId: string;
  subscriptionAmount: number;
  sourceId: string;
  paymentId: string;
}): Promise<{ credited: boolean; referrerId?: string; amount?: number }> {
  // Find the owner's referrer (shop kind).
  const referral = await db().referralEvent.findFirst({
    where: { referredId: params.shopOwnerId, kind: 'shop' },
    select: { id: true, referrerId: true },
  });
  if (!referral) return { credited: false };

  const config = await getMoneyConfig();
  const amount = round2((config.shopCommissionPct / 100) * params.subscriptionAmount);
  if (amount <= 0) return { credited: false };

  await ensureWallet(referral.referrerId, 'REFERRAL');
  await creditWallet(referral.referrerId, 'REFERRAL', amount, 'shop_commission', params.paymentId);

  await db().referralEvent.update({
    where: { id: referral.id },
    data: {
      amount,
      pct: config.shopCommissionPct,
      sourceType: 'subscription',
      sourceId: params.sourceId,
      creditedAt: new Date(),
    },
  });

  return { credited: true, referrerId: referral.referrerId, amount };
}

/** Referral dashboard data for a user. */
export async function getReferralStats(userId: string) {
  const [code, referredCount, events, walletBalance] = await Promise.all([
    ensureReferralCode(userId),
    db().referralEvent.count({ where: { referrerId: userId } }),
    db().referralEvent.findMany({
      where: { referrerId: userId, creditedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { amount: true, kind: true, sourceType: true, createdAt: true },
    }),
    (async () => {
      const { getWalletBalance } = await import('./wallets');
      return getWalletBalance(userId, 'REFERRAL');
    })(),
  ]);

  const lifetime = events.reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    code,
    referredCount,
    lifetimeEarnings: lifetime,
    walletBalance,
    recent: events.map((e) => ({
      amount: Number(e.amount),
      kind: e.kind,
      sourceType: e.sourceType,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
