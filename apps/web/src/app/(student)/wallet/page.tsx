import { auth } from '@/auth';
import { getReferralStats } from '@/lib/money/referrals';
import { getWalletBalance, getWalletTxns } from '@/lib/money/wallets';
import { WithdrawForm } from './withdraw-form';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export const metadata = { title: 'Wallet & referrals' };

export default async function WalletPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [stats, balance, txns] = await Promise.all([
    getReferralStats(userId),
    getWalletBalance(userId, 'REFERRAL'),
    getWalletTxns(userId, 'REFERRAL'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Wallet & referrals</h1>
        <p className="text-sm text-muted-foreground">Earn by bringing friends to PrintFlow.</p>
      </div>

      {/* Referral code */}
      <section className="rounded-lg border border-border p-4">
        <p className="text-sm text-muted-foreground">Your referral code</p>
        <p className="mt-1 text-2xl font-bold tracking-widest">{stats.code}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Share <code className="rounded bg-muted px-1">/register?ref={stats.code}</code> — you earn
          ₹1 when a referred friend makes their first paid order.
        </p>
        <p className="mt-3 text-sm">
          <span className="font-semibold">{stats.referredCount}</span> friends referred ·{' '}
          <span className="font-semibold">{formatCurrency(stats.lifetimeEarnings)}</span> lifetime
        </p>
      </section>

      {/* Balance */}
      <section className="rounded-lg border border-primary bg-primary-weak p-4">
        <p className="text-sm text-primary/80">Available balance</p>
        <p className="mt-1 text-3xl font-bold text-primary">{formatCurrency(balance)}</p>
      </section>

      <WithdrawForm available={balance} />

      {/* History */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent activity</h2>
        {txns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No transactions yet.
          </p>
        ) : (
          <dl className="divide-y divide-border rounded-lg border border-border">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <dt className="font-medium capitalize">{t.reason.replace(/_/g, ' ')}</dt>
                  <dd className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</dd>
                </div>
                <dd className={t.side > 0 ? 'font-medium text-primary' : 'font-medium text-destructive'}>
                  {t.side > 0 ? '+' : '−'}{formatCurrency(t.amount)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
