import 'server-only';
import { canTransition, type JobStatus } from '@printflow/shared';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { signedUrl } from '@/lib/supabase/storage';
import { audit, notify } from '@/lib/data/audit';
import type { PrintJobRow } from '@/lib/db.types';

const NOTIFY_ON: Partial<Record<JobStatus, string>> = {
  approved: 'order_approved',
  printing: 'printing_started',
  ready_for_pickup: 'ready_for_pickup',
  completed: 'completed',
  rejected: 'order_rejected',
};

/**
 * Core shop-side status transition. Shared by the web dashboard (shop_owner
 * session) and the Electron API (shop token). Validates the transition against
 * the job state machine, writes audit + notification, and returns the new row.
 */
export async function transitionJob(
  jobId: string,
  to: JobStatus,
  actorId?: string | null,
): Promise<PrintJobRow> {
  const db = supabaseAdmin();
  const { data } = await db.from('print_jobs').select('*').eq('id', jobId).maybeSingle();
  const job = data as PrintJobRow | null;
  if (!job) throw new Error('Job not found');

  // Shop may only act on paid-or-later jobs.
  const shopVisible = !['draft', 'configured', 'payment_pending'].includes(job.status);
  if (!shopVisible) throw new Error('Job is not available to the shop');

  if (!canTransition(job.status, to)) {
    throw new Error(`Cannot move ${job.status} → ${to}`);
  }

  await db.from('print_jobs').update({ status: to } as never).eq('id', jobId);
  await audit({ actorId: actorId ?? null, jobId, action: `shop_${to}`, fromStatus: job.status, toStatus: to });

  const notifyType = NOTIFY_ON[to];
  if (notifyType) {
    await notify({ userId: job.student_id, jobId, type: notifyType, payload: { orderNumber: job.order_number } });
  }

  return { ...job, status: to };
}

export const approveJob = (jobId: string, actorId?: string | null) => transitionJob(jobId, 'approved', actorId);
export const rejectJob = (jobId: string, actorId?: string | null) => transitionJob(jobId, 'rejected', actorId);

/** Signed URL to the final print-ready PDF (shop-side preview / printing). */
export async function getFinalPdfUrl(jobId: string): Promise<string> {
  const { data } = await supabaseAdmin()
    .from('print_jobs')
    .select('final_pdf_path,status')
    .eq('id', jobId)
    .maybeSingle();
  const row = data as Pick<PrintJobRow, 'final_pdf_path' | 'status'> | null;
  if (!row?.final_pdf_path) throw new Error('Final PDF not available yet');
  return signedUrl('finals', row.final_pdf_path);
}
