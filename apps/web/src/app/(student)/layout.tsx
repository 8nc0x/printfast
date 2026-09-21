import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Printer } from 'lucide-react';
import { auth } from '@/auth';
import { BottomNav } from '@/components/bottom-nav';
import { NotificationsBell } from '@/components/notifications-bell';
import { signOutAction } from '@/app/account-actions';
import { Button } from '@/components/ui/button';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'shop_owner') redirect('/shop/orders');
  if (session.user.role === 'admin' || session.user.role === 'super_admin') redirect('/admin');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Printer className="h-4 w-4" />
            </span>
            PrintFlow
          </Link>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <form action={signOutAction}>
              <Button variant="ghost" size="sm" type="submit">Sign out</Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">{children}</main>

      <BottomNav />
    </div>
  );
}
