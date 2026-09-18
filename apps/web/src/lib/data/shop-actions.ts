import 'server-only';
import { canTransition, type JobStatus } from '@printflow/shared';
import { db } from '@/lib/db';
import { signedUrl } from '@/lib/storage';
import { audit, notify } from '@/lib/data/audit';
import type { PrintJobRow } from '@/lib/db.types';
import type { Prisma } from '@printflow/db';

const NOTIFY_ON: Partial<Record<JobStatus, string>> = {
  approved: 'order_approved',
  printing: 'printing_started',
  ready_for_pickup: 'ready_for_pickup',
  completed: 'completed',
  rejected: 'order_rejected',
};

type JobWithStudent = Prisma.PrintJobGetPayload<{
  include: { student: { select: { id: true; name: true; email: true } } };
}>;

function toRow(j: JobWithStudent): PrintJobRow {
  return {
    id: j.id,
    order_number: j.orderNumber,
    student_id: j.studentId,
    shop_id: j.shopId,
    status: j.status,
    document: j.document as PrintJobRow['document'],
    total_pages: j.totalPages,
    color_pages: j.colorPages,
    bw_pages: j.bwPages,
    copies: j.copies,
    paper_size: j.paperSize,
    orientation: j.orientation,
    binding: j.binding,
    price_amount: j.priceAmount != null ? Number(j.priceAmount) : null,
    final_pdf_path: j.finalPdfPath,
    is_locked: j.isLocked,
    created_at: j.createdAt.toISOString(),
    updated_at: j.updatedAt.toISOString(),
    student: j.student
      ? {
          id: j.student.id,
          name: j.student.name,
          email: j.student.email,
          password_hash: null,
          image: null,
          created_at: '',
          updated_at: '',
        }
      : null,
  } as PrintJobRow;
}

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
  const job = await db().printJob.findUnique({
    where: { id: jobId },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
  if (!job) throw new Error('Job not found');

  // Shop may only act on paid-or-later jobs.
  const shopVisible = !['draft', 'configured', 'payment_pending'].includes(job.status);
  if (!shopVisible) throw new Error('Job is not available to the shop');

  if (!canTransition(job.status, to)) {
    throw new Error(`Cannot move ${job.status} → ${to}`);
  }

  await db().printJob.update({
    where: { id: jobId },
    data: { status: to },
  });

  await audit({ actorId: actorId ?? null, jobId, action: `shop_${to}`, fromStatus: job.status, toStatus: to });

  const notifyType = NOTIFY_ON[to];
  if (notifyType) {
    await notify({ userId: job.studentId, jobId, type: notifyType, payload: { orderNumber: job.orderNumber } });
  }

  return toRow({ ...job, status: to });
}

export const approveJob = (jobId: string, actorId?: string | null) => transitionJob(jobId, 'approved', actorId);
export const rejectJob = (jobId: string, actorId?: string | null) => transitionJob(jobId, 'rejected', actorId);

/** Signed URL to the final print-ready PDF (shop-side preview / printing). */
export async function getFinalPdfUrl(jobId: string): Promise<string> {
  const job = await db().printJob.findUnique({
    where: { id: jobId },
    select: { finalPdfPath: true, status: true },
  });
  if (!job?.finalPdfPath) throw new Error('Final PDF not available yet');
  return signedUrl('finals', job.finalPdfPath);
}
