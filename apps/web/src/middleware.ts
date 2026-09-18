import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

// Edge-safe auth instance (no bcrypt / Supabase) purely for route protection.
const { auth } = NextAuth(authConfig);

/**
 * Route protection by role.
 *  - /admin/** → admin | super_admin
 *  - /shop/**  → shop_owner
 *  - /dashboard, /jobs, /drafts, /reorder, /profile, /wallet → students (any authed user)
 */
export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const role = session?.user?.role;
  const path = nextUrl.pathname;

  const isAdminArea = path.startsWith('/admin');
  const isShopArea = path.startsWith('/shop');
  const isStudentArea =
    path.startsWith('/dashboard') ||
    path.startsWith('/jobs') ||
    path.startsWith('/drafts') ||
    path.startsWith('/reorder') ||
    path.startsWith('/profile') ||
    path.startsWith('/wallet');

  if (!session && (isAdminArea || isShopArea || isStudentArea)) {
    const url = new URL('/login', nextUrl);
    url.searchParams.set('callbackUrl', path);
    return NextResponse.redirect(url);
  }

  if (isAdminArea && role !== 'admin' && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/dashboard', nextUrl));
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
    '/wallet/:path*',
    '/shop/:path*',
    '/admin/:path*',
  ],
};
