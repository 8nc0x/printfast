'use client';

import { useState, useTransition } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { JobStatus } from '@printflow/shared';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { shopTransition, shopFinalPdfUrl } from '@/app/shop/orders/actions';

export interface OrderCardData {
  id: string;
  orderNumber: string;
  status: JobStatus;
  studentName: string;
  totalPages: number;
  colorPages: number;
  copies: number;
  binding: string;
  paperSize: string;
  amount: number | null;
  currency: string;
  paymentReference: string | null;
  createdAt: string;
}

// Next action(s) available per status.
const NEXT: Partial<Record<JobStatus, { to: JobStatus; label: string; variant?: 'default' | 'outline' | 'destructive' }[]>> = {
  shop_received: [
    { to: 'approved', label: 'Approve' },
    { to: 'rejected', label: 'Reject', variant: 'destructive' },
  ],
  approved: [{ to: 'printing', label: 'Start printing' }],
  printing: [{ to: 'printed', label: 'Mark printed' }],
  printed: [{ to: 'ready_for_pickup', label: 'Ready for pickup' }],
  ready_for_pickup: [{ to: 'completed', label: 'Complete' }],
};

export function OrderCard({ job }: { job: OrderCardData }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const actions = NEXT[job.status] ?? [];

  function act(to: JobStatus) {
    setError(null);
    start(async () => {
      const res = await shopTransition(job.id, to);
      if (!res.ok) setError(res.error ?? 'Failed');
    });
  }

  function preview() {
    setError(null);
    start(async () => {
      const res = await shopFinalPdfUrl(job.id);
      if (res.url) window.open(res.url, '_blank', 'noopener');
      else setError(res.error ?? 'PDF not available');
    });
  }

  return (
    <article className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{job.orderNumber}</span>
        <StatusBadge status={job.status} />
      </div>
      <p className="mt-1 truncate text-sm text-muted-foreground">{job.studentName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {job.totalPages}p ({job.colorPages} color) · {job.copies}× · {job.paperSize} · {job.binding}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {job.amount != null ? formatCurrency(job.amount, job.currency) : '—'}
        {job.paymentReference ? ` · ${job.paymentReference}` : ''}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(job.createdAt)}</p>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={preview} disabled={pending}>
          <FileText className="h-4 w-4" /> Preview
        </Button>
        {actions.map((a) => (
          <Button
            key={a.to}
            size="sm"
            variant={a.variant ?? 'default'}
            onClick={() => act(a.to)}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {a.label}
          </Button>
        ))}
      </div>
    </article>
  );
}
