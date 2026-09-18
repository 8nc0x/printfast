'use server';

import { revalidatePath } from 'next/cache';
import { resolveShopId } from '@/lib/data/shop-context';
import { createPairingToken } from '@/lib/agent-auth';
import { db } from '@/lib/db';

export async function createPairingAction(): Promise<{ code?: string; error?: string }> {
  try {
    const shopId = await resolveShopId();
    if (!shopId) throw new Error('No shop configured');

    // Plan gate: max printers/agents per subscription.
    const { getShopFeatures } = await import('@/lib/subscriptions');
    const features = await getShopFeatures(shopId);
    const agentCount = await db().agent.count({ where: { shopId, status: 'active' } });
    if (agentCount >= Math.max(1, features.printers)) {
      throw new Error(`Your plan allows ${features.printers} agent(s). Upgrade to add more.`);
    }

    const token = await createPairingToken(shopId);
    return { code: token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function revokeAgentAction(agentId: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const shopId = await resolveShopId();
    if (!shopId) throw new Error('No shop configured');

    const { count } = await db().agent.updateMany({
      where: { id: agentId, shopId },
      data: { status: 'revoked', agentTokenHash: null, pairingToken: null },
    });
    if (count === 0) throw new Error('Agent not found');

    revalidatePath('/shop/printers');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}
