import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getPublicCatalog } from '@/lib/data/catalog';
import { getWalletBalance } from '@/lib/money/wallets';
import { ShopOrderPanel } from './shop-order-panel';

export const metadata = { title: 'Shop' };

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();

  const shop = await db().shop.findFirst({
    where: { slug, isActive: true, status: 'ACTIVE' },
    select: { id: true, name: true, address: true, phone: true, acceptingOrders: true },
  });
  if (!shop) notFound();

  const [catalog, walletBalance] = await Promise.all([
    getPublicCatalog(shop.id),
    session?.user
      ? getWalletBalance(session.user.id, 'REFERRAL')
      : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{shop.name}</h1>
        {shop.address && <p className="text-sm text-muted-foreground">{shop.address}</p>}
        {!shop.acceptingOrders && (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            This shop is not accepting orders right now.
          </p>
        )}
      </header>

      <ShopOrderPanel
        shopId={shop.id}
        shopName={shop.name}
        walletBalance={walletBalance}
        items={catalog.map((i) => ({
          id: i.id,
          kind: i.kind,
          name: i.name,
          price: i.price,
          unit: i.unit,
          minQty: i.minQty,
          maxQty: i.maxQty,
          options: i.options,
        }))}
      />
    </div>
  );
}
