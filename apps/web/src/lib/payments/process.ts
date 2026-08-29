import 'server-only';
import { jobDocumentSchema, quote } from '@printflow/shared';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getShopPricing } from '@/lib/data/job-service';
import { generateAndStoreFinalPdf } from '@/lib/pdf/finalize';
import { audit, notify } from '@/lib/data/audit';
import { getPaymentProvider } from './index';
import type { PrintJobRow, PaymentRow } from '@/lib/db.types';

/**
 * Begin payment for a configured job. Snapshots the price, creates a pending
 * payment row, moves the job to payment_pending, and asks the provider to start
 * checkout. Returns the client redirect target.
 */
export async function createPaymentForJob(
  jobId: string,
  userId: string,
): Promise<{ redirectUrl?: string; params?: Record<string, unknown>; paymentId: string }> {
  const db = supabaseAdmin();
  const { data } = await db.from('print_jobs').select('*').eq('id', jobId).eq('student_id', userId).maybeSingle();
  const job = data as PrintJobRow | null;
  if (!job) throw new Error('Job not found');
  if (job.is_locked || job.status === 'paid' || job.status === 'shop_received') {
    throw new Error('This order is already paid');
  }
  const doc = jobDocumentSchema.parse(job.document);
  if (doc.pages.length === 0) throw new Error('Add at least one page before paying');

  const pricing = await getShopPricing(job.shop_id);
  const price = quote(doc, pricing);

  const paymentId = crypto.randomUUID();
  const provider = getPaymentProvider();

  const created = await provider.createPayment({
    jobId,
    amount: price.total,
    currency: price.currency,
    orderNumber: job.order_number,
  });

  await db.from('payments').insert({
    id: paymentId,
    job_id: jobId,
    amount: price.total,
    currency: price.currency,
    status: 'pending',
    provider: provider.name,
    payment_reference: created.paymentReference,
  } as never);

  await db
    .from('print_jobs')
    .update({ price_amount: price.total, status: 'payment_pending' } as never)
    .eq('id', jobId);

  await audit({ actorId: userId, jobId, action: 'payment_started', fromStatus: 'configured', toStatus: 'payment_pending', metadata: { amount: price.total } });

  return { redirectUrl: created.redirectUrl, params: created.params, paymentId };
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
  const db = supabaseAdmin();
  const { data } = await db.from('print_jobs').select('*').eq('id', jobId).maybeSingle();
  const job = data as PrintJobRow | null;
  if (!job) throw new Error('Job not found');

  // Idempotency: already processed.
  if (['paid', 'shop_received', 'approved', 'printing', 'printed', 'ready_for_pickup', 'completed'].includes(job.status)) {
    return;
  }

  // Mark the payment row successful.
  const { data: payData } = await db
    .from('payments')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const payment = payData as PaymentRow | null;
  if (payment) {
    await db
      .from('payments')
      .update({ status: 'success', gateway_reference: gatewayReference, raw_callback: raw } as never)
      .eq('id', payment.id);
  }

  // Lock the job as PAID.
  await db.from('print_jobs').update({ status: 'paid', is_locked: true } as never).eq('id', jobId);
  await audit({ jobId, action: 'payment_success', fromStatus: 'payment_pending', toStatus: 'paid', metadata: { gatewayReference } });
  await notify({ userId: job.student_id, jobId, type: 'payment_success' });

  // Generate the final print-ready PDF (source of truth), then hand to the shop.
  await generateAndStoreFinalPdf(jobId);
  await db.from('print_jobs').update({ status: 'shop_received' } as never).eq('id', jobId);
  await audit({ jobId, action: 'shop_received', fromStatus: 'paid', toStatus: 'shop_received' });
}
