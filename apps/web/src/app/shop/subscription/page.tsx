import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { resolveShopId } from '@/lib/data/shop-context';
import { getShopSubscription, getShopFeatures, type PlanFeatures } from '@/lib/subscriptions';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export const metadata = { title: 'Subscription' };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'muted' | 'destructive'> = {
  TRIALING: 'info' as never,
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  CANCELLED: 'muted',
  EXPIRED: 'destructive',
};

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  staff: 'Staff accounts',
  printers: 'Printer agents',
  catalogItems: 'Catalog items',
  inventory: 'Inventory tracking',
  advancedDelivery: 'Advanced delivery',
  advancedAnalytics: 'Advanced analytics',
};

export default async function ShopSubscriptionPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const shopId = await resolveShopId();
  if (!shopId) {
    return <p className="text-sm text-muted-foreground">No shop configured.</p>;
  }

  const [sub, features] = await Promise.all([
    getShopSubscription(shopId),
    getShopFeatures(shopId),
  ]);

  // Shop-referral relationship (who referred this owner) is display-only here.
  const invoices = await db().invoice.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const usage = {
    catalogItems: await db().catalogItem.count({ where: { shopId } }),
    printers: await db().agent.count({ where: { shopId } }),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Subscription & billing</h1>
        <p className="text-sm text-muted-foreground">
          Your plan, usage against limits, and invoices.
        </p>
      </div>

      {sub ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{sub.plan.name} plan</CardTitle>
              <Badge variant={STATUS_TONE[sub.status] ?? 'muted'}>{sub.status}</Badge>
            </div>
            <CardDescription>
              {formatCurrency(Number(sub.plan.price))} / {sub.plan.billingCycle} ·{' '}
              {sub.status === 'TRIALING' ? 'Trial ends ' : 'Renews '}
              {formatDateTime(sub.currentPeriodEnd.toISOString())}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['catalogItems', usage.catalogItems, features.catalogItems],
                  ['printers', usage.printers, features.printers],
                  ['staff', 0, features.staff],
                ] as [keyof PlanFeatures, number, number][]
              ).map(([key, used, limit]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{FEATURE_LABELS[key]}</span>
                  <span className={used > limit ? 'font-medium text-destructive' : 'font-medium'}>
                    {used} / {limit}
                  </span>
                </div>
              ))}
              {(
                ['inventory', 'advancedDelivery', 'advancedAnalytics'] as (keyof PlanFeatures)[]
              ).map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{FEATURE_LABELS[key]}</span>
                  {features[key] ? (
                    <Badge variant="success">Included</Badge>
                  ) : (
                    <Badge variant="muted">Upgrade</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No subscription yet.</p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Billing history</CardTitle>
          <CardDescription>Subscription invoices (newest first).</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No invoices yet — your trial is free.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    <span className="font-mono">{inv.number}</span>{' '}
                    <span className="text-muted-foreground">
                      {formatDateTime(inv.createdAt.toISOString())}
                    </span>
                  </span>
                  <span className="font-medium">{formatCurrency(Number(inv.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
