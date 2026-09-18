import 'server-only';
import { db } from '@/lib/db';
import type { Prisma } from '@printflow/db';

/**
 * Subscription service. Plans are DB rows the admin edits — no hardcoded ₹99.
 * Feature gates are checked server-side via requireFeature().
 */

export interface PlanFeatures {
  staff: number; // max staff members (excluding owner)
  printers: number; // max registered printers/agents
  catalogItems: number;
  inventory: boolean;
  advancedDelivery: boolean;
  advancedAnalytics: boolean;
}

const DEFAULT_FEATURES: PlanFeatures = {
  staff: 0,
  printers: 1,
  catalogItems: 25,
  inventory: false,
  advancedDelivery: false,
  advancedAnalytics: false,
};

export async function getShopSubscription(shopId: string) {
  let sub = await db().subscription.findUnique({
    where: { shopId },
    include: { plan: true },
  });
  if (!sub) {
    // Default every shop to the cheapest active plan on trial.
    const plan = await db().subscriptionPlan.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!plan) return null;
    sub = await db().subscription.create({
      data: {
        shopId,
        planId: plan.id,
        status: 'TRIALING',
        currentPeriodEnd: new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000),
      },
      include: { plan: true },
    });
  }
  return sub;
}

/** Resolve effective features for a shop (plan features + fallbacks). */
export async function getShopFeatures(shopId: string): Promise<PlanFeatures> {
  const sub = await getShopSubscription(shopId);
  if (!sub) return DEFAULT_FEATURES;

  const features = (sub.plan.features ?? {}) as Partial<PlanFeatures>;
  return { ...DEFAULT_FEATURES, ...features };
}

/**
 * Feature gate. Throws when the shop's subscription doesn't allow the action —
 * called from server actions before any privileged operation.
 */
export async function requireFeature(shopId: string, feature: keyof PlanFeatures): Promise<PlanFeatures> {
  const sub = await getShopSubscription(shopId);
  const features = await getShopFeatures(shopId);

  if (sub && (sub.status === 'EXPIRED' || sub.status === 'CANCELLED')) {
    throw new Error('Subscription inactive. Renew to continue.');
  }
  if (sub?.status === 'PAST_DUE') {
    // Grace: allow core operations but not new feature usage.
    if (feature === 'inventory' || feature === 'advancedAnalytics' || feature === 'advancedDelivery') {
      throw new Error('Payment past due. Clear your subscription to use this feature.');
    }
  }
  if (feature === 'staff' || feature === 'printers' || feature === 'catalogItems') {
    return features; // numeric limits — caller compares counts
  }
  if (!features[feature]) {
    throw new Error('This feature requires a plan upgrade.');
  }
  return features;
}

/** Called by the daily cron: roll trial/period endings, flag dunning. */
export async function runSubscriptionCron(): Promise<{ trialingExpired: number; pastDue: number; expired: number }> {
  const now = new Date();
  let trialingExpired = 0;
  let pastDue = 0;
  let expired = 0;

  // Trials that ended → ACTIVE-with-invoice is skipped in v1 (manual payment);
  // mark PAST_DUE so owners get dunned, unless cancelled.
  const trialOver = await db().subscription.updateMany({
    where: { status: 'TRIALING', currentPeriodEnd: { lt: now } },
    data: { status: 'PAST_DUE' },
  });
  trialingExpired = trialOver.count;

  // PAST_DUE beyond 14 days → EXPIRED (shop loses gates).
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const overdue = await db().subscription.updateMany({
    where: { status: 'PAST_DUE', currentPeriodEnd: { lt: cutoff }, cancelAtPeriodEnd: false },
    data: { status: 'EXPIRED' },
  });
  expired = overdue.count;

  // Cancel-at-period-end subscriptions flip to CANCELLED.
  const cancelled = await db().subscription.updateMany({
    where: { status: 'ACTIVE', cancelAtPeriodEnd: true, currentPeriodEnd: { lt: now } },
    data: { status: 'CANCELLED' },
  });
  pastDue = cancelled.count;

  return { trialingExpired, pastDue, expired };
}

/** Activate (or renew) a subscription after a successful plan payment. */
export async function activateSubscription(shopId: string, planId: string): Promise<Prisma.SubscriptionGetPayload<{ include: { plan: true } }>> {
  const plan = await db().subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('Plan not found');

  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // monthly
  return db().subscription.upsert({
    where: { shopId },
    create: {
      shopId,
      planId,
      status: 'ACTIVE',
      currentPeriodEnd: periodEnd,
    },
    update: {
      planId,
      status: 'ACTIVE',
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
    include: { plan: true },
  });
}
