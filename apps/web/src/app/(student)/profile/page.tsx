import { auth } from '@/auth';
import { signOutAction } from '@/app/account-actions';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const session = await auth();
  const user = session!.user;

  const rows: [string, string][] = [
    ['Name', user.name ?? '—'],
    ['Email', user.email ?? '—'],
    ['Role', user.role === 'shop_owner' ? 'Shop owner' : 'Student'],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Profile</h1>

      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <form action={signOutAction}>
        <Button variant="outline" className="w-full" type="submit">Sign out</Button>
      </form>
    </div>
  );
}
