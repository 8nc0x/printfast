import Link from 'next/link';
import { Plus, ArrowRight } from 'lucide-react';
import { auth } from '@/auth';
import { getStudentJobs, partitionJobs } from '@/lib/data/jobs';
import { JobCard } from '@/components/job-card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Home' };

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';
  const jobs = await getStudentJobs(session!.user.id);
  const { drafts, active } = partitionJobs(jobs);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hi, {firstName}</h1>
        <p className="text-sm text-muted-foreground">What are we printing today?</p>
      </div>

      <Link
        href="/jobs/new"
        className="flex items-center justify-between rounded-lg bg-primary p-4 text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15">
            <Plus className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium">New print job</span>
            <span className="block text-sm text-primary-foreground/80">Upload, arrange, and pay</span>
          </span>
        </span>
        <ArrowRight className="h-5 w-5" />
      </Link>

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">In progress</h2>
          <div className="space-y-2">
            {active.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Drafts</h2>
            <Link href="/drafts" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {drafts.slice(0, 3).map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {jobs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No jobs yet. Start your first print above.
          </p>
        </div>
      )}

      <div className="flex justify-center pt-2">
        <Link href="/jobs">
          <Button variant="ghost" size="sm">See all my jobs</Button>
        </Link>
      </div>
    </div>
  );
}
