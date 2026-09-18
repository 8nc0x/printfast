'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { withdrawAction } from './actions';

export function WithdrawForm({ available }: { available: number }) {
  const [amount, setAmount] = useState('');
  const [upi, setUpi] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await withdrawAction({
        amount: Number(formData.get('amount') ?? 0),
        upiVpa: String(formData.get('upi') ?? ''),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="rounded-lg border border-primary bg-primary-weak p-4 text-sm text-primary">
        Withdrawal requested. Payouts are sent to your UPI within 2–3 working days.
      </p>
    );
  }

  if (available <= 0) return null;

  return (
    <form action={submit} className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Withdraw to UPI</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount (max {formatCurrency(available)})</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="100"
            max={available}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="upi">UPI ID</Label>
          <Input id="upi" name="upi" placeholder="name@upi" value={upi} onChange={(e) => setUpi(e.target.value)} required />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Request withdrawal
      </Button>
    </form>
  );
}
