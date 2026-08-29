import { auth } from '@/auth';
import { getStudentJobs, partitionJobs } from '@/lib/data/jobs';
import { JobCard } from '@/components/job-card';

export const metadata = { title: 'Reorder' };

export default async function ReorderPage() {
  const session = await auth();
  const { past } = partitionJobs(await getStudentJobs(session!.user.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reorder</h1>
        <p className="text-sm text-muted-foreground">
          Past orders you can duplicate and submit again.
        </p>
      </div>
      {past.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No past orders yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {past.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
