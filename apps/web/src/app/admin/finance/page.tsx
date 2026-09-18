import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { Landmark } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export const metadata = { title: 'Admin — Finance' };

const PAGE_SIZE = 100;

const TYPE_TONE: Record<string, 'success' | 'info' | 'warning' | 'muted' | 'destructive'> = {
  ORDER_PAYMENT: 'success',
  SUBSCRIPTION_PAYMENT: 'success',
  PLATFORM_FEE: 'info',
  SHOP_EARNING: 'info',
  REFERRAL_REWARD: 'warning',
  REFERRAL_COMMISSION: 'warning',
  GATEWAY_FEE: 'muted',
  WALLET_CREDIT: 'muted',
  WALLET_DEBIT: 'muted',
  REFUND: 'destructive',
  PAYOUT: 'destructive',
};

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; page?: string }>;
}) {
  const { account, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));

  const where = account ? { account } : {};

  const [entries, total, payouts, accountsAgg] = await Promise.all([
    db().ledgerEntry.findMany({
      where,
      orderBy: { seq: 'desc' },
      take: PAGE_SIZE,
      skip: (pageNum - 1) * PAGE_SIZE,
    }),
    db().ledgerEntry.count({ where }),
    db().payout.findMany({
      where: { status: { in: ['REQUESTED', 'APPROVED'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db().ledgerEntry.groupBy({
      by: ['account'],
      _sum: { amount: true },
      orderBy: { account: 'asc' },
    }),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">
          Immutable ledger — every money movement, in order ({total} entries).
        </p>
      </div>

      {/* Account balances (sum of signed amounts) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {accountsAgg.slice(0, 8).map((a) => (
          <Card key={a.account}>
            <CardContent className="p-4">
              <p className="truncate text-xs text-muted-foreground">{a.account}</p>
              <p className="mt-1 text-lg font-semibold">
                {formatCurrency(Number(a._sum.amount ?? 0))}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payout queue */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Withdrawal requests</CardTitle>
          <CardDescription>Pending and approved payouts awaiting transfer.</CardDescription>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No pending payouts.</p>
          ) : (
            <ul className="divide-y divide-border">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    <span className="font-mono text-xs">{p.userId.slice(0, 8)}</span>{' '}
                    <Badge variant={p.status === 'REQUESTED' ? 'warning' : 'info'}>
                      {p.status}
                    </Badge>
                  </span>
                  <span className="font-medium">{formatCurrency(Number(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Ledger entries</CardTitle>
          <CardDescription>
            Insert-only. Filtering by account: {account ?? 'all accounts'}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No ledger entries"
              className="border-0"
              description="Entries appear when orders and subscriptions settle."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.seq.toString()}</TableCell>
                    <TableCell>
                      <Badge variant={TYPE_TONE[e.type] ?? 'muted'}>{e.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate font-mono text-xs">
                      {e.account}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        e.side > 0 ? 'text-emerald-700' : 'text-destructive'
                      }`}
                    >
                      {e.side > 0 ? '+' : '−'}
                      {formatCurrency(Number(e.amount))}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {e.memo ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(e.createdAt.toISOString())}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <p className="text-center text-xs text-muted-foreground">
          Page {pageNum} of {pages}
        </p>
      )}
    </div>
  );
}
