'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DevPayPage() {
  return (
    <Suspense fallback={null}>
      <DevPay />
    </Suspense>
  );
}

function DevPay() {
  const router = useRouter();
  const params = useSearchParams();
  const jobId = params.get('job') ?? '';
  const ref = params.get('ref') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function complete(success: boolean) {
    setError(null);
    start(async () => {
      if (!success) {
        router.push(`/jobs/${jobId}/pay`);
        return;
      }
      const res = await fetch('/api/payments/dev-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        router.push(`/jobs/${jobId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Simulation failed (only available in dev)');
      }
    });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sandbox gateway</p>
        <h1 className="mt-1 text-lg font-semibold">Simulate payment</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reference {ref || '—'}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          This stand-in mimics your gateway so the paid → shop flow works locally.
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex gap-2">
          <Button className="flex-1" onClick={() => complete(true)} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Pay success
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => complete(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
