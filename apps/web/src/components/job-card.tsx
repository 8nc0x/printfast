import Link from 'next/link';
import { FileText, ChevronRight } from 'lucide-react';
import type { PrintJobRow } from '@/lib/db.types';
import { StatusBadge } from '@/components/status-badge';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export function JobCard({ job }: { job: PrintJobRow }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <FileText className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{job.order_number}</span>
          <StatusBadge status={job.status} />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {job.total_pages} page{job.total_pages === 1 ? '' : 's'} · {job.copies} cop
          {job.copies === 1 ? 'y' : 'ies'} · {job.paper_size}
          {job.price_amount != null ? ` · ${formatCurrency(Number(job.price_amount))}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(job.created_at)}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
