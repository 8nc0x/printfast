import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Printer,
  ArrowRight,
  QrCode,
  CreditCard,
  FileCheck2,
  ShieldCheck,
  Store,
  Wallet,
} from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const STEPS = [
  {
    icon: QrCode,
    title: 'Scan or open a shop',
    description: 'Scan the shop QR or open their PrintPass page. The shop is auto-selected — no searching.',
  },
  {
    icon: FileCheck2,
    title: 'Upload & arrange',
    description: 'PDFs and images. Reorder, rotate, delete pages, and set color, duplex, and copies per group.',
  },
  {
    icon: CreditCard,
    title: 'Pay from your phone',
    description: 'UPI checkout with a live QR. Fixed price up front — no counter haggling.',
  },
  {
    icon: Printer,
    title: 'One-click print',
    description: 'The shop gets your job instantly with every setting attached. Track it until it is ready.',
  },
];

const FEATURES = [
  {
    icon: Store,
    title: 'Whole-shop ecosystem',
    description: 'Printing, stationery, and services in one catalog — not just PDFs.',
  },
  {
    icon: Wallet,
    title: 'Referral rewards',
    description: 'Earn wallet credit when friends you referred make their first transaction.',
  },
  {
    icon: ShieldCheck,
    title: 'Payment-verified jobs',
    description: 'The shop only ever receives jobs that are paid. Your documents stay private.',
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect(
      ['shop_owner', 'admin', 'super_admin'].includes(session.user.role)
        ? '/shop/orders'
        : '/dashboard',
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Printer className="h-4 w-4" />
            </span>
            PrintFlow
          </span>
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#shops" className="transition-colors hover:text-foreground">For shops</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="container py-16 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge variant="secondary" className="mb-4">
                <QrCode className="mr-1 h-3 w-3" /> Scan → Upload → Pay → Print
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Print without the queue.
              </h1>
              <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
                Upload your files, arrange the pages exactly how you want them, pay from your
                phone, and pick up when it&rsquo;s ready. No waiting at the counter.
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

            {/* Mock job card — shows the product, not a screenshot */}
            <div className="relative mx-auto w-full max-w-sm">
              <Card variant="interactive">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">PP-1042</span>
                    <Badge variant="success">Ready for pickup</Badge>
                  </div>
                  <Separator />
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">assignment.pdf · 12 pages</span>
                      <span>A4 · B&amp;W</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">notes.pdf · 4 pages</span>
                      <span>A4 · Color</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Paid via UPI</span>
                    <span className="font-semibold">₹31.00</span>
                  </div>
                  <div className="rounded-lg bg-primary-weak p-3 text-center text-sm font-medium text-primary">
                    Pickup code · <span className="font-mono text-base tracking-widest">4821</span>
                  </div>
                </CardContent>
              </Card>
              <div
                aria-hidden
                className="absolute -right-3 -top-3 h-24 w-24 rounded-xl border bg-background p-2 shadow-md sm:-right-6"
              >
                <div className="grid h-full w-full grid-cols-5 grid-rows-5 gap-[2px]">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div key={i} className={(i * 7) % 3 ? 'bg-foreground/80' : 'bg-transparent'} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-border bg-muted/40 py-16 sm:py-20">
          <div className="container">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
            <p className="mt-2 max-w-lg text-muted-foreground">
              Four steps, under a minute from file to printed page.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Card key={s.title}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-weak text-primary">
                        <s.icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        Step {i + 1}
                      </span>
                    </div>
                    <h3 className="mt-4 font-medium">{s.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{s.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border py-16 sm:py-20">
          <div className="container">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              More than printing
            </h2>
            <p className="mt-2 max-w-lg text-muted-foreground">
              PrintFlow is a full operating system for stationery shops — printing is just the
              start.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title}>
                  <CardContent className="p-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-weak text-primary">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-medium">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{f.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* For shops */}
        <section id="shops" className="border-t border-border bg-muted/40 py-16 sm:py-20">
          <div className="container flex flex-col items-center text-center">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Run your stationery shop on PrintFlow
            </h2>
            <p className="mt-3 max-w-lg text-muted-foreground">
              A digital catalog, unified orders, one-click printing via the Windows agent, QR
              posters, inventory, and analytics — from ₹99/month.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/register?role=shop">
                <Button size="lg">
                  List your shop <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">Shop sign in</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="container flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
          <span>PrintFlow · Campus Print Shop</span>
          <span>Built for the queue you never wait in.</span>
        </div>
      </footer>
    </div>
  );
}
