'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updatePlanAction } from './actions';

interface PlanRow {
  id: string;
  name: string;
  price: number;
  trialDays: number;
  features: Record<string, unknown>;
  isActive: boolean;
  subscribers: number;
}

const FEATURE_KEYS: { key: string; label: string; numeric?: boolean }[] = [
  { key: 'staff', label: 'Max staff', numeric: true },
  { key: 'printers', label: 'Max printers', numeric: true },
  { key: 'catalogItems', label: 'Max catalog items', numeric: true },
  { key: 'inventory', label: 'Inventory' },
  { key: 'advancedDelivery', label: 'Advanced delivery' },
  { key: 'advancedAnalytics', label: 'Advanced analytics' },
];

export function PlanEditor({ plans }: { plans: PlanRow[] }) {
  return (
    <div className="space-y-4">
      {plans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No plans defined yet. Run the seed to create defaults.
        </p>
      ) : (
        plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanRow }) {
  const [price, setPrice] = useState(String(plan.price));
  const [trialDays, setTrialDays] = useState(String(plan.trialDays));
  const [features, setFeatures] = useState<Record<string, unknown>>(plan.features);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updatePlanAction(plan.id, {
        price: Number(price),
        trialDays: Number(trialDays),
        features,
      });
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{plan.name}</p>
          <p className="text-xs text-muted-foreground">{plan.subscribers} shops subscribed</p>
        </div>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved' : 'Save'}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Price (₹/month)</Label>
          <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Trial days</Label>
          <Input type="number" min="0" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {FEATURE_KEYS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm">
            <input
              type={f.numeric ? 'number' : 'checkbox'}
              min={f.numeric ? 0 : undefined}
              checked={f.numeric ? undefined : Boolean(features[f.key])}
              value={f.numeric ? String(features[f.key] ?? 0) : undefined}
              onChange={(e) =>
                setFeatures((prev) => ({
                  ...prev,
                  [f.key]: f.numeric ? Number(e.target.value) : e.target.checked,
                }))
              }
              className="h-4 w-4"
            />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}
