import { getShopCatalog } from '@/lib/data/catalog';
import { resolveShopId } from '@/lib/data/shop-context';
import { CatalogManager } from './catalog-manager';

export const metadata = { title: 'Catalog' };

export default async function ShopCatalogPage() {
  const shopId = await resolveShopId();
  const items = shopId ? await getShopCatalog(shopId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Catalog</h1>
        <p className="text-sm text-muted-foreground">
          What customers can order: printing, stationery products, and services.
        </p>
      </div>
      <CatalogManager shopId={shopId ?? ''} initialItems={items} />
    </div>
  );
}
