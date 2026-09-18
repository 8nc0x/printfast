import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getWalletBalance } from '@/lib/money/wallets';
import { getMoneyConfig } from '@/lib/money/ledger';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { Store, Users } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export const metadata = { title: 'Shop referrals' };

export default async function ShopReferralsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const [referrals, walletBalance, config] = await Promise.all([
    db().referralEvent.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        referred: {
          select: {
            name: true,
            email: true,
            ownedShops: { select: { name: true, subscription: { include: { plan: true } } } },
          },
        },
      },
    }),
    getWalletBalance(userId, 'REFERRAL'),
    getMoneyConfig(),
  ]);

  const shopReferrals = referrals.filter((r) => r.kind === 'shop');
  const customerReferrals = referrals.filter((r) => r.kind === 'customer');

  const activeSubscriptions = shopReferrals.filter(
    (r) => r.referred.ownedShops[0]?.subscription?.status === 'ACTIVE',
  ).length;

  const lifetime = referrals
    .filter((r) => r.creditedAt != null)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const monthlyCommission = shopReferrals
    .filter((r) => r.referred.ownedShops[0]?.subscription?.status === 'ACTIVE')
    .reduce(
      (sum, r) =>
        sum +
        (r.referred.ownedShops[0]?.subscription
          ? (config.shopCommissionPct / 100) *
            Number(r.referred.ownedShops[0].subscription.plan.price)
          : 0),
      0,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">
          Earn {config.shopCommissionPct}% of every subscription from shops you refer, and ₹
          {config.referralReward} when a referred customer&apos;s first order is paid.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Available balance</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(walletBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Monthly commission (active shops)</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(monthlyCommission)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Lifetime earned</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(lifetime)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Referred shops ({shopReferrals.length})</CardTitle>
          <CardDescription>
            {activeSubscriptions} with an active subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {shopReferrals.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No shop referrals yet"
              description={`Share your referral link — when a shop owner signs up and subscribes, you earn ${config.shopCommissionPct}% of their plan every month.`}
              className="border-0 py-8"
            />
          ) : (
            shopReferrals.map((r) => {
              const shop = r.referred.ownedShops[0];
              const sub = shop?.subscription;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{shop?.name ?? r.referred.name}</p>
                    <p className="text-xs text-muted-foreground">{r.referred.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sub ? (
                      <Badge variant={sub.status === 'ACTIVE' ? 'success' : 'muted'}>
                        {sub.plan.name} · {sub.status}
                      </Badge>
                    ) : (
                      <Badge variant="muted">No plan</Badge>
                    )}
                    {r.creditedAt && (
                      <span className="text-sm font-medium text-emerald-700">
                        +{formatCurrency(Number(r.amount))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Referred customers ({customerReferrals.length})</CardTitle>
          <CardDescription>Customer rewards land after their first paid order.</CardDescription>
        </CardHeader>
        <CardContent>
          {customerReferrals.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No customer referrals yet"
              description="Your referral code is on the student wallet page — share it with classmates."
              className="border-0 py-6"
            />
          ) : (
            <ul className="divide-y divide-border">
              {customerReferrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    {r.referred.name ?? r.referred.email}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.creditedAt
                        ? `credited ${formatDateTime(r.creditedAt.toISOString())}`
                        : 'awaiting first order'}
                    </span>
                  </span>
                  {r.creditedAt && (
                    <span className="font-medium text-emerald-700">
                      +{formatCurrency(Number(r.amount))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
