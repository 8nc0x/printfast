import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { OrderTimeline } from '@/components/order-timeline';
import { LiveRefresh } from '@/components/live-refresh';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import Link from 'next/link';

export const metadata = { title: 'Order' };

const ORDER_LABELS: Record<string, string> = {
  CREATED: 'Created',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_PROCESSING: 'Payment processing',
  PAID: 'Paid',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  READY_FOR_PICKUP: 'Ready for pickup',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
};

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const order = await db().order.findFirst({
    where: { id, customerId: session!.user.id },
    include: {
      shop: { select: { name: true, slug: true } },
      items: true,
      events: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) notFound();

  // Unpaid orders belong on the pay page.
  if (order.status === 'AWAITING_PAYMENT' || order.status === 'PAYMENT_PROCESSING') {
    redirect(`/orders/${id}/pay`);
  }

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{order.number}</h1>
          <p className="text-sm text-muted-foreground">{order.shop.name}</p>
        </div>
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
          {ORDER_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {/* Pickup token / delivery status */}
      {order.status === 'READY_FOR_PICKUP' && (
        <div className="rounded-xl border border-primary bg-primary-weak p-4 text-center">
          <p className="text-sm font-medium text-primary">Ready for pickup</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-primary">
            {order.number}
          </p>
          <p className="mt-1 text-sm text-primary/80">Show this code at the counter.</p>
        </div>
      )}
      {order.status === 'OUT_FOR_DELIVERY' && (
        <div className="rounded-xl border border-primary bg-primary-weak p-4 text-center">
          <p className="text-sm font-medium text-primary">On its way</p>
          <p className="mt-1 text-sm text-primary/80">
            Your order is out for delivery. Keep your phone reachable.
          </p>
        </div>
      )}

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Items</CardTitle>
          <CardDescription>
            {order.fulfillment === 'DELIVERY' ? 'Delivery order' : 'Pickup order'}
            {order.fulfillment === 'DELIVERY' && order.deliveryAddress
              ? ` · ${String((order.deliveryAddress as { address?: string }).address ?? '')}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <dl className="divide-y divide-border">
            {order.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-6 py-2.5 text-sm">
                <dt className="text-muted-foreground">
                  {i.nameSnapshot} × {i.qty}
                  {i.printJobId ? (
                    <Link
                      href={`/jobs/${i.printJobId}`}
                      className="ml-2 text-primary hover:underline"
                    >
                      view print job
                    </Link>
                  ) : null}
                </dt>
                <dd className="font-medium">{formatCurrency(Number(i.lineTotal))}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between px-6 py-2.5 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatCurrency(Number(order.subtotal))}</dd>
            </div>
            {Number(order.deliveryFee) > 0 && (
              <div className="flex items-center justify-between px-6 py-2.5 text-sm">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd>{formatCurrency(Number(order.deliveryFee))}</dd>
              </div>
            )}
            {Number(order.platformFee) > 0 && (
              <div className="flex items-center justify-between px-6 py-2.5 text-sm">
                <dt className="text-muted-foreground">Platform fee</dt>
                <dd>{formatCurrency(Number(order.platformFee))}</dd>
              </div>
            )}
            {Number(order.walletApplied) > 0 && (
              <div className="flex items-center justify-between px-6 py-2.5 text-sm text-emerald-700">
                <dt>Wallet credit applied</dt>
                <dd>−{formatCurrency(Number(order.walletApplied))}</dd>
              </div>
            )}
            <div className="flex items-center justify-between px-6 py-3">
              <dt className="font-semibold">Total</dt>
              <dd className="text-lg font-semibold">{formatCurrency(Number(order.total))}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Order timeline</CardTitle>
          <CardDescription>Live updates as the shop fulfills your order.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrderTimeline
            events={order.events.map((e) => ({
              to: e.to,
              note: e.note,
              createdAt: e.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      <Separator className="opacity-0" />
      <p className="text-center text-xs text-muted-foreground">
        Placed {formatDateTime(order.createdAt.toISOString())}
      </p>
    </div>
  );
}
