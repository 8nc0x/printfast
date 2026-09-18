import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { OrderPayPanel } from './order-pay-panel';

export const metadata = { title: 'Pay for order' };

export default async function OrderPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const order = await db().order.findFirst({
    where: { id, customerId: session!.user.id },
    include: { items: true },
  });
  if (!order) notFound();

  // Already paid → order status page.
  if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PAYMENT_PROCESSING') {
    redirect(`/orders/${id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review & pay</h1>
        <p className="text-sm text-muted-foreground">Order {order.number}</p>
      </div>
      <OrderPayPanel
        orderId={order.id}
        orderNumber={order.number}
        total={Number(order.total)}
        lines={order.items.map((i) => ({
          label: `${i.nameSnapshot} × ${i.qty}`,
          amount: Number(i.lineTotal),
        }))}
      />
    </div>
  );
}
