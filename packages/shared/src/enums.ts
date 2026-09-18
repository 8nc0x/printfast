/**
 * Canonical enums shared by web + desktop + database.
 * Keep these in exact sync with the Postgres enums in supabase/migrations.
 */

export const USER_ROLES = ['student', 'shop_owner', 'admin', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Job lifecycle — order matters: dashboard visibility is a threshold on this list. */
export const JOB_STATUSES = [
  'draft',
  'configured',
  'payment_pending',
  'paid',
  'shop_received',
  'approved',
  'printing',
  'printed',
  'ready_for_pickup',
  'completed',
  'rejected',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** The shop may only ever see jobs at or beyond this status. */
export const SHOP_VISIBLE_FROM: JobStatus = 'shop_received';

/** Numeric rank for threshold comparisons (rejected handled separately). */
export function statusRank(status: JobStatus): number {
  return JOB_STATUSES.indexOf(status);
}

/** Is this job visible to the shop? (paid + not still upstream, excluding rejected pre-payment). */
export function isShopVisible(status: JobStatus): boolean {
  if (status === 'rejected') return true; // rejected jobs were already paid + received
  return statusRank(status) >= statusRank(SHOP_VISIBLE_FROM);
}

export const PAYMENT_STATUSES = ['pending', 'success', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAPER_SIZES = ['A4', 'A3'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const BINDING_TYPES = ['none', 'staple', 'spiral'] as const;
export type BindingType = (typeof BINDING_TYPES)[number];

export const FILE_KINDS = ['pdf', 'image'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const PAGE_COLORS = ['color', 'bw'] as const;
export type PageColor = (typeof PAGE_COLORS)[number];

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

/** Allowed upload MIME types (validated server-side against magic bytes too). */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB/file
export const MAX_JOB_BYTES = 100 * 1024 * 1024; // 100 MB/job

/** Valid forward transitions of the job state machine. */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['configured'],
  configured: ['draft', 'payment_pending'],
  payment_pending: ['paid', 'configured'], // back to configured on failed/cancelled payment
  paid: ['shop_received'],
  shop_received: ['approved', 'rejected'],
  approved: ['printing'],
  printing: ['printed'],
  printed: ['ready_for_pickup'],
  ready_for_pickup: ['completed'],
  completed: [],
  rejected: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}
