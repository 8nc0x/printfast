'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, PlusCircle, RotateCcw, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/jobs', label: 'My jobs', icon: FileText },
  { href: '/jobs/new', label: 'New', icon: PlusCircle, primary: true },
  { href: '/reorder', label: 'Reorder', icon: RotateCcw },
  { href: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, primary }) => {
          const active = href === '/jobs' ? pathname === '/jobs' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2.5 text-xs',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5', primary && 'h-6 w-6')} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
