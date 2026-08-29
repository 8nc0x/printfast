import 'server-only';
import { jobDocumentSchema } from '@printflow/shared';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { downloadBytes, uploadBytes, finalPath } from '@/lib/supabase/storage';
import { generateFinalPdf } from './generate';
import type { PrintJobRow, JobFileRow } from '@/lib/db.types';

/**
 * Generate the final print-ready PDF for a job and store it permanently in the
 * `finals` bucket. Sets print_jobs.final_pdf_path. Returns the storage path.
 * Called after payment succeeds — this PDF is the source of truth the shop prints.
 */
export async function generateAndStoreFinalPdf(jobId: string): Promise<string> {
  const db = supabaseAdmin();

  const { data: jobData } = await db.from('print_jobs').select('*').eq('id', jobId).maybeSingle();
  const job = jobData as PrintJobRow | null;
  if (!job) throw new Error('Job not found');

  const { data: fileData } = await db.from('job_files').select('*').eq('job_id', jobId);
  const files = (fileData as JobFileRow[]) ?? [];
  const pathByFile = new Map(files.map((f) => [f.id, f.storage_path]));

  const doc = jobDocumentSchema.parse(job.document);

  const bytes = await generateFinalPdf(doc, async (fileId) => {
    const path = pathByFile.get(fileId);
    if (!path) throw new Error(`Missing source file ${fileId}`);
    return downloadBytes('originals', path);
  });

  const path = finalPath(job.student_id, jobId);
  await uploadBytes('finals', path, bytes, 'application/pdf');
  await db.from('print_jobs').update({ final_pdf_path: path } as never).eq('id', jobId);

  return path;
}
