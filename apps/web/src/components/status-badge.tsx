import type { JobStatus } from '@printflow/shared';
import { cn } from '@/lib/utils';

const LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  configured: 'Ready to pay',
  payment_pending: 'Payment pending',
  paid: 'Paid',
  shop_received: 'At shop',
  approved: 'Approved',
  printing: 'Printing',
  printed: 'Printed',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Completed',
  rejected: 'Rejected',
};

// Functional colors only; a text label always accompanies the dot (a11y).
const TONE: Record<JobStatus, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  configured: 'bg-secondary text-secondary-foreground',
  payment_pending: 'bg-secondary text-muted-foreground',
  paid: 'bg-primary-weak text-primary',
  shop_received: 'bg-primary-weak text-primary',
  approved: 'bg-primary-weak text-primary',
  printing: 'bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]',
  printed: 'bg-primary-weak text-primary',
  ready_for_pickup: 'bg-primary text-primary-foreground',
  completed: 'bg-secondary text-muted-foreground',
  rejected: 'bg-destructive/10 text-destructive',
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
