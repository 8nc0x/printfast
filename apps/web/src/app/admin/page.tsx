import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Admin — Overview' };

export default async function AdminHomePage() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [shopCount, userCount, jobsToday, ordersToday, pagesPrinted, failedJobs, pendingShops] =
    await Promise.all([
      db().shop.count({ where: { isActive: true } }),
      db().user.count({ where: { isBanned: false } }),
      db().printJob.count({ where: { status: { in: ['paid', 'shop_received'] }, createdAt: { gte: since } } }),
      db().order.count({ where: { status: { in: ['PAID', 'ACCEPTED', 'PREPARING', 'READY'] }, createdAt: { gte: since } } }),
      db().printJob.aggregate({ where: { status: { in: ['printed', 'ready_for_pickup', 'completed'] } }, _sum: { totalPages: true } }),
      db().auditLog.count({ where: { action: { in: ['settlement_failed', 'shop_rejected'] }, createdAt: { gte: since } } }),
      db().shop.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);

  // Revenue from the immutable ledger (platform account).
  const feeRows = await db().ledgerEntry.findMany({
    where: { account: 'platform', type: 'PLATFORM_FEE' },
    select: { amount: true, side: true },
  });
  const platformRevenue = feeRows.reduce((sum, r) => sum + Number(r.amount) * r.side, 0);

  const cards: [string, string][] = [
    ['Active shops', String(shopCount)],
    ['Active users', String(userCount)],
    ['Print jobs (24h paid)', String(jobsToday)],
    ['Shop orders (24h paid)', String(ordersToday)],
    ['Pages printed (all time)', String(pagesPrinted._sum.totalPages ?? 0)],
    ['Platform revenue', formatCurrency(platformRevenue)],
    ['Pending issues', String(failedJobs)],
    ['Shops awaiting approval', String(pendingShops)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground">Operational and financial snapshot.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
