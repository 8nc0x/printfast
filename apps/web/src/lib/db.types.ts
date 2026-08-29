/**
 * Hand-maintained row types for the Postgres schema (supabase/migrations).
 * When the schema stabilizes, replace with generated types via `supabase gen types`.
 *
 * NOTE: these are `type` aliases, not interfaces. Object-literal type aliases get an
 * implicit index signature and so satisfy postgrest-js's `Record<string, unknown>`
 * GenericTable constraint; interfaces do not, which would collapse the typed client.
 */
import type {
  UserRole,
  JobStatus,
  PaymentStatus,
  PaperSize,
  Orientation,
  BindingType,
  FileKind,
  JobDocument,
} from '@printflow/shared';

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  password_hash: string | null;
  image: string | null;
  created_at: string;
  updated_at: string;
};

export type ShopRow = {
  id: string;
  name: string;
  address: string | null;
  owner_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ShopSettingsRow = {
  shop_id: string;
  price_bw_page: number;
  price_color_page: number;
  paper_multiplier: Record<PaperSize, number>;
  binding_price: Record<BindingType, number>;
  currency: string;
  accepting_orders: boolean;
  updated_at: string;
};

export type PrintJobRow = {
  id: string;
  order_number: string;
  student_id: string;
  shop_id: string;
  status: JobStatus;
  document: JobDocument;
  total_pages: number;
  color_pages: number;
  bw_pages: number;
  copies: number;
  paper_size: PaperSize;
  orientation: Orientation;
  binding: BindingType;
  price_amount: number | null;
  final_pdf_path: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type JobFileRow = {
  id: string;
  job_id: string;
  kind: FileKind;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  sort_order: number;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  job_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  payment_reference: string | null;
  gateway_reference: string | null;
  raw_callback: unknown;
  created_at: string;
  updated_at: string;
};
