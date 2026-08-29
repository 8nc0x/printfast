import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isShopVisible, type JobStatus } from '@printflow/shared';
import type { PrintJobRow, UserRow } from '@/lib/db.types';

export interface ShopJob extends PrintJobRow {
  student: Pick<UserRow, 'name' | 'email'> | null;
  paymentReference: string | null;
}

interface RawShopJob extends PrintJobRow {
  student: Pick<UserRow, 'name' | 'email'> | null;
  payments: { payment_reference: string | null; gateway_reference: string | null; status: string }[] | null;
}

/**
 * Paid jobs for the shop. The query filters to shop-visible statuses so an unpaid
 * job is structurally impossible to return here.
 */
export async function getShopJobs(shopId: string): Promise<ShopJob[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('print_jobs')
      .select(
        '*, student:users!print_jobs_student_id_fkey(name, email), payments(payment_reference, gateway_reference, status)',
      )
      .eq('shop_id', shopId)
      .order('created_at', { ascending: true });
    if (error) return [];
    const rows = (data as unknown as RawShopJob[]) ?? [];
    return rows
      .filter((j) => isShopVisible(j.status))
      .map((j) => {
        const paid = j.payments?.find((p) => p.status === 'success') ?? j.payments?.[0];
        return {
          ...j,
          paymentReference: paid?.gateway_reference ?? paid?.payment_reference ?? null,
        };
      });
  } catch {
    return [];
  }
}

export function groupShopJobs(jobs: ShopJob[]) {
  const inBucket = (statuses: JobStatus[]) => jobs.filter((j) => statuses.includes(j.status));
  return {
    new: inBucket(['shop_received']),
    approved: inBucket(['approved']),
    printing: inBucket(['printing', 'printed']),
    ready: inBucket(['ready_for_pickup']),
    completed: inBucket(['completed', 'rejected']),
  };
}
