import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

// Edge-safe auth instance (no bcrypt / Supabase) purely for route protection.
const { auth } = NextAuth(authConfig);

/**
 * Route protection by role.
 *  - /shop/**  → shop_owner only
 *  - /dashboard, /jobs, /drafts, /reorder, /profile → authenticated students
 */
export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const role = session?.user?.role;
  const path = nextUrl.pathname;

  const isShopArea = path.startsWith('/shop');
  const isStudentArea =
    path.startsWith('/dashboard') ||
    path.startsWith('/jobs') ||
    path.startsWith('/drafts') ||
    path.startsWith('/reorder') ||
    path.startsWith('/profile');

  if (!session && (isShopArea || isStudentArea)) {
    const url = new URL('/login', nextUrl);
    url.searchParams.set('callbackUrl', path);
    return NextResponse.redirect(url);
  }

  if (isShopArea && role !== 'shop_owner') {
    return NextResponse.redirect(new URL('/dashboard', nextUrl));
  }

  if (isStudentArea && role === 'shop_owner') {
    return NextResponse.redirect(new URL('/shop/orders', nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/jobs/:path*',
    '/drafts/:path*',
    '/reorder/:path*',
    '/profile/:path*',
    '/shop/:path*',
  ],
};
