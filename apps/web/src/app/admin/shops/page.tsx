import { db } from '@/lib/db';
import { Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ShopActions } from './shop-actions';

export const metadata = { title: 'Admin — Shops' };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'muted' | 'destructive'> = {
  ACTIVE: 'success',
  PENDING_APPROVAL: 'warning',
  SUSPENDED: 'destructive',
  REJECTED: 'destructive',
};

export default async function AdminShopsPage() {
  const shops = await db().shop.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      owner: { select: { name: true, email: true } },
      subscription: { include: { plan: true } },
      _count: { select: { orders: true, printJobs: true, printers: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Shops</h1>
        <p className="text-sm text-muted-foreground">Approve, suspend, and monitor shops.</p>
      </div>

      {shops.length === 0 ? (
        <EmptyState icon={Store} title="No shops yet" description="New shop signups will appear here for approval." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-center">Print jobs</TableHead>
                  <TableHead className="text-center">Printers</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shops.map((shop) => (
                  <TableRow key={shop.id}>
                    <TableCell className="font-medium">{shop.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {shop.owner?.email ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">{shop._count.orders}</TableCell>
                    <TableCell className="text-center">{shop._count.printJobs}</TableCell>
                    <TableCell className="text-center">{shop._count.printers}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {shop.subscription
                        ? `${shop.subscription.plan.name} · ${shop.subscription.status}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[shop.status] ?? 'muted'}>
                        {shop.status.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ShopActions shopId={shop.id} status={shop.status} isActive={shop.isActive} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
