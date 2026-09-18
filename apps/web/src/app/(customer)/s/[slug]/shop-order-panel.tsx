'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Loader2, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import type { OptionGroup } from '@printflow/shared';
import { optionsSurcharge } from '@printflow/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { checkoutAction, quoteAction } from './actions';

export interface ShopItem {
  id: string;
  kind: 'PRINT' | 'PRODUCT' | 'SERVICE';
  name: string;
  price: number;
  unit: string;
  minQty: number;
  maxQty: number | null;
  options: OptionGroup[] | null;
}

interface CartLine extends ShopItem {
  qty: number;
  selections: Record<string, string>; // groupId → valueId
}

function defaultSelections(groups: OptionGroup[] | null): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const g of groups ?? []) {
    if (g.required && g.values[0]) sel[g.id] = g.values[0].id;
  }
  return sel;
}

function selectionsToPayload(sel: Record<string, string>): { groupId: string; valueId: string }[] {
  return Object.entries(sel).map(([groupId, valueId]) => ({ groupId, valueId }));
}

/** Shared helpers take a Record<id, group>; the panel holds an array. */
function itemOptionsById(item: ShopItem): Record<string, OptionGroup> | null {
  if (!item.options || item.options.length === 0) return null;
  return Object.fromEntries(item.options.map((g) => [g.id, g]));
}

export function ShopOrderPanel({
  shopId,
  shopName,
  walletBalance,
  items,
}: {
  shopId: string;
  shopName: string;
  walletBalance: number;
  items: ShopItem[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [address, setAddress] = useState({ name: '', phone: '', address: '' });
  const [notes, setNotes] = useState('');
  const [useWallet, setUseWallet] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const orderable = items.filter((i) => i.kind !== 'PRINT'); // PRINT flows through the print wizard

  const lines = useMemo(() => Object.values(cart).filter((l) => l.qty > 0), [cart]);
  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum +
          (l.price + optionsSurcharge(itemOptionsById(l), selectionsToPayload(l.selections))) * l.qty,
        0,
      ),
    [lines],
  );
  const walletToApply = useWallet ? Math.min(walletBalance, subtotal) : 0;

  function setQty(item: ShopItem, qty: number) {
    const clamped = Math.max(0, Math.min(qty, item.maxQty ?? 99));
    setCart((prev) => ({
      ...prev,
      [item.id]: {
        ...item,
        qty: clamped,
        selections:
          prev[item.id]?.selections ?? defaultSelections(item.options),
      },
    }));
  }

  function setSelection(itemId: string, groupId: string, valueId: string) {
    setCart((prev) => {
      const line = prev[itemId];
      if (!line) return prev;
      return {
        ...prev,
        [itemId]: { ...line, selections: { ...line.selections, [groupId]: valueId } },
      };
    });
  }

  function checkout() {
    setError(null);
    start(async () => {
      if (lines.length === 0) {
        setError('Add at least one item.');
        return;
      }
      const res = await checkoutAction(
        {
          shopId,
          items: lines.map((l) => ({
            itemId: l.id,
            kind: l.kind,
            qty: l.qty,
            options: selectionsToPayload(l.selections),
          })),
          fulfillment,
          deliveryAddress: fulfillment === 'DELIVERY' ? address : undefined,
          notes: notes || undefined,
        },
        walletToApply,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.redirectUrl) {
        router.push(res.redirectUrl);
      }
    });
  }

  if (!orderable.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        This shop hasn&rsquo;t listed products or services yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {orderable.map((item) => {
          const line = cart[item.id];
          const inCart = line?.qty ?? 0;
          const selections = line?.selections ?? {};
          const surcharge = optionsSurcharge(itemOptionsById(item), selectionsToPayload(selections));
          const unitPrice = item.price + surcharge;
          return (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(unitPrice)} / {item.unit}
                    {surcharge !== 0 && inCart > 0 && (
                      <span className="ml-1">(incl. options)</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQty(item, inCart - 1)}
                    disabled={inCart === 0}
                    aria-label={`Remove one ${item.name}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{inCart}</span>
                  <Button variant="outline" size="sm" onClick={() => setQty(item, inCart + 1)} aria-label={`Add one ${item.name}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {item.options && item.options.length > 0 && inCart > 0 && (
                <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Options
                  </p>
                  {item.options.map((group) => (
                    <div key={group.id} className="space-y-1">
                      <Label className="text-xs">
                        {group.label}
                        {group.required && <span className="text-destructive"> *</span>}
                      </Label>
                      {group.compact ? (
                        <select
                          value={selections[group.id] ?? ''}
                          onChange={(e) => setSelection(item.id, group.id, e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          aria-label={group.label}
                        >
                          <option value="">Choose…</option>
                          {group.values.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                              {v.delta !== 0 &&
                                ` (${v.delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(v.delta))})`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {group.values.map((v) => {
                            const active = selections[group.id] === v.id;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => setSelection(item.id, group.id, v.id)}
                                aria-pressed={active}
                                className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                                  active
                                    ? 'border-primary bg-primary-weak font-medium text-primary'
                                    : 'border-border text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {v.label}
                                {v.delta !== 0 && (
                                  <span className="ml-1 opacity-70">
                                    {v.delta > 0 ? '+' : '−'}{formatCurrency(Math.abs(v.delta))}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fulfillment */}
      <div className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFulfillment('PICKUP')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${fulfillment === 'PICKUP' ? 'border-primary bg-primary-weak text-primary' : 'border-border'}`}
          >
            Pickup
          </button>
          <button
            type="button"
            onClick={() => setFulfillment('DELIVERY')}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${fulfillment === 'DELIVERY' ? 'border-primary bg-primary-weak text-primary' : 'border-border'}`}
          >
            Delivery
          </button>
        </div>
        {fulfillment === 'DELIVERY' && (
          <div className="grid gap-2 pt-1">
            <Input placeholder="Your name" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} />
            <Input placeholder="Phone" type="tel" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
            <Input placeholder="Delivery address" value={address.address} onChange={(e) => setAddress({ ...address, address: e.target.value })} />
          </div>
        )}
        <Input placeholder="Notes for the shop (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {/* Summary */}
      {lines.length > 0 && (          <dl className="divide-y divide-border rounded-lg border border-border">
            {lines.map((l) => {
              const chosen = Object.entries(l.selections)
                .map(([gid, vid]) => l.options?.find((g) => g.id === gid)?.values.find((v) => v.id === vid)?.label)
                .filter(Boolean)
                .join(' · ');
              const unit = l.price + optionsSurcharge(itemOptionsById(l), selectionsToPayload(l.selections));
              return (
                <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">
                    {l.name}
                    {chosen && <span className="text-xs"> ({chosen})</span>} × {l.qty}
                  </dt>
                  <dd className="font-medium">{formatCurrency(unit * l.qty)}</dd>
                </div>
              );
            })}
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="font-semibold">Subtotal</dt>
            <dd className="text-lg font-semibold">{formatCurrency(subtotal)}</dd>
          </div>
          {walletBalance > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useWallet}
                  onChange={(e) => setUseWallet(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  aria-label="Apply wallet credit"
                />
                Wallet credit ({formatCurrency(walletBalance)} available)
              </dt>
              <dd className={walletToApply > 0 ? 'font-medium text-emerald-700' : 'text-muted-foreground'}>
                −{formatCurrency(walletToApply)}
              </dd>
            </div>
          )}
        </dl>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" size="lg" onClick={checkout} disabled={pending || lines.length === 0}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
        Place order
      </Button>
    </div>
  );
}
