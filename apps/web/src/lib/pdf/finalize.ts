import 'server-only';
import { jobDocumentSchema } from '@printflow/shared';
import { db } from '@/lib/db';
import { downloadBytes, uploadBytes, finalPath } from '@/lib/storage';
import { generateFinalPdf } from './generate';
import type { Prisma } from '@printflow/db';

/**
 * Generate the final print-ready PDF for a job and store it permanently under
 * the `finals` bucket. Sets print_jobs.final_pdf_path. Returns the storage path.
 * Called after payment succeeds — this PDF is the source of truth the shop prints.
 */
export async function generateAndStoreFinalPdf(jobId: string): Promise<string> {
  const job = await db().printJob.findUnique({
    where: { id: jobId },
    include: { files: { select: { id: true, storagePath: true } } },
  });
  if (!job) throw new Error('Job not found');

  const pathByFile = new Map(job.files.map((f) => [f.id, f.storagePath]));
  const doc = jobDocumentSchema.parse(job.document);

  const bytes = await generateFinalPdf(doc, async (fileId) => {
    const path = pathByFile.get(fileId);
    if (!path) throw new Error(`Missing source file ${fileId}`);
    return downloadBytes('originals', path);
  });

  const path = finalPath(job.studentId, jobId);
  await uploadBytes('finals', path, bytes, 'application/pdf');
  await db().printJob.update({ where: { id: jobId }, data: { finalPdfPath: path } });

  // Compile the print groups the Windows agent will execute (Phase 5).
  const { compileGroups } = await import('./groups');
  await compileGroups(jobId, doc);

  return path;
}

// Type-only helper re-export to keep the Prisma namespace import intentional.
export type JobWithFiles = Prisma.PrintJobGetPayload<{ include: { files: true } }>;
