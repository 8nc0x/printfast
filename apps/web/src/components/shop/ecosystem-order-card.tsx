'use client';

import { useState, useTransition } from 'react';
import { Loader2, ShoppingBag, Bike, Package } from 'lucide-react';
import type { OrderStatus } from '@printflow/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { shopOrderTransition } from '@/app/shop/orders/actions';
import type { ShopOrderRow } from '@/lib/data/orders';

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }[]>> = {
  PAID: [{ to: 'ACCEPTED', label: 'Accept' }],
  ACCEPTED: [{ to: 'PREPARING', label: 'Start preparing' }],
  PREPARING: [{ to: 'READY', label: 'Mark ready' }],
  READY: [], // resolved below by fulfillment mode
};

const STATUS_TONE: Partial<Record<OrderStatus, 'success' | 'warning' | 'info' | 'muted'>> = {
  PAID: 'info',
  ACCEPTED: 'info',
  PREPARING: 'warning',
  READY: 'warning',
  OUT_FOR_DELIVERY: 'info',
  READY_FOR_PICKUP: 'success',
  COMPLETED: 'muted',
  CANCELLED: 'destructive' as never,
};

export function EcosystemOrderCard({ order }: { order: ShopOrderRow }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const isDelivery = order.fulfillment === 'DELIVERY';
  const readyActions = isDelivery
    ? [{ to: 'OUT_FOR_DELIVERY' as OrderStatus, label: 'Out for delivery' }]
    : [{ to: 'READY_FOR_PICKUP' as OrderStatus, label: 'Ready for pickup' }];
  const actions = order.status === 'READY' ? readyActions : (NEXT[order.status] ?? []);

  function act(to: OrderStatus) {
    setError(null);
    start(async () => {
      const res = await shopOrderTransition(order.id, to);
      if (!res.ok) setError(res.error ?? 'Failed');
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{order.number}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {order.customerName ?? 'Customer'}
          </p>
        </div>
        <Badge variant={STATUS_TONE[order.status] ?? 'muted'}>{order.status.replaceAll('_', ' ')}</Badge>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShoppingBag className="h-3.5 w-3.5" />
        {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
        {order.printJobCount > 0 &&
          ` · ${order.printJobCount} print job${order.printJobCount === 1 ? '' : 's'}`}
        <span className="ml-auto inline-flex items-center gap-1">
          {isDelivery ? <Bike className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
          {isDelivery ? 'Delivery' : 'Pickup'}
        </span>
      </p>

      <Separator className="my-3" />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{formatDateTime(order.createdAt)}</span>
        <span className="font-semibold">{formatCurrency(order.total)}</span>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.to} size="sm" onClick={() => act(a.to)} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
