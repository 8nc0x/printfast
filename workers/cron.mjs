// PrintFlow maintenance cron (PM2).
//   - expire unpaid print jobs + ecosystem orders past their payment window
//   - subscription dunning (trial end → PAST_DUE → EXPIRED)
//   - cleanup: revoke stale pairing tokens
//
// Run: pm2 start workers/cron.mjs --name printflow-cron --cron-restart="*/10 * * * *" --no-autorestart
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function expireUnpaid() {
  const now = new Date();

  // Ecosystem orders past expiresAt still awaiting payment.
  const orders = await prisma.order.updateMany({
    where: { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_PROCESSING'] }, expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });

  // Legacy print jobs stuck in payment_pending for >24h.
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const jobs = await prisma.printJob.updateMany({
    where: { status: 'payment_pending', updatedAt: { lt: cutoff } },
    data: { status: 'configured' },
  });

  // Pending payments older than 24h → failed (the reconcile worker handles newer ones).
  const payments = await prisma.payment.updateMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    data: { status: 'failed' },
  });

  if (orders.count || jobs.count || payments.count) {
    console.log(`cron: expired ${orders.count} orders, reset ${jobs.count} jobs, failed ${payments.count} payments`);
  }
}

async function subscriptionDunning() {
  const now = new Date();

  // Trial ended → PAST_DUE.
  const toPastDue = await prisma.subscription.updateMany({
    where: { status: 'TRIALING', currentPeriodEnd: { lt: now } },
    data: { status: 'PAST_DUE' },
  });

  // PAST_DUE beyond 14 days → EXPIRED.
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const toExpired = await prisma.subscription.updateMany({
    where: { status: 'PAST_DUE', currentPeriodEnd: { lt: cutoff } },
    data: { status: 'EXPIRED' },
  });

  if (toPastDue.count || toExpired.count) {
    console.log(`cron: subscriptions — ${toPastDue.count} past due, ${toExpired.count} expired`);
  }
}

async function cleanupPairingTokens() {
  const res = await prisma.agent.updateMany({
    where: { status: 'pending', pairingExpires: { lt: new Date() } },
    data: { pairingToken: null, pairingExpires: null },
  });
  if (res.count) console.log(`cron: cleared ${res.count} stale pairing tokens`);
}

async function main() {
  await expireUnpaid();
  await subscriptionDunning();
  await cleanupPairingTokens();
  console.log('cron: done');
}

main()
  .catch((e) => {
    console.error('cron failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
