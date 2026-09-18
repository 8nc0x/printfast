'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';

interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [, start] = useTransition();

  async function load() {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: NotificationRow[]; unread: number };
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  function markAllRead() {
    start(async () => {
      await fetch('/api/notifications', { method: 'POST' });
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    });
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 divide-y divide-border overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              items.map((n) => (
                <div key={n.id} className="px-3 py-2.5">
                  <p className={`text-sm ${n.readAt ? 'text-muted-foreground' : 'font-medium'}`}>
                    {labelFor(n)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const LABELS: Record<string, string> = {
  payment_success: 'Payment received — your order is at the shop',
  order_approved: 'Order approved for printing',
  printing_started: 'Your order is printing',
  printing_done: 'Printing finished',
  print_failed: 'Printing had a problem — the shop is on it',
  ready_for_pickup: 'Ready for pickup — show your code',
  completed: 'Order completed',
  order_rejected: 'Order rejected by the shop',
  order_accepted: 'Your order was accepted',
  order_ready: 'Your order is ready',
  order_out_for_delivery: 'Your order is out for delivery',
  order_completed: 'Order completed',
  order_cancelled: 'Order cancelled',
};

function labelFor(n: NotificationRow): string {
  const label = LABELS[n.type] ?? n.type;
  const payload = n.payload as { orderNumber?: string } | null;
  return payload?.orderNumber ? `${label} · ${payload.orderNumber}` : label;
}
