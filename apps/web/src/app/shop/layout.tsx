import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Printer } from 'lucide-react';
import { auth } from '@/auth';
import { signOutAction } from '@/app/account-actions';
import { Button } from '@/components/ui/button';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'shop_owner') redirect('/dashboard');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/shop/orders" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Printer className="h-4 w-4" />
            </span>
            PrintFlow <span className="text-muted-foreground">Shop</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
            <form action={signOutAction}>
              <Button variant="ghost" size="sm" type="submit">Sign out</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="container flex-1 py-6">{children}</main>
    </div>
  );
}
