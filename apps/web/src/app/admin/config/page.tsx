import { db } from '@/lib/db';
import { ConfigEditor } from './config-editor';
import { formatDateTime } from '@/lib/utils';

export const metadata = { title: 'Admin — Config' };

const EDITABLE_KEYS: { key: string; label: string; hint: string; field: 'amount' | 'pct' }[] = [
  { key: 'platform_fee', label: 'Platform fee', hint: '₹ charged per customer transaction', field: 'amount' },
  { key: 'referral_reward', label: 'Customer referral reward', hint: '₹ credited to the referrer per eligible transaction', field: 'amount' },
  { key: 'shop_commission_pct', label: 'Shop referral commission', hint: '% of subscription paid to the referring shop', field: 'pct' },
  { key: 'min_withdrawal', label: 'Minimum withdrawal', hint: '₹ below which wallets cannot withdraw', field: 'amount' },
];

export default async function AdminConfigPage() {
  const rows = await db().platformConfig.findMany({
    where: { key: { in: EDITABLE_KEYS.map((k) => k.key) } },
  });
  const values = new Map(rows.map((r) => [r.key, r.value]));

  const audit = await db().auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Platform config</h1>
        <p className="text-sm text-muted-foreground">
          Money rules live here — changing them never rewrites historical orders (they snapshot at payment time).
        </p>
      </div>

      <ConfigEditor
        entries={EDITABLE_KEYS.map((k) => {
          const v = values.get(k.key) as { amount?: number; pct?: number } | undefined;
          const value = k.field === 'amount' ? (v?.amount ?? 0) : (v?.pct ?? 0);
          return { key: k.key, label: k.label, hint: k.hint, field: k.field, value };
        })}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent audit events</h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {audit.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No audit events.</p>
          ) : (
            audit.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt.toISOString())}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
