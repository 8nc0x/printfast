-- Private storage buckets. All access is via server-minted signed URLs.
insert into storage.buckets (id, name, public)
values
  ('originals', 'originals', false),
  ('finals',    'finals',    false),
  ('previews',  'previews',  false)
on conflict (id) do nothing;

-- No public policies: the service role (server) is the only writer/reader.
-- Clients never touch storage directly; they receive short-lived signed URLs.
