import { db } from '@/lib/db';
import { resolveShopId } from '@/lib/data/shop-context';
import { QrPoster } from './qr-poster';
import { EmptyState } from '@/components/empty-state';
import { QrCode } from 'lucide-react';

export const metadata = { title: 'Shop QR' };

export default async function ShopQrPage() {
  const shopId = await resolveShopId();
  if (!shopId) return <p className="text-sm text-muted-foreground">No shop configured.</p>;

  const shop = await db().shop.findUnique({
    where: { id: shopId },
    select: { name: true, slug: true, code: true },
  });
  if (!shop?.slug) {
    return (
      <EmptyState
        icon={QrCode}
        title="Shop link not set up yet"
        description="Set a slug on your shop profile first, then your QR poster will be generated here."
      />
    );
  }

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/s/${shop.slug}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Shop QR</h1>
        <p className="text-sm text-muted-foreground">
          Print this and put it at the counter — customers scan and order instantly.
        </p>
      </div>
      <QrPoster shopName={shop.name} url={url} shopCode={shop.code ?? ''} />
    </div>
  );
}
