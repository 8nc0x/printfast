import 'server-only';
import { db } from '@/lib/db';
import type { WalletType } from '@printflow/db';

/**
 * Wallet operations. Balances change ONLY through creditWallet/debitWallet,
 * which write a WalletTxn with the running balance inside one transaction.
 */

/** Ensure a wallet row exists for (user, type). */
export async function ensureWallet(userId: string, type: WalletType) {
  const existing = await db().wallet.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (existing) return existing;
  return db().wallet.create({ data: { userId, type } });
}

/** Credit a wallet atomically and record the txn with running balance. */
export async function creditWallet(
  userId: string,
  type: WalletType,
  amount: number,
  reason: string,
  refId?: string,
): Promise<number> {
  if (amount <= 0) throw new Error('Credit amount must be positive');

  return db().$transaction(async (tx) => {
    // Serialize per-wallet by upserting then updating with a guard.
    const wallet = await tx.wallet.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type },
      update: {},
    });

    const newBalance = round2(Number(wallet.balance) + amount);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    });

    await tx.walletTxn.create({
      data: {
        walletId: wallet.id,
        amount: round2(amount),
        side: 1,
        reason,
        refId: refId ?? null,
        balanceAfter: newBalance,
      },
    });

    return newBalance;
  });
}

/** Debit a wallet atomically; refuses to go negative. */
export async function debitWallet(
  userId: string,
  type: WalletType,
  amount: number,
  reason: string,
  refId?: string,
): Promise<number> {
  if (amount <= 0) throw new Error('Debit amount must be positive');

  return db().$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId_type: { userId, type } },
    });
    if (!wallet) throw new Error('No wallet of this type');

    const current = Number(wallet.balance);
    if (current < amount) throw new Error('Insufficient balance');
    const newBalance = round2(current - amount);

    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
    await tx.walletTxn.create({
      data: {
        walletId: wallet.id,
        amount: round2(amount),
        side: -1,
        reason,
        refId: refId ?? null,
        balanceAfter: newBalance,
      },
    });

    return newBalance;
  });
}

export async function getWalletBalance(userId: string, type: WalletType): Promise<number> {
  const wallet = await db().wallet.findUnique({
    where: { userId_type: { userId, type } },
    select: { balance: true },
  });
  return wallet ? Number(wallet.balance) : 0;
}

export async function getWalletTxns(userId: string, type: WalletType, limit = 50) {
  const wallet = await db().wallet.findUnique({
    where: { userId_type: { userId, type } },
    include: {
      txns: { orderBy: { createdAt: 'desc' }, take: limit },
    },
  });
  if (!wallet) return [];
  return wallet.txns.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    side: t.side,
    reason: t.reason,
    balanceAfter: Number(t.balanceAfter),
    createdAt: t.createdAt.toISOString(),
  }));
}

/**
 * Record a withdrawal request as a ledger-tracked pending payout.
 * (Payout execution happens out-of-band via UPI; admin marks it PAID.)
 */
export async function requestWithdrawal(userId: string, amount: number, upiVpa: string) {
  const minWithdrawal = await getMinWithdrawal();
  if (amount < minWithdrawal) {
    throw new Error(`Minimum withdrawal is ₹${minWithdrawal}`);
  }

  // Debit now (funds leave the wallet), record as pending payout.
  await debitWallet(userId, 'REFERRAL', amount, 'withdrawal_request');

  return db().payout.create({
    data: {
      userId,
      amount: round2(amount),
      status: 'REQUESTED',
      channel: 'upi',
      destination: upiVpa,
    },
  });
}

async function getMinWithdrawal(): Promise<number> {
  const row = await db().platformConfig.findUnique({ where: { key: 'min_withdrawal' } });
  const v = row?.value as { amount?: number } | undefined;
  return typeof v?.amount === 'number' ? v.amount : 100;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
