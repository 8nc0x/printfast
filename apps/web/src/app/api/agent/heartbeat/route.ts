import { NextResponse } from 'next/server';
import { heartbeatSchema } from '@printflow/shared';
import { requireAgent } from '@/lib/agent-auth';
import { db } from '@/lib/db';
import type { Prisma } from '@printflow/db';

export const runtime = 'nodejs';

/**
 * Agent heartbeat: reports the machine's printers + capabilities. Upserts
 * PrinterConfig rows so the shop panel shows live online/offline state.
 */
export async function POST(req: Request) {
  let agent;
  try {
    agent = await requireAgent(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = heartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  await db().agent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date(), version: req.headers.get('x-agent-version') ?? agent.version },
  });

  for (const printer of parsed.data.printers) {
    const data = {
      isDefault: printer.isDefault,
      lastStatus: printer.status,
      capabilities: printer.caps as unknown as Prisma.InputJsonValue,
      lastSeenAt: new Date(),
    };
    await db().printerConfig.upsert({
      where: { shopId_printerName: { shopId: agent.shopId, printerName: printer.name } },
      create: { shopId: agent.shopId, agentId: agent.id, printerName: printer.name, ...data },
      update: { ...data, agentId: agent.id },
    });
  }

  return NextResponse.json({ ok: true });
}
