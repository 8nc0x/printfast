import Link from 'next/link';
import { db } from '@/lib/db';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserActions } from './user-actions';

export const metadata = { title: 'Admin — Users' };

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    db().user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (pageNum - 1) * PAGE_SIZE,
      select: { id: true, email: true, name: true, role: true, isBanned: true, createdAt: true },
    }),
    db().user.count({ where }),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);
  const pageHref = (p: number) => `/admin/users?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">{total} accounts.</p>
        </div>
        <form className="flex max-w-sm flex-1 gap-2" action="/admin/users">
          <Input name="q" defaultValue={q ?? ''} placeholder="Search email or name…" />
          <Button type="submit" variant="outline">
            <Search className="h-4 w-4" /> Search
          </Button>
        </form>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={Search} title="No users found" description={q ? `No matches for “${q}”.` : 'No accounts yet.'} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium">{u.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.createdAt.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      {u.isBanned ? (
                        <Badge variant="destructive">Banned</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActions userId={u.id} isBanned={u.isBanned} role={u.role} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Button key={p} asChild variant={p === pageNum ? 'default' : 'ghost'} size="sm">
              <Link href={pageHref(p)}>{p}</Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
