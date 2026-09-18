'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  to: string;
  note: string | null;
  createdAt: string;
}

const LABELS: Record<string, string> = {
  CREATED: 'Order created',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_PROCESSING: 'Payment processing',
  PAID: 'Payment verified',
  ACCEPTED: 'Accepted by shop',
  PREPARING: 'Being prepared',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  READY_FOR_PICKUP: 'Ready for pickup',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
};

function label(e: TimelineEvent): string {
  if (e.note && !e.note.startsWith('Payment verified') && e.to !== 'AWAITING_PAYMENT') {
    return LABELS[e.to] ?? e.to;
  }
  return LABELS[e.to] ?? e.to;
}

export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No updates yet.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((e, i) => {
        const isLast = i === 0; // newest first
        const done = true; // every recorded event has happened
        return (
          <li key={i} className="relative">
            <span
              className={cn(
                'absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full',
                done ? 'bg-primary-weak text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </span>
            <p className={cn('text-sm', isLast ? 'font-medium' : 'text-foreground')}>
              {label(e)}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(e.createdAt).toLocaleString()}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
