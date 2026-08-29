import { auth } from '@/auth';
import { getStudentJobs, partitionJobs } from '@/lib/data/jobs';
import { JobCard } from '@/components/job-card';

export const metadata = { title: 'Drafts' };

export default async function DraftsPage() {
  const session = await auth();
  const { drafts } = partitionJobs(await getStudentJobs(session!.user.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Saved drafts</h1>
        <p className="text-sm text-muted-foreground">Unpaid jobs you can still edit.</p>
      </div>
      {drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No drafts saved.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
