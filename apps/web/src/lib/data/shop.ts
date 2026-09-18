import 'server-only';
import { db } from '@/lib/db';
import { isShopVisible, type JobStatus } from '@printflow/shared';
import type { PrintJobRow, UserRow } from '@/lib/db.types';
import type { Prisma } from '@printflow/db';

export interface ShopJob extends PrintJobRow {
  student: Pick<UserRow, 'name' | 'email'> | null;
  paymentReference: string | null;
}

/**
 * Paid jobs for the shop. The query filters to shop-visible statuses so an unpaid
 * job is structurally impossible to return here.
 */
export async function getShopJobs(shopId: string): Promise<ShopJob[]> {
  try {
    const rows = await db().printJob.findMany({
      where: {
        shopId,
        // Structural visibility gate — mirrors isShopVisible().
        status: { in: ['shop_received', 'approved', 'printing', 'printed', 'ready_for_pickup', 'completed', 'rejected'] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        student: { select: { name: true, email: true } },
        payments: { select: { paymentReference: true, gatewayReference: true, status: true } },
      },
    });

    return rows
      .filter((j) => isShopVisible(j.status))
      .map((j) => {
        const base = {
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
          student: j.student ?? null,
        };
        const paid = j.payments.find((p) => p.status === 'success') ?? j.payments[0];
        return { ...base, paymentReference: paid?.gatewayReference ?? paid?.paymentReference ?? null };
      });
  } catch {
    return [];
  }
}

export function groupShopJobs(jobs: ShopJob[]) {
  const inBucket = (statuses: JobStatus[]) => jobs.filter((j) => statuses.includes(j.status));
  return {
    new: inBucket(['shop_received']),
    approved: inBucket(['approved']),
    printing: inBucket(['printing', 'printed']),
    ready: inBucket(['ready_for_pickup']),
    completed: inBucket(['completed', 'rejected']),
  };
}

// Keep the Prisma namespace import referenced for future type usage.
export type { Prisma };
