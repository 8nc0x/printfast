import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shield } from 'lucide-react';
import { auth } from '@/auth';
import { signOutAction } from '@/app/account-actions';
import { AdminNav } from '@/components/admin/admin-nav';
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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
    redirect('/dashboard');
  }

  const initial = (session.user.email ?? 'A').charAt(0).toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Shield className="h-4 w-4" />
              </span>
              <span>
                PrintFlow <span className="font-normal text-muted-foreground">Admin</span>
              </span>
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-2">
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
                  <p className="text-xs font-normal capitalize text-muted-foreground">
                    {session.user.role.replaceAll('_', ' ')}
                  </p>
                </DropdownMenuLabel>
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
