import 'server-only';
import { db } from '@/lib/db';
import type { PrintJobRow } from '@/lib/db.types';
import type { Prisma } from '@printflow/db';

/** Map a Prisma PrintJob to the app's PrintJobRow shape (API stays stable). */
export function toPrintJobRow(j: Prisma.PrintJobGetPayload<{ include: { student: true } }>): PrintJobRow {
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
    student: j.student ? { name: j.student.name, email: j.student.email } : null,
  };
}

/** Jobs for a student, newest first. Returns [] if the DB isn't reachable. */
export async function getStudentJobs(studentId: string): Promise<PrintJobRow[]> {
  try {
    const rows = await db().printJob.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: { student: true },
    });
    return rows.map(toPrintJobRow);
  } catch {
    return [];
  }
}

export function partitionJobs(jobs: PrintJobRow[]) {
  const drafts = jobs.filter((j) => j.status === 'draft' || j.status === 'configured');
  const active = jobs.filter(
    (j) => !['draft', 'configured', 'completed', 'rejected'].includes(j.status),
  );
  const past = jobs.filter((j) => j.status === 'completed' || j.status === 'rejected');
  return { drafts, active, past };
}
