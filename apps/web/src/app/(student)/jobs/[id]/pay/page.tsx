import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getShopPricing } from '@/lib/data/job-service';
import { jobDocumentSchema, quote } from '@printflow/shared';
import type { PrintJobRow } from '@/lib/db.types';
import { PayPanel } from './pay-panel';

export const metadata = { title: 'Payment' };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const { data } = await supabaseAdmin()
    .from('print_jobs')
    .select('*')
    .eq('id', id)
    .eq('student_id', session!.user.id)
    .maybeSingle();
  const job = data as PrintJobRow | null;
  if (!job) notFound();

  // Already paid → show the order.
  if (job.is_locked || ['paid', 'shop_received', 'approved', 'printing', 'printed', 'ready_for_pickup', 'completed'].includes(job.status)) {
    redirect(`/jobs/${id}`);
  }

  const doc = jobDocumentSchema.parse(job.document);
  if (doc.pages.length === 0) redirect(`/jobs/${id}/edit`);

  const pricing = await getShopPricing(job.shop_id);
  const breakdown = quote(doc, pricing);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review & pay</h1>
        <p className="text-sm text-muted-foreground">Confirm your order before payment.</p>
      </div>
      <PayPanel jobId={id} breakdown={breakdown} orderNumber={job.order_number} />
    </div>
  );
}
