import 'server-only';
import type { JobStatus } from '@printflow/shared';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
    await supabaseAdmin().from('audit_logs').insert({
      actor_id: entry.actorId ?? null,
      job_id: entry.jobId ?? null,
      action: entry.action,
      from_status: entry.fromStatus,
      to_status: entry.toStatus,
      metadata: entry.metadata ?? {},
    } as never);
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
    await supabaseAdmin().from('notifications').insert({
      user_id: entry.userId,
      job_id: entry.jobId ?? null,
      type: entry.type,
      channel: entry.channel ?? 'push',
      payload: entry.payload ?? {},
    } as never);
  } catch {
    /* swallow */
  }
}
