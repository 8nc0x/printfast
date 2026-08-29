import { NextResponse } from 'next/server';
import { requireShopToken } from '@/lib/shop-token';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

  const db = supabaseAdmin();
  // Simple upsert-by-name for this shop.
  const { data: existing } = await db
    .from('printer_config')
    .select('id')
    .eq('shop_id', payload.shopId)
    .eq('printer_name', printerName)
    .maybeSingle();

  if (existing) {
    await db
      .from('printer_config')
      .update({ is_default: !!isDefault, last_status: status ?? 'online' } as never)
      .eq('id', (existing as { id: string }).id);
  } else {
    await db.from('printer_config').insert({
      shop_id: payload.shopId,
      printer_name: printerName,
      is_default: !!isDefault,
      last_status: status ?? 'online',
    } as never);
  }

  return NextResponse.json({ ok: true });
}
