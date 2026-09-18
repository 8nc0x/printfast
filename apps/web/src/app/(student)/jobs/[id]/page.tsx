import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import type { PrintJobRow } from '@/lib/db.types';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { duplicateJob } from '../actions';

export const metadata = { title: 'Order' };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const job = await db().printJob.findFirst({
    where: { id, studentId: session!.user.id },
  });
  if (!job) notFound();

  const row = {
    ...job,
    price_amount: job.priceAmount != null ? Number(job.priceAmount) : null,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
  } as unknown as PrintJobRow;

  const rows: [string, string][] = [
    ['Pages', `${row.total_pages} (${row.color_pages} color · ${row.bw_pages} B&W)`],
    ['Copies', String(row.copies)],
    ['Paper', row.paper_size],
    ['Orientation', row.orientation],
    ['Binding', row.binding],
    ['Created', formatDateTime(row.created_at)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{row.order_number}</h1>
          <p className="text-sm text-muted-foreground">Order details</p>
        </div>
        <StatusBadge status={row.status} />
      </div>

      {row.status === 'ready_for_pickup' && (
        <div className="rounded-xl border border-primary bg-primary-weak p-4 text-center">
          <p className="text-sm font-medium text-primary">Ready for pickup</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-primary">
            {row.order_number}
          </p>
          <p className="mt-1 text-sm text-primary/80">Show this code at the counter.</p>
        </div>
      )}

      {row.price_amount != null && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total paid / due</p>
              <p className="text-lg font-semibold">{formatCurrency(row.price_amount)}</p>
            </div>
            {row.is_locked && (
              <p className="max-w-[180px] text-right text-xs text-muted-foreground">
                Paid &amp; locked — no further edits.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Print configuration</CardTitle>
          <CardDescription>Settings sent to the shop with this order.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <dl className="divide-y divide-border">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-6 py-2.5 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium capitalize">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Draft / configured: edit or pay. */}
      {!row.is_locked && (row.status === 'draft' || row.status === 'configured') && (
        <div className="flex gap-2">
          <Link href={`/jobs/${row.id}/edit`} className="flex-1">
            <Button variant="outline" className="w-full">Edit pages</Button>
          </Link>
          {row.status === 'configured' && (
            <Link href={`/jobs/${row.id}/pay`} className="flex-1">
              <Button className="w-full">Continue to payment</Button>
            </Link>
          )}
        </div>
      )}

      {/* Past orders: reuse as a template. */}
      {(row.status === 'completed' || row.status === 'rejected') && (
        <form action={duplicateJob.bind(null, row.id)}>
          <Button type="submit" variant="outline" className="w-full">
            Reorder this job
          </Button>
        </form>
      )}

      <Separator className="opacity-0" />
    </div>
  );
}
