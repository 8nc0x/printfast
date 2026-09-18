import Link from 'next/link';
import { Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="border-b border-border bg-background">
        <div className="container flex h-14 items-center">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Printer className="h-4 w-4" />
            </span>
            PrintFlow
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
