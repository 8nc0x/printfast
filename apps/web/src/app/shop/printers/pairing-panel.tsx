'use client';

import { useState, useTransition } from 'react';
import { Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPairingAction } from './actions';

export function PairingPanel({ shopId }: { shopId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function generate() {
    setError(null);
    start(async () => {
      const res = await createPairingAction();
      if (res.error) setError(res.error);
      else setCode(res.code ?? null);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Connect a Windows agent</p>
      <p className="text-xs text-muted-foreground">
        Install PrintFlow Shop on the shop PC, choose “Pair with server”, and enter this code
        (valid 15 minutes, single use).
      </p>
      {!code ? (
        <Button size="sm" onClick={generate} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Generate pairing code
        </Button>
      ) : (
        <div className="flex items-center gap-3">
          <code className="rounded-md bg-muted px-3 py-2 font-mono text-sm">{code}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
