/**
 * Minimal Database type for the typed Supabase client. Shapes match
 * supabase/migrations. Insert/Update are permissive (Partial) — the DB applies
 * defaults for ids/timestamps. Replace with `supabase gen types` output later.
 *
 * NOTE: empty schema members MUST be `{}`, not `Record<string, never>`. postgrest-js
 * computes each relation as `Tables & Views`, indexed by table name; a string index
 * signature returning `never` would collapse every table's Insert type to `never`.
 */
import type {
  UserRow,
  ShopRow,
  ShopSettingsRow,
  PrintJobRow,
  JobFileRow,
  PaymentRow,
} from '@/lib/db.types';

type TableFor<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      users: TableFor<UserRow>;
      shops: TableFor<ShopRow>;
      shop_settings: TableFor<ShopSettingsRow>;
      print_jobs: TableFor<PrintJobRow>;
      job_files: TableFor<JobFileRow>;
      payments: TableFor<PaymentRow>;
      job_pages: TableFor<Record<string, unknown>>;
      printer_config: TableFor<Record<string, unknown>>;
      notifications: TableFor<Record<string, unknown>>;
      audit_logs: TableFor<Record<string, unknown>>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
