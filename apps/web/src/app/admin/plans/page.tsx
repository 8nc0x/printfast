import { db } from '@/lib/db';
import { PlanEditor } from './plan-editor';

export const metadata = { title: 'Admin — Plans' };

export default async function AdminPlansPage() {
  const plans = await db().subscriptionPlan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Subscription plans</h1>
        <p className="text-sm text-muted-foreground">
          Prices, features, and limits are data — not code. Changes apply to new subscriptions immediately.
        </p>
      </div>
      <PlanEditor
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          trialDays: p.trialDays,
          features: (p.features as Record<string, unknown>) ?? {},
          isActive: p.isActive,
          subscribers: p._count.subscriptions,
        }))}
      />
    </div>
  );
}
