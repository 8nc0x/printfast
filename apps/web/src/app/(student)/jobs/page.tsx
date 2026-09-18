import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { auth } from '@/auth';
import { getStudentJobs, partitionJobs } from '@/lib/data/jobs';
import { JobCard } from '@/components/job-card';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'My jobs' };

export default async function JobsPage() {
  const session = await auth();
  const jobs = await getStudentJobs(session!.user.id);
  const { active, past, drafts } = partitionJobs(jobs);

  const sections = [
    { title: 'In progress', items: active },
    { title: 'Drafts', items: drafts },
    { title: 'Past orders', items: past },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">My jobs</h1>
        <Link href="/jobs/new">
          <Button size="sm"><Plus className="h-4 w-4" /> New</Button>
        </Link>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No jobs yet"
          description="Upload your first document, arrange the pages, and pay from your phone."
          action={
            <Link href="/jobs/new">
              <Button>
                <Plus className="h-4 w-4" /> New print job
              </Button>
            </Link>
          }
        />
      ) : (
        sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">{section.title}</h2>
            <div className="space-y-2">
              {section.items.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
