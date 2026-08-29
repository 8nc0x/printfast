import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PrintJobRow } from '@/lib/db.types';

/** Jobs for a student, newest first. Returns [] if storage isn't reachable. */
export async function getStudentJobs(studentId: string): Promise<PrintJobRow[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('print_jobs')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data as PrintJobRow[]) ?? [];
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
