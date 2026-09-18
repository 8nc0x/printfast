import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { ScrollText, Search } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export const metadata = { title: 'Admin — Audit log' };

const PAGE_SIZE = 80;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const { action, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));

  const where = action?.trim() ? { action: { contains: action.trim() } } : {};

  const [logs, total] = await Promise.all([
    db().auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (pageNum - 1) * PAGE_SIZE,
      include: { job: { select: { orderNumber: true } } },
    }),
    db().auditLog.count({ where }),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);
  const pageHref = (p: number) =>
    `/admin/audit?page=${p}${action ? `&action=${encodeURIComponent(action)}` : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">{total} events.</p>
        </div>
        <form className="flex max-w-sm flex-1 gap-2" action="/admin/audit">
          <Input name="action" defaultValue={action ?? ''} placeholder="Filter by action…" />
          <Button type="submit" variant="outline">
            <Search className="h-4 w-4" /> Filter
          </Button>
        </form>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit events"
          description={action ? `No events match “${action}”.` : 'Status changes are recorded here automatically.'}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Transition</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(l.createdAt.toISOString())}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.action}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.fromStatus ?? '—'} → {l.toStatus ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.job?.orderNumber ?? (l.jobId ? l.jobId.slice(0, 8) : '—')}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {l.metadata ? JSON.stringify(l.metadata) : '—'}
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
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
            <Button key={p} asChild variant={p === pageNum ? 'default' : 'ghost'} size="sm">
              <Link href={pageHref(p)}>{p}</Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
