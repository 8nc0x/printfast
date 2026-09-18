'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, PlusCircle, RotateCcw, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/jobs', label: 'My jobs', icon: FileText },
  { href: '/jobs/new', label: 'New', icon: PlusCircle, primary: true },
  { href: '/wallet', label: 'Wallet', icon: RotateCcw },
  { href: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto grid max-w-md grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map(({ href, label, icon: Icon, primary }) => {
          const active = href === '/jobs' ? pathname === '/jobs' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                primary && 'text-primary-foreground',
              )}
            >
              {primary ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary shadow-sm">
                  <Icon className="h-5 w-5" />
                </span>
              ) : (
                <Icon className="h-5 w-5" />
              )}
              <span>{label}</span>
              {active && !primary && (
                <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
