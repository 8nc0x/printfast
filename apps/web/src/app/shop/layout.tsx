import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Printer } from 'lucide-react';
import { auth } from '@/auth';
import { NotificationsBell } from '@/components/notifications-bell';
import { signOutAction } from '@/app/account-actions';
import { ShopNav } from '@/components/shop/shop-nav';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'shop_owner') {
    if (session.user.role === 'admin' || session.user.role === 'super_admin') redirect('/admin');
    redirect('/dashboard');
  }

  const initial = (session.user.email ?? 'S').charAt(0).toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link href="/shop/orders" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Printer className="h-4 w-4" />
            </span>
            <span>
              PrintFlow <span className="font-normal text-muted-foreground">Shop</span>
            </span>
          </Link>

          <ShopNav />

          <div className="flex items-center gap-2">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full outline-none ring-ring focus-visible:ring-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8 border">
                    <AvatarFallback className="bg-primary-weak text-xs text-primary">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-medium">{session.user.email}</p>
                  <p className="text-xs font-normal text-muted-foreground">Shop owner</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/shop/analytics">Analytics</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/shop/qr">Shop QR</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={signOutAction}>
                  <button type="submit" className="w-full text-left">
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      Sign out
                    </DropdownMenuItem>
                  </button>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="container flex-1 py-6">{children}</main>
    </div>
  );
}
