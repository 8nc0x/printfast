'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updateDeliveryConfig } from './actions';

export interface DeliveryConfig {
  enabled: boolean;
  fee: number;
  minOrder: number;
  freeAbove: number | null;
  radiusKm: number;
  prepMinutes: number;
  deliveryMinutes: number;
}

export function DeliveryForm({ delivery }: { delivery: DeliveryConfig }) {
  const [form, setForm] = useState(delivery);
  const [freeAbove, setFreeAbove] = useState(delivery.freeAbove != null ? String(delivery.freeAbove) : '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function num(v: string, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function save() {
    setMessage(null);
    start(async () => {
      const res = await updateDeliveryConfig({
        enabled: form.enabled,
        fee: num(String(form.fee)),
        minOrder: num(String(form.minOrder)),
        freeAbove: freeAbove.trim() === '' ? null : num(freeAbove),
        radiusKm: num(String(form.radiusKm), 3),
        prepMinutes: num(String(form.prepMinutes), 15),
        deliveryMinutes: num(String(form.deliveryMinutes), 45),
      });
      setMessage(
        res.ok
          ? { ok: true, text: 'Delivery settings saved.' }
          : { ok: false, text: res.error ?? 'Save failed' },
      );
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Delivery</CardTitle>
        <CardDescription>
          You control whether you deliver, and every delivery rule. Pickup is always available.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <Label htmlFor="d-enabled" className="text-sm">
              Offer delivery
            </Label>
            <p className="text-xs text-muted-foreground">
              Customers see the delivery option at checkout only when this is on.
            </p>
          </div>
          <Switch
            id="d-enabled"
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
        </div>

        <div className={form.enabled ? 'grid gap-4 sm:grid-cols-2' : 'pointer-events-none grid gap-4 opacity-50 sm:grid-cols-2'}>
          <div className="space-y-1.5">
            <Label htmlFor="d-fee">Delivery fee (₹)</Label>
            <Input
              id="d-fee"
              type="number"
              min={0}
              value={form.fee}
              onChange={(e) => setForm((f) => ({ ...f, fee: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-min">Minimum order for delivery (₹)</Label>
            <Input
              id="d-min"
              type="number"
              min={0}
              value={form.minOrder}
              onChange={(e) => setForm((f) => ({ ...f, minOrder: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-free">Free delivery above (₹, blank = never)</Label>
            <Input id="d-free" type="number" min={0} value={freeAbove} onChange={(e) => setFreeAbove(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-radius">Delivery radius (km)</Label>
            <Input
              id="d-radius"
              type="number"
              min={0}
              step={0.5}
              value={form.radiusKm}
              onChange={(e) => setForm((f) => ({ ...f, radiusKm: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-prep">Preparation time (minutes)</Label>
            <Input
              id="d-prep"
              type="number"
              min={0}
              value={form.prepMinutes}
              onChange={(e) => setForm((f) => ({ ...f, prepMinutes: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-time">Delivery time (minutes)</Label>
            <Input
              id="d-time"
              type="number"
              min={0}
              value={form.deliveryMinutes}
              onChange={(e) => setForm((f) => ({ ...f, deliveryMinutes: Number(e.target.value) }))}
            />
          </div>
        </div>

        {message && (
          <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-destructive'}`}>
            {message.text}
          </p>
        )}

        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save delivery settings
        </Button>
      </CardContent>
    </Card>
  );
}
