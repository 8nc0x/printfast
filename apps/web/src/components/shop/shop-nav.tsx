'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/shop/orders', label: 'Orders' },
  { href: '/shop/catalog', label: 'Catalog' },
  { href: '/shop/printers', label: 'Printers' },
  { href: '/shop/analytics', label: 'Analytics' },
  { href: '/shop/qr', label: 'QR' },
  { href: '/shop/referrals', label: 'Referrals' },
  { href: '/shop/subscription', label: 'Plan' },
  { href: '/shop/settings', label: 'Settings' },
];

export function ShopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {LINKS.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 transition-colors',
              active
                ? 'bg-primary-weak font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
