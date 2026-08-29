import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getJobWithSources } from '@/lib/data/job-detail';
import { getShopPricing } from '@/lib/data/job-service';
import { jobDocumentSchema } from '@printflow/shared';
import { Editor } from '@/components/editor/editor';

export const metadata = { title: 'Arrange pages' };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const data = await getJobWithSources(id, session!.user.id);
  if (!data) notFound();

  // Paid jobs are locked — no editing.
  if (data.job.is_locked) redirect(`/jobs/${id}`);

  const document = jobDocumentSchema.parse(data.job.document);
  const pricing = await getShopPricing(data.job.shop_id);

  return (
    <Editor
      jobId={id}
      initialDocument={document}
      initialSources={data.sources}
      pricing={pricing}
    />
  );
}
