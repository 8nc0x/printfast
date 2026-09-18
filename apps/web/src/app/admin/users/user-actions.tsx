'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { adminUserAction } from './actions';

export function UserActions({
  userId,
  isBanned,
  role,
}: {
  userId: string;
  isBanned: boolean;
  role: string;
}) {
  const [pending, start] = useTransition();

  if (role === 'super_admin') return null; // never ban super admins

  return (
    <Button
      size="sm"
      variant={isBanned ? 'outline' : 'destructive'}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await adminUserAction(userId, isBanned ? 'unban' : 'ban');
        })
      }
    >
      {isBanned ? 'Unban' : 'Ban'}
    </Button>
  );
}
