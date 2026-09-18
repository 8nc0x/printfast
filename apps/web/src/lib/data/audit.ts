import 'server-only';
import type { JobStatus } from '@printflow/shared';
import { db } from '@/lib/db';

/** Append an audit log row. Best-effort — never blocks the primary action. */
export async function audit(entry: {
  actorId?: string | null;
  jobId?: string | null;
  action: string;
  fromStatus?: JobStatus;
  toStatus?: JobStatus;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db().auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        jobId: entry.jobId ?? null,
        action: entry.action,
        fromStatus: entry.fromStatus ?? null,
        toStatus: entry.toStatus ?? null,
        metadata: (entry.metadata ?? {}) as object,
      },
    });
  } catch {
    /* swallow — auditing must not break the request */
  }
}

/** Queue a notification row (delivery wired later). Best-effort. */
export async function notify(entry: {
  userId: string;
  jobId?: string | null;
  type: string;
  channel?: 'push' | 'email';
  payload?: Record<string, unknown>;
}) {
  try {
    await db().notification.create({
      data: {
        userId: entry.userId,
        jobId: entry.jobId ?? null,
        type: entry.type,
        channel: entry.channel ?? 'push',
        payload: (entry.payload ?? {}) as object,
      },
    });
  } catch {
    /* swallow */
  }
}
