import { Printer } from 'lucide-react';
import { getShopJobs, groupShopJobs } from '@/lib/data/shop';
import { getShopOrders, groupShopOrders } from '@/lib/data/orders';
import { resolveShopId } from '@/lib/data/shop-context';
import { OrderCard, type OrderCardData } from '@/components/shop/order-card';
import { EcosystemOrderCard } from '@/components/shop/ecosystem-order-card';
import { EmptyState } from '@/components/empty-state';
import { LiveRefresh } from '@/components/live-refresh';
import type { ShopJob } from '@/lib/data/shop';

export const metadata = { title: 'Orders' };

const COLUMNS = [
  { key: 'new', label: 'New orders' },
  { key: 'approved', label: 'Approved' },
  { key: 'printing', label: 'Printing' },
  { key: 'ready', label: 'Ready for pickup' },
  { key: 'completed', label: 'Completed' },
] as const;

function toCardData(job: ShopJob): OrderCardData {
  return {
    id: job.id,
    orderNumber: job.order_number,
    status: job.status,
    studentName: job.student?.name ?? 'Student',
    totalPages: job.total_pages,
    colorPages: job.color_pages,
    copies: job.copies,
    binding: job.binding,
    paperSize: job.paper_size,
    amount: job.price_amount != null ? Number(job.price_amount) : null,
    currency: 'INR',
    paymentReference: job.paymentReference,
    createdAt: job.created_at,
  };
}

export default async function ShopOrdersPage() {
  const shopId = await resolveShopId();

  const jobs = shopId ? await getShopJobs(shopId) : [];
  const grouped = groupShopJobs(jobs);

  // Ecosystem orders (print + stationery + services) — Phase 2.
  const orders = shopId ? await getShopOrders(shopId) : [];
  const orderGroups = groupShopOrders(orders);

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Only paid jobs appear here. Approve, print, and mark ready.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = grouped[col.key];
          return (
            <section key={col.key} className="rounded-lg border border-border bg-muted/40">
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <h2 className="text-sm font-medium">{col.label}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </header>
              <div className="space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
                ) : (
                  items.map((job) => <OrderCard key={job.id} job={toCardData(job)} />)
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Ecosystem orders (mixed carts) */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Shop orders (mixed carts)</h2>
        {orders.length === 0 ? (
          <EmptyState
            icon={Printer}
            title="No shop orders yet"
            description="Mixed-cart orders (stationery + printing) will appear here the moment a customer pays."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[...orderGroups.new, ...orderGroups.accepted, ...orderGroups.preparing, ...orderGroups.ready, ...orderGroups.out].map(
              (order) => (
                <EcosystemOrderCard key={order.id} order={order} />
              ),
            )}
          </div>
        )}
      </section>

      {jobs.length === 0 && orders.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No paid orders yet. Orders will appear the moment a customer pays.
        </p>
      )}
    </div>
  );
}
