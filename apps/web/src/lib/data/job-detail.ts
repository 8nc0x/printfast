import 'server-only';
import { db } from '@/lib/db';
import { signedUrl } from '@/lib/storage';
import type { PrintJobRow, JobFileRow } from '@/lib/db.types';

export interface JobSource {
  fileId: string;
  kind: 'pdf' | 'image';
  filename: string;
  url: string; // short-lived signed URL to the original
  pageCount: number;
}

export interface JobWithSources {
  job: PrintJobRow;
  sources: Record<string, JobSource>;
}

/** Load a student's job plus signed URLs for each original file (for the editor). */
export async function getJobWithSources(
  jobId: string,
  studentId: string,
): Promise<JobWithSources | null> {
  const job = await db().printJob.findFirst({
    where: { id: jobId, studentId },
    include: { files: true, student: true },
  });
  if (!job) return null;

  type JobFileLike = (typeof job.files)[number];
  const files = job.files.map((f: JobFileLike): JobFileRow => ({
    id: f.id,
    job_id: f.jobId,
    kind: f.kind,
    storage_path: f.storagePath,
    filename: f.filename,
    mime_type: f.mimeType,
    size_bytes: Number(f.sizeBytes),
    page_count: f.pageCount,
    sort_order: f.sortOrder,
    created_at: f.createdAt.toISOString(),
  }));

  const sources: Record<string, JobSource> = {};
  await Promise.all(
    files.map(async (f) => {
      try {
        const url = await signedUrl('originals', f.storage_path);
        sources[f.id] = {
          fileId: f.id,
          kind: f.kind,
          filename: f.filename,
          url,
          pageCount: f.page_count ?? 1,
        };
      } catch {
        /* skip unreachable file */
      }
    }),
  );

  const row: PrintJobRow = {
    id: job.id,
    order_number: job.orderNumber,
    student_id: job.studentId,
    shop_id: job.shopId,
    status: job.status,
    document: job.document as PrintJobRow['document'],
    total_pages: job.totalPages,
    color_pages: job.colorPages,
    bw_pages: job.bwPages,
    copies: job.copies,
    paper_size: job.paperSize,
    orientation: job.orientation,
    binding: job.binding,
    price_amount: job.priceAmount != null ? Number(job.priceAmount) : null,
    final_pdf_path: job.finalPdfPath,
    is_locked: job.isLocked,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
    student: { name: job.student.name, email: job.student.email },
  };
  return { job: row, sources };
}
