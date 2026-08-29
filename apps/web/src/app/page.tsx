import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Printer, ArrowRight } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === 'shop_owner' ? '/shop/orders' : '/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Printer className="h-4 w-4" />
            </span>
            PrintFlow
          </span>
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      <main className="container flex flex-1 flex-col justify-center py-16">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Print without the queue.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Upload your files, arrange the pages exactly how you want them, pay from your phone,
            and pick up when it&rsquo;s ready. No waiting at the counter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register">
              <Button size="lg">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">I have an account</Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {[
            { n: '1', t: 'Upload & arrange', d: 'PDFs and images. Reorder, rotate, and set color per page.' },
            { n: '2', t: 'Pay ahead', d: 'A fixed price up front. Your order locks and heads to the shop.' },
            { n: '3', t: 'Pick up', d: 'Get a pickup code. Collect when the shop marks it ready.' },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border border-border p-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-weak text-sm font-medium text-primary">
                {s.n}
              </div>
              <h3 className="mt-3 font-medium">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <div className="container text-sm text-muted-foreground">
          PrintFlow · Campus Print Shop
        </div>
      </footer>
    </div>
  );
}
