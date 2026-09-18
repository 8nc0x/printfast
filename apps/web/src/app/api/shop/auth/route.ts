import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signShopToken } from '@/lib/shop-token';

/** Shop-owner login for the Electron client. Returns a bearer token + shop info. */
export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const user = await db().user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || user.role !== 'shop_owner' || !user.passwordHash) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  // Resolve the shop this owner manages (fall back to the first active shop).
  let shop = await db().shop.findFirst({
    where: { ownerId: user.id, isActive: true },
  });
  if (!shop) {
    shop = await db().shop.findFirst({ where: { isActive: true } });
  }
  if (!shop) {
    return NextResponse.json({ error: 'No shop configured' }, { status: 500 });
  }

  const token = signShopToken({ sub: user.id, shopId: shop.id });
  return NextResponse.json({
    token,
    shop: { id: shop.id, name: shop.name },
    user: { id: user.id, name: user.name, email: user.email },
  });
}
