-- Row Level Security — defense in depth.
-- Primary access control is enforced in the API layer (service role bypasses RLS),
-- but these policies protect against any client using the anon key directly.
--
-- Auth model: Auth.js issues sessions; when using Supabase client auth, auth.uid()
-- maps to users.id. Server code uses the service role and is unaffected by these.

alter table users         enable row level security;
alter table print_jobs    enable row level security;
alter table job_files     enable row level security;
alter table job_pages     enable row level security;
alter table payments      enable row level security;
alter table notifications enable row level security;
alter table shops         enable row level security;
alter table shop_settings enable row level security;

-- Helper: is the current auth user a shop owner?
create or replace function is_shop_owner()
returns boolean language sql stable as $$
  select exists (
    select 1 from users u where u.id = auth.uid() and u.role = 'shop_owner'
  );
$$;

-- users: a user can read/update only their own row
create policy users_self_select on users
  for select using (id = auth.uid());
create policy users_self_update on users
  for update using (id = auth.uid());

-- shops + settings: readable by everyone (public shop list); writable only by owner
create policy shops_public_read on shops for select using (true);
create policy shop_settings_public_read on shop_settings for select using (true);

-- print_jobs: students see their own; shop owners see paid+ jobs for their shop
create policy jobs_student_select on print_jobs
  for select using (student_id = auth.uid());
create policy jobs_shop_select on print_jobs
  for select using (
    is_shop_owner()
    and status not in ('draft','configured','payment_pending')
  );
create policy jobs_student_write on print_jobs
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

-- job_files / job_pages: follow their parent job
create policy job_files_owner on job_files
  for select using (
    exists (select 1 from print_jobs j where j.id = job_files.job_id and j.student_id = auth.uid())
  );
create policy job_pages_owner on job_pages
  for select using (
    exists (select 1 from print_jobs j where j.id = job_pages.job_id and j.student_id = auth.uid())
  );

-- payments: student can read their own job's payments
create policy payments_owner on payments
  for select using (
    exists (select 1 from print_jobs j where j.id = payments.job_id and j.student_id = auth.uid())
  );

-- notifications: user reads their own
create policy notifications_owner on notifications
  for select using (user_id = auth.uid());
