import { TrendingUp } from 'lucide-react';
import { ORDER_STATUSES, type OrderStatus } from '@printflow/shared';
import { db } from '@/lib/db';
import { resolveShopId } from '@/lib/data/shop-context';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';

export const metadata = { title: 'Analytics' };

const PAID_STATUSES: OrderStatus[] = [
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'READY_FOR_PICKUP',
  'COMPLETED',
];
void ORDER_STATUSES;

export default async function ShopAnalyticsPage() {
  const shopId = await resolveShopId();
  if (!shopId) return <p className="text-sm text-muted-foreground">No shop configured.</p>;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [ordersToday, paidOrders] = await Promise.all([
    db().order.findMany({
      where: { shopId, createdAt: { gte: startOfToday }, status: { in: PAID_STATUSES } },
      select: { total: true },
    }),
    db().order.findMany({
      where: { shopId, status: { in: PAID_STATUSES } },
      select: { total: true, createdAt: true, items: { select: { nameSnapshot: true, lineTotal: true, kind: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);

  const revenueToday = ordersToday.reduce((s, o) => s + Number(o.total), 0);
  const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total), 0);

  // Popular items (top 5 by revenue).
  const byItem = new Map<string, { revenue: number; qty: number }>();
  for (const o of paidOrders) {
    for (const i of o.items) {
      const cur = byItem.get(i.nameSnapshot) ?? { revenue: 0, qty: 0 };
      cur.revenue += Number(i.lineTotal);
      cur.qty += 1;
      byItem.set(i.nameSnapshot, cur);
    }
  }
  const popular = [...byItem.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  const maxItemRevenue = Math.max(1, ...popular.map(([, s]) => s.revenue));

  // Peak hours (orders by hour of day).
  const byHour: number[] = new Array(24).fill(0);
  for (const o of paidOrders) {
    const h = o.createdAt.getHours();
    byHour[h] = (byHour[h] ?? 0) + 1;
  }
  const maxHour = Math.max(1, ...byHour);

  const kindTotals: Record<string, number> = { PRODUCT: 0, SERVICE: 0 };
  for (const o of paidOrders) {
    for (const i of o.items) {
      kindTotals[i.kind] = (kindTotals[i.kind] ?? 0) + Number(i.lineTotal);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Understand what sells and when.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Orders today', String(ordersToday.length)],
          ['Revenue today', formatCurrency(revenueToday)],
          ['Avg order (today)', formatCurrency(ordersToday.length ? revenueToday / ordersToday.length : 0)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Popular items (by revenue)</CardTitle>
          <CardDescription>Top 5 across the last 500 paid orders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {popular.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            popular.map(([name, stat]) => (
              <div key={name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(stat.revenue)} · {stat.qty} sold
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (stat.revenue / maxItemRevenue) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Peak hours</CardTitle>
          <CardDescription>Order volume by hour of day.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {byHour.map((count, hour) => (
              <div
                key={hour}
                className="flex flex-1 flex-col items-center justify-end gap-1"
                title={`${hour}:00 — ${count} orders`}
              >
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${(count / maxHour) * 80}px`, minHeight: count > 0 ? 4 : 0 }}
                />
                {hour % 4 === 0 && <span className="text-[9px] text-muted-foreground">{hour}</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Product revenue</p>
            <p className="mt-1 text-xl font-semibold">{formatCurrency(kindTotals.PRODUCT ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Service revenue</p>
            <p className="mt-1 text-xl font-semibold">{formatCurrency(kindTotals.SERVICE ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {totalRevenue === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No revenue yet"
          description="Share your shop QR to start collecting paid orders — analytics fill in automatically."
        />
      )}
    </div>
  );
}
