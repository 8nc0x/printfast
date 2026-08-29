'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import type { PriceBreakdown } from '@printflow/shared';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { startPayment } from './actions';

export function PayPanel({
  jobId,
  breakdown,
  orderNumber,
}: {
  jobId: string;
  breakdown: PriceBreakdown;
  orderNumber: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pay() {
    setError(null);
    start(async () => {
      const res = await startPayment(jobId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.redirectUrl) {
        router.push(res.redirectUrl);
      } else {
        setError('Payment could not be started. Try again.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">Order</p>
          <p className="font-medium">{orderNumber}</p>
        </div>
        <dl className="divide-y divide-border">
          {breakdown.lines
            .filter((l) => l.amount > 0 || l.label.startsWith('×'))
            .map((line, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">{line.label}</dt>
                <dd className="font-medium">{line.amount > 0 ? formatCurrency(line.amount, breakdown.currency) : ''}</dd>
              </div>
            ))}
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="font-semibold">Total</dt>
            <dd className="text-lg font-semibold">{formatCurrency(breakdown.total, breakdown.currency)}</dd>
          </div>
        </dl>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        Once paid, your order is locked and sent to the shop. It can&rsquo;t be edited or cancelled.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" size="lg" onClick={pay} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Pay {formatCurrency(breakdown.total, breakdown.currency)}
      </Button>
    </div>
  );
}
