-- PrintFlow initial schema
-- Matches packages/shared/src/enums.ts and geometry.ts. Keep in sync.

-- ---------- extensions ----------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------- enums ----------
create type user_role     as enum ('student','shop_owner');
create type job_status    as enum ('draft','configured','payment_pending','paid',
                                    'shop_received','approved','printing','printed',
                                    'ready_for_pickup','completed','rejected');
create type payment_status as enum ('pending','success','failed','refunded');
create type paper_size     as enum ('A4','A3');
create type orientation    as enum ('portrait','landscape');
create type binding_type   as enum ('none','staple','spiral');
create type file_kind      as enum ('pdf','image');

-- ---------- updated_at trigger ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ---------- users ----------
create table users (
  id            uuid primary key,               -- = auth user id (Auth.js/Supabase)
  email         text unique not null,
  name          text,
  role          user_role not null default 'student',
  password_hash text,                            -- null for OAuth-only accounts
  image         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();

-- ---------- shops ----------
create table shops (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  owner_id   uuid references users(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_shops_updated before update on shops
  for each row execute function set_updated_at();

-- ---------- shop_settings (pricing config lives here) ----------
create table shop_settings (
  shop_id          uuid primary key references shops(id) on delete cascade,
  price_bw_page    numeric(10,2) not null default 2.00,
  price_color_page numeric(10,2) not null default 10.00,
  paper_multiplier jsonb not null default '{"A4":1,"A3":2}',
  binding_price    jsonb not null default '{"none":0,"staple":5,"spiral":30}',
  currency         text not null default 'INR',
  accepting_orders boolean not null default true,
  updated_at       timestamptz not null default now()
);
create trigger trg_shop_settings_updated before update on shop_settings
  for each row execute function set_updated_at();

-- ---------- print_jobs ----------
create table print_jobs (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique not null,          -- human token + pickup token
  student_id     uuid not null references users(id) on delete cascade,
  shop_id        uuid not null references shops(id),
  status         job_status not null default 'draft',
  document       jsonb not null default '{"version":1,"pages":[],"settings":{"paperSize":"A4","orientation":"portrait","copies":1,"binding":"none"}}',
  total_pages    int not null default 0,
  color_pages    int not null default 0,
  bw_pages       int not null default 0,
  copies         int not null default 1,
  paper_size     paper_size not null default 'A4',
  orientation    orientation not null default 'portrait',
  binding        binding_type not null default 'none',
  price_amount   numeric(10,2),
  final_pdf_path text,
  is_locked      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_jobs_student on print_jobs (student_id, created_at desc);
create index idx_jobs_shop_status on print_jobs (shop_id, status);
create index idx_jobs_status on print_jobs (status);
create trigger trg_jobs_updated before update on print_jobs
  for each row execute function set_updated_at();

-- ---------- job_files (original uploads) ----------
create table job_files (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references print_jobs(id) on delete cascade,
  kind         file_kind not null,
  storage_path text not null,
  filename     text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  page_count   int,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index idx_job_files_job on job_files (job_id);

-- ---------- job_pages (materialized final page order + thumbnails) ----------
create table job_pages (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references print_jobs(id) on delete cascade,
  page_index   int not null,
  source_file  uuid references job_files(id) on delete cascade,
  source_page  int,
  rotation     int not null default 0,
  color        text not null default 'bw',
  preview_path text,
  created_at   timestamptz not null default now(),
  unique (job_id, page_index)
);
create index idx_job_pages_job on job_pages (job_id, page_index);

-- ---------- payments ----------
create table payments (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references print_jobs(id) on delete cascade,
  amount            numeric(10,2) not null,
  currency          text not null default 'INR',
  status            payment_status not null default 'pending',
  provider          text not null default 'custom',
  payment_reference text,
  gateway_reference text,
  raw_callback      jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_payments_job on payments (job_id);
create unique index idx_payments_gateway_ref on payments (gateway_reference)
  where gateway_reference is not null;
create trigger trg_payments_updated before update on payments
  for each row execute function set_updated_at();

-- ---------- printer_config ----------
create table printer_config (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  printer_name text not null,
  is_default   boolean not null default false,
  last_status  text,
  updated_at   timestamptz not null default now()
);
create index idx_printer_shop on printer_config (shop_id);
create trigger trg_printer_updated before update on printer_config
  for each row execute function set_updated_at();

-- ---------- notifications ----------
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  job_id     uuid references print_jobs(id) on delete cascade,
  type       text not null,
  channel    text not null default 'push',
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on notifications (user_id, read_at);

-- ---------- audit_logs ----------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id) on delete set null,
  job_id      uuid references print_jobs(id) on delete set null,
  action      text not null,
  from_status job_status,
  to_status   job_status,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index idx_audit_job on audit_logs (job_id, created_at);
