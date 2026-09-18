import 'server-only';
import { jobDocumentSchema, quote } from '@printflow/shared';
import { db } from '@/lib/db';
import { getShopPricing } from '@/lib/data/job-service';
import { generateAndStoreFinalPdf } from '@/lib/pdf/finalize';
import { audit, notify } from '@/lib/data/audit';
import { getPaymentProvider } from './index';
import type { Prisma } from '@printflow/db';

/**
 * Begin payment for a configured job. Snapshots the price, creates a pending
 * payment row, moves the job to payment_pending, and asks the provider to start
 * checkout. Returns the client redirect target.
 */
export async function createPaymentForJob(
  jobId: string,
  userId: string,
): Promise<{ redirectUrl?: string; params?: Record<string, unknown>; paymentId: string }> {
  const job = await db().printJob.findFirst({ where: { id: jobId, studentId: userId } });
  if (!job) throw new Error('Job not found');
  if (job.isLocked || job.status === 'paid' || job.status === 'shop_received') {
    throw new Error('This order is already paid');
  }
  const doc = jobDocumentSchema.parse(job.document);
  if (doc.pages.length === 0) throw new Error('Add at least one page before paying');

  const pricing = await getShopPricing(job.shopId);
  const price = quote(doc, pricing);

  const provider = getPaymentProvider();

  const created = await provider.createPayment({
    jobId,
    amount: price.total,
    currency: price.currency,
    orderNumber: job.orderNumber,
  });

  const payment = await db().payment.create({
    data: {
      jobId,
      amount: price.total,
      currency: price.currency,
      status: 'pending',
      provider: provider.name,
      paymentReference: created.paymentReference,
    },
  });

  await db().printJob.update({
    where: { id: jobId },
    data: { priceAmount: price.total, status: 'payment_pending' },
  });

  await audit({ actorId: userId, jobId, action: 'payment_started', fromStatus: 'configured', toStatus: 'payment_pending', metadata: { amount: price.total } });

  return { redirectUrl: created.redirectUrl, params: created.params, paymentId: payment.id };
}

/**
 * Idempotently apply a successful payment: mark payment success, lock the job,
 * generate the final PDF, and move it to shop_received (visible to the shop).
 * Safe to call more than once (gateways may retry callbacks).
 */
export async function processSuccessfulPayment(
  jobId: string,
  gatewayReference: string,
  raw: unknown,
): Promise<void> {
  const job = await db().printJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  // Idempotency: already processed.
  if (['paid', 'shop_received', 'approved', 'printing', 'printed', 'ready_for_pickup', 'completed'].includes(job.status)) {
    return;
  }

  // Mark the latest pending payment row successful.
  const payment = await db().payment.findFirst({
    where: { jobId },
    orderBy: { createdAt: 'desc' },
  });
  if (payment) {
    await db().payment.update({
      where: { id: payment.id },
      data: {
        status: 'success',
        gatewayReference,
        rawCallback: raw as Prisma.InputJsonValue,
      },
    });
  }

  // Lock the job as PAID.
  await db().printJob.update({ where: { id: jobId }, data: { status: 'paid', isLocked: true } });
  await audit({ jobId, action: 'payment_success', fromStatus: 'payment_pending', toStatus: 'paid', metadata: { gatewayReference } });
  await notify({ userId: job.studentId, jobId, type: 'payment_success' });

  // ── Money settlement (immutable ledger + referral reward) ──
  try {
    const { recordSettlement, getMoneyConfig } = await import('@/lib/money/ledger');
    const { creditCustomerReferral } = await import('@/lib/money/referrals');
    const config = await getMoneyConfig();
    const amount = Number(payment?.amount ?? job.priceAmount ?? 0);
    await recordSettlement({
      paymentId: payment?.id ?? '',
      sourceType: 'print',
      sourceId: jobId,
      grossAmount: amount,
      platformFee: config.platformFee,
      shopId: job.shopId,
      shopAmount: Math.max(0, amount - config.platformFee),
      gatewayFee: 0, // actual cost reconciled out-of-band
    });
    await creditCustomerReferral({
      customerId: job.studentId,
      sourceType: 'print',
      sourceId: jobId,
      paymentId: payment?.id ?? '',
    });
  } catch (e) {
    // Settlement failure must not lose the payment; alert via audit + retry cron.
    await audit({ jobId, action: 'settlement_failed', metadata: { error: e instanceof Error ? e.message : 'unknown' } });
  }

  // Generate the final print-ready PDF (source of truth), then hand to the shop.
  await generateAndStoreFinalPdf(jobId);
  await db().printJob.update({ where: { id: jobId }, data: { status: 'shop_received' } });
  await audit({ jobId, action: 'shop_received', fromStatus: 'paid', toStatus: 'shop_received' });
}
