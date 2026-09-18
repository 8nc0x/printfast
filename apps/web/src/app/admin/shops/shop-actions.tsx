'use client';

import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adminShopAction } from './actions';

export function ShopActions({
  shopId,
  status,
  isActive,
}: {
  shopId: string;
  status: string;
  isActive: boolean;
}) {
  const [pending, start] = useTransition();

  function act(action: 'approve' | 'suspend' | 'activate') {
    start(async () => {
      await adminShopAction(shopId, action);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
        {status}
      </span>
      {status === 'PENDING_APPROVAL' && (
        <Button size="sm" onClick={() => act('approve')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Approve
        </Button>
      )}
      {isActive && status !== 'SUSPENDED' && (
        <Button size="sm" variant="outline" onClick={() => act('suspend')} disabled={pending}>
          Suspend
        </Button>
      )}
      {!isActive && (
        <Button size="sm" variant="outline" onClick={() => act('activate')} disabled={pending}>
          Activate
        </Button>
      )}
    </div>
  );
}
