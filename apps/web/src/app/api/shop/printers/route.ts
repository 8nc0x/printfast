import { NextResponse } from 'next/server';
import { requireShopToken } from '@/lib/shop-token';
import { db } from '@/lib/db';

/** Record the shop's selected printer + health (from the Electron client). */
export async function POST(req: Request) {
  let payload;
  try {
    payload = requireShopToken(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { printerName, isDefault, status } = (await req.json().catch(() => ({}))) as {
    printerName?: string;
    isDefault?: boolean;
    status?: string;
  };
  if (!printerName) return NextResponse.json({ error: 'printerName required' }, { status: 400 });

  await db().printerConfig.upsert({
    where: { shopId_printerName: { shopId: payload.shopId, printerName } },
    create: {
      shopId: payload.shopId,
      printerName,
      isDefault: !!isDefault,
      lastStatus: status ?? 'online',
      lastSeenAt: new Date(),
    },
    update: {
      isDefault: !!isDefault,
      lastStatus: status ?? 'online',
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
