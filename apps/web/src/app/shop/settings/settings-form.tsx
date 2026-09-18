'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updateShopProfile } from './actions';

export interface ShopProfile {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  category: string;
  slug: string;
  code: string;
  acceptingOrders: boolean;
}

export function SettingsForm({ shop }: { shop: ShopProfile }) {
  const [form, setForm] = useState(shop);
  const [accepting, setAccepting] = useState(shop.acceptingOrders);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof ShopProfile>(key: K, value: ShopProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    setMessage(null);
    start(async () => {
      const res = await updateShopProfile({ ...form, acceptingOrders: accepting });
      setMessage(
        res.ok
          ? { ok: true, text: 'Profile saved.' }
          : { ok: false, text: res.error ?? 'Save failed' },
      );
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Business profile</CardTitle>
        <CardDescription>
          Shown to customers on your shop page{shop.code ? ` · code ${shop.code}` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Shop name</Label>
            <Input id="s-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-category">Category</Label>
            <Input
              id="s-category"
              placeholder="Stationery / Xerox / Cyber Cafe…"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-address">Address</Label>
            <Input
              id="s-address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-phone">Phone</Label>
            <Input id="s-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-whatsapp">WhatsApp</Label>
            <Input
              id="s-whatsapp"
              type="tel"
              value={form.whatsapp}
              onChange={(e) => set('whatsapp', e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-slug">Shop link</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/s/</span>
              <Input id="s-slug" value={form.slug} onChange={(e) => set('slug', e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Your QR poster and shared links point here.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <Label htmlFor="s-accepting" className="text-sm">
              Accepting orders
            </Label>
            <p className="text-xs text-muted-foreground">
              Turn off to pause new orders without hiding your page.
            </p>
          </div>
          <Switch id="s-accepting" checked={accepting} onCheckedChange={setAccepting} />
        </div>

        {message && (
          <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-destructive'}`}>
            {message.text}
          </p>
        )}

        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}
