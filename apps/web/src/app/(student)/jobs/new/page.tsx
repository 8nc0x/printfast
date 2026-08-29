import { Uploader } from './uploader';

export const metadata = { title: 'New print job' };

export default function NewJobPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New print job</h1>
        <p className="text-sm text-muted-foreground">Add your files, then arrange and set options.</p>
      </div>
      <Uploader />
    </div>
  );
}
