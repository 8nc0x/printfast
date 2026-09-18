'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateConfigAction } from './actions';

interface Entry {
  key: string;
  label: string;
  hint: string;
  field: 'amount' | 'pct';
  value: number;
}

export function ConfigEditor({ entries }: { entries: Entry[] }) {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(entries.map((e) => [e.key, e.value])),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      for (const e of entries) {
        const res = await updateConfigAction(e.key, e.field, values[e.key] ?? 0);
        if (res.error) {
          setError(`${e.label}: ${res.error}`);
          return;
        }
      }
      setSaved(true);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.key} className="grid gap-1.5 sm:grid-cols-[1fr_140px] sm:items-center">
            <div>
              <Label htmlFor={e.key}>{e.label}</Label>
              <p className="text-xs text-muted-foreground">{e.hint}</p>
            </div>
            <Input
              id={e.key}
              type="number"
              min="0"
              step={e.field === 'pct' ? '1' : '0.5'}
              value={values[e.key] ?? 0}
              onChange={(ev) => setValues((prev) => ({ ...prev, [e.key]: Number(ev.target.value) }))}
            />
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved' : 'Save config'}
        </Button>
        {saved && <span className="text-sm text-primary">Applied immediately.</span>}
      </div>
    </div>
  );
}
