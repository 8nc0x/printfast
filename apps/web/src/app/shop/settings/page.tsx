import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { resolveShopId } from '@/lib/data/shop-context';
import { db } from '@/lib/db';
import { SettingsForm } from './settings-form';
import { DeliveryForm } from './delivery-form';

export const metadata = { title: 'Shop settings' };

export default async function ShopSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const shopId = await resolveShopId();
  if (!shopId) {
    return <p className="text-sm text-muted-foreground">No shop configured.</p>;
  }

  const [shop, delivery] = await Promise.all([
    db().shop.findUnique({
      where: { id: shopId },
      include: { settings: true },
    }),
    db().shopDelivery.findUnique({ where: { shopId } }),
  ]);
  if (!shop) redirect('/shop/orders');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Shop settings</h1>
        <p className="text-sm text-muted-foreground">
          Business profile, ordering status, and delivery configuration.
        </p>
      </div>

      <SettingsForm
        shop={{
          name: shop.name,
          address: shop.address ?? '',
          phone: shop.phone ?? '',
          whatsapp: shop.whatsapp ?? '',
          category: shop.category ?? '',
          slug: shop.slug ?? '',
          code: shop.code ?? '',
          acceptingOrders: shop.acceptingOrders,
        }}
      />

      <DeliveryForm
        delivery={{
          enabled: delivery?.enabled ?? false,
          fee: delivery ? Number(delivery.fee) : 0,
          minOrder: delivery ? Number(delivery.minOrder) : 0,
          freeAbove: delivery?.freeAbove != null ? Number(delivery.freeAbove) : null,
          radiusKm: delivery ? Number(delivery.radiusKm) : 3,
          prepMinutes: delivery?.prepMinutes ?? 15,
          deliveryMinutes: delivery?.deliveryMinutes ?? 45,
        }}
      />
    </div>
  );
}
