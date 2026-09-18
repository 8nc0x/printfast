import { NextResponse } from 'next/server';
import { printEventSchema, canTransition, type JobStatus } from '@printflow/shared';
import { requireAgent } from '@/lib/agent-auth';
import { db } from '@/lib/db';
import { audit, notify } from '@/lib/data/audit';

export const runtime = 'nodejs';

const EVENT_TO_STATUS: Record<string, JobStatus> = {
  PRINTING: 'printing',
  PRINTED: 'printed',
  PRINT_FAILED: 'printed', // job advanced; failure reason stored on the job
};

/** Agent reports print progress. Validates transitions against the state machine. */
export async function POST(req: Request) {
  let agent;
  try {
    agent = await requireAgent(req);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = printEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  const event = parsed.data;

  const job = await db().printJob.findFirst({
    where: { id: event.printJobId, shopId: agent.shopId },
    select: { id: true, status: true, studentId: true, orderNumber: true },
  });
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const target = EVENT_TO_STATUS[event.status];
  if (!target) return NextResponse.json({ error: 'unknown status' }, { status: 400 });

  if (canTransition(job.status, target)) {
    await db().printJob.update({
      where: { id: job.id },
      data: {
        status: target,
        ...(event.status === 'PRINT_FAILED' && event.error ? { lastError: event.error.slice(0, 500) } : {}),
      },
    });
    await audit({
      actorId: agent.id,
      jobId: job.id,
      action: `agent_${event.status.toLowerCase()}`,
      fromStatus: job.status,
      toStatus: target,
      metadata: { printer: event.printerName, error: event.error },
    });

    if (event.status === 'PRINTED') {
      await notify({ userId: job.studentId, jobId: job.id, type: 'printing_done', payload: { orderNumber: job.orderNumber } });
    }
    if (event.status === 'PRINT_FAILED') {
      await notify({ userId: job.studentId, jobId: job.id, type: 'print_failed', payload: { orderNumber: job.orderNumber } });
    }
  }

  // Always 200 — the agent shouldn't retry status reports.
  return NextResponse.json({ ok: true });
}
