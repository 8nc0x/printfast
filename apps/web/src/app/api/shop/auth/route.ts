import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { signShopToken } from '@/lib/shop-token';
import { DEFAULT_SHOP_ID } from '@/lib/constants';
import type { UserRow, ShopRow } from '@/lib/db.types';

/** Shop-owner login for the Electron client. Returns a bearer token + shop info. */
export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data } = await db.from('users').select('*').eq('email', email.toLowerCase()).maybeSingle();
  const user = data as UserRow | null;

  if (!user || user.role !== 'shop_owner' || !user.password_hash) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  // Resolve the shop this owner manages (fall back to the single MVP shop).
  const { data: shopData } = await db.from('shops').select('*').eq('owner_id', user.id).maybeSingle();
  const shop = (shopData as ShopRow | null) ?? { id: DEFAULT_SHOP_ID, name: 'Campus Print Shop' } as ShopRow;

  const token = signShopToken({ sub: user.id, shopId: shop.id });
  return NextResponse.json({
    token,
    shop: { id: shop.id, name: shop.name },
    user: { id: user.id, name: user.name, email: user.email },
  });
}
