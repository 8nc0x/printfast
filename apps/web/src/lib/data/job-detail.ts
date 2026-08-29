import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { signedUrl } from '@/lib/supabase/storage';
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
  const db = supabaseAdmin();
  const { data: jobData } = await db
    .from('print_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('student_id', studentId)
    .maybeSingle();
  const job = jobData as PrintJobRow | null;
  if (!job) return null;

  const { data: fileData } = await db.from('job_files').select('*').eq('job_id', jobId);
  const files = (fileData as JobFileRow[]) ?? [];

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

  return { job, sources };
}
