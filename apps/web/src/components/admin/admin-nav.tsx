'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/shops', label: 'Shops' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/finance', label: 'Finance' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/admin/config', label: 'Config' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
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
