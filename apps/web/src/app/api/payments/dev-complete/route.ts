import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDevPaymentMode } from '@/lib/payments';
import { processSuccessfulPayment } from '@/lib/payments/process';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PrintJobRow } from '@/lib/db.types';

/**
 * Local-only helper that simulates a successful gateway callback so the PAID flow
 * can be exercised without live credentials. Disabled in production and when a
 * real gateway base URL is configured.
 */
export async function POST(req: Request) {
  if (!isDevPaymentMode()) {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });

  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return NextResponse.json({ ok: false, error: 'jobId required' }, { status: 400 });

  // Ownership check — a student can only complete their own job.
  const { data } = await supabaseAdmin()
    .from('print_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('student_id', session.user.id)
    .maybeSingle();
  if (!(data as PrintJobRow | null)) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  await processSuccessfulPayment(jobId, `DEV-${Date.now()}`, { simulated: true });
  return NextResponse.json({ ok: true });
}
