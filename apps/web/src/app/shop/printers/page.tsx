import { db } from '@/lib/db';
import { resolveShopId } from '@/lib/data/shop-context';
import { PairingPanel } from './pairing-panel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { Usb, Printer, MonitorSmartphone } from 'lucide-react';

export const metadata = { title: 'Printers' };

function online(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < 5 * 60 * 1000; // 5 min window
}

export default async function ShopPrintersPage() {
  const shopId = await resolveShopId();
  if (!shopId) return <p className="text-sm text-muted-foreground">No shop configured.</p>;

  const printers = await db().printerConfig.findMany({
    where: { shopId },
    orderBy: { printerName: 'asc' },
  });
  const agents = await db().agent.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Printers &amp; agent</h1>
        <p className="text-sm text-muted-foreground">
          Connect the Windows agent to enable one-click printing.
        </p>
      </div>

      <PairingPanel shopId={shopId} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Connected agents</CardTitle>
          <CardDescription>Windows devices running the PrintFlow agent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.length === 0 ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="No agents paired yet"
              description="Install the PrintFlow agent on the shop's Windows PC and enter the pairing code above."
              className="border-0 py-8"
            />
          ) : (
            agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{a.deviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    v{a.version ?? '?'} · last seen{' '}
                    {a.lastSeenAt
                      ? a.lastSeenAt.toISOString().slice(0, 16).replace('T', ' ')
                      : 'never'}
                  </p>
                </div>
                <Badge variant={a.status === 'active' && online(a.lastSeenAt) ? 'success' : 'muted'}>
                  {a.status === 'active' && online(a.lastSeenAt) ? 'online' : a.status}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Printers</CardTitle>
          <CardDescription>Reported by your agents on each heartbeat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {printers.length === 0 ? (
            <EmptyState
              icon={Printer}
              title="No printers yet"
              description="Printers appear here automatically once an agent connects."
              className="border-0 py-8"
            />
          ) : (
            printers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Usb className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{p.printerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.lastStatus ?? 'unknown'} · last seen{' '}
                      {p.lastSeenAt
                        ? p.lastSeenAt.toISOString().slice(0, 16).replace('T', ' ')
                        : 'never'}
                    </p>
                  </div>
                </div>
                <Badge variant={online(p.lastSeenAt) ? 'success' : 'muted'}>
                  {online(p.lastSeenAt) ? 'online' : 'offline'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
