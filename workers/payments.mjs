// PrintFlow payments reconcile worker (PM2 cron).
// Sweeps stale PENDING payments and asks the provider for authoritative status:
//   SUCCESS → fulfill (same idempotent path as the webhook)
//   EXPIRED → mark failed, return the job to `configured`
//
// Run via PM2 cron (every 5 min):
//   pm2 start workers/payments.mjs --name printflow-reconcile --cron-restart="*/5 * * * *" --no-autorestart
//
// NOTE: runs outside Next.js, so it talks to the DB directly and performs the
// same steps as processSuccessfulPayment (kept in sync deliberately — the web
// app's version stays the source of truth for flow order).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STALE_AFTER_MS = 60 * 1000; // ignore payments younger than this (user may still be paying)

async function main() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await prisma.payment.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: 50,
    include: { job: { select: { id: true, status: true, isLocked: true } } },
  });

  if (stale.length === 0) {
    console.log('reconcile: nothing to do');
    return;
  }

  const { PayxmintProvider } = await importProvider();
  const provider = new PayxmintProvider();

  for (const payment of stale) {
    const job = payment.job;
    if (!job || job.isLocked || !['payment_pending', 'configured'].includes(job.status)) {
      // Job already resolved (webhook won the race) — close the payment row.
      if (payment.status === 'pending' && job?.isLocked) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'success' } });
      }
      continue;
    }

    if (!payment.paymentReference) {
      // Sandbox/dev row without a gateway reference — expire it after 24h.
      if (Date.now() - payment.createdAt.getTime() > 24 * 60 * 60 * 1000) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
        await prisma.printJob.update({ where: { id: job.id }, data: { status: 'configured' } });
      }
      continue;
    }

    try {
      const state = await provider.checkStatus(payment.paymentReference);
      if (state === 'SUCCESS') {
        await fulfill(job.id, payment.id, payment.paymentReference);
        console.log(`reconcile: fulfilled ${payment.paymentReference}`);
      } else if (state === 'EXPIRED') {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
        await prisma.printJob.update({ where: { id: job.id }, data: { status: 'configured' } });
        console.log(`reconcile: expired ${payment.paymentReference}`);
      } else if (Date.now() - payment.createdAt.getTime() > 24 * 60 * 60 * 1000) {
        // PENDING for >24h → treat as abandoned.
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
        await prisma.printJob.update({ where: { id: job.id }, data: { status: 'configured' } });
        console.log(`reconcile: abandoned ${payment.paymentReference}`);
      }
    } catch (e) {
      console.error(`reconcile: check-status failed for ${payment.paymentReference}:`, e.message);
    }
  }
}

async function fulfill(jobId, paymentId, gatewayReference) {
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'success', gatewayReference, rawCallback: { source: 'reconcile' } },
    });
    await tx.printJob.update({ where: { id: jobId }, data: { status: 'paid', isLocked: true } });
  });
  // Final PDF generation needs the web app's pdf pipeline; enqueue by marking the
  // job `paid` — the web-side compiler (Phase 5 worker) picks it up. For now the
  // payment webhook remains the primary path that also generates the PDF.
}

// The provider module is TypeScript inside apps/web; in Phase 5 this worker will
// import the compiled shared provider. Until then, re-implement the minimal
// check-status call here to avoid a build dependency.
async function importProvider() {
  return {
    PayxmintProvider: class {
      constructor() {
        if (!process.env.PAYXMINT_API_KEY) throw new Error('PAYXMINT_API_KEY not configured');
      }
      async checkStatus(orderIdExternal) {
        const base = (process.env.PAYXMINT_BASE_URL ?? 'https://payxmint.com').replace(/\/$/, '');
        const res = await fetch(`${base}/api/v1/check-status`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.PAYXMINT_API_KEY}`,
          },
          body: JSON.stringify({ order_id: orderIdExternal }),
        });
        if (!res.ok) throw new Error(`check-status failed (${res.status})`);
        const data = await res.json();
        if (data.status === 'SUCCESS') return 'SUCCESS';
        if (data.status === 'EXPIRED') return 'EXPIRED';
        return 'PENDING';
      }
    },
  };
}

main()
  .catch((e) => {
    console.error('reconcile failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
