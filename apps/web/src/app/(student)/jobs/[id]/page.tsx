import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PrintJobRow } from '@/lib/db.types';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { duplicateJob } from '../actions';

export const metadata = { title: 'Order' };

async function getJob(id: string, studentId: string): Promise<PrintJobRow | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('print_jobs')
      .select('*')
      .eq('id', id)
      .eq('student_id', studentId)
      .maybeSingle();
    return (data as PrintJobRow) ?? null;
  } catch {
    return null;
  }
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const job = await getJob(id, session!.user.id);
  if (!job) notFound();

  const rows: [string, string][] = [
    ['Pages', `${job.total_pages} (${job.color_pages} color · ${job.bw_pages} B&W)`],
    ['Copies', String(job.copies)],
    ['Paper', job.paper_size],
    ['Orientation', job.orientation],
    ['Binding', job.binding],
    ['Amount', job.price_amount != null ? formatCurrency(Number(job.price_amount)) : '—'],
    ['Created', formatDateTime(job.created_at)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{job.order_number}</h1>
          <p className="text-sm text-muted-foreground">Your pickup code</p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.status === 'ready_for_pickup' && (
        <div className="rounded-lg border border-primary bg-primary-weak p-4">
          <p className="text-sm font-medium text-primary">Ready for pickup</p>
          <p className="mt-1 text-sm text-primary/80">
            Show the code <span className="font-semibold">{job.order_number}</span> at the counter.
          </p>
        </div>
      )}

      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium capitalize">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Draft / configured: edit or pay. */}
      {!job.is_locked && (job.status === 'draft' || job.status === 'configured') && (
        <div className="flex gap-2">
          <Link href={`/jobs/${job.id}/edit`} className="flex-1">
            <Button variant="outline" className="w-full">Edit pages</Button>
          </Link>
          {job.status === 'configured' && (
            <Link href={`/jobs/${job.id}/pay`} className="flex-1">
              <Button className="w-full">Continue to payment</Button>
            </Link>
          )}
        </div>
      )}

      {/* Past orders: reuse as a template. */}
      {(job.status === 'completed' || job.status === 'rejected') && (
        <form action={duplicateJob.bind(null, job.id)}>
          <Button type="submit" variant="outline" className="w-full">Reorder this job</Button>
        </form>
      )}

      {job.is_locked && (
        <p className="text-xs text-muted-foreground">
          This order is paid and locked. It can no longer be edited or cancelled.
        </p>
      )}
    </div>
  );
}
