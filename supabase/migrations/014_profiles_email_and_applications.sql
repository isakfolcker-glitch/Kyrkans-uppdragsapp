-- Fångar upp två ändringar som fanns i produktionsdatabasen men aldrig
-- sparades som migrationsfiler (troligen gjorda direkt i Supabase-dashboarden):
-- 1. profiles.email, som migration 005 och 010 redan förutsätter finns.
-- 2. applications-tabellen för "ansök om att bli ideell"-flödet.
-- Utan denna fil går det inte att bygga upp databasen från noll.

alter table profiles add column if not exists email text;

create table if not exists applications (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  birth_year INT,
  church_id INT REFERENCES churches(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

alter table applications enable row level security;

create policy "applications_insert_public" on applications for insert
  with check (status = 'pending');
create policy "applications_select_admin" on applications for select
  using (is_admin());
create policy "applications_update_admin" on applications for update
  using (is_admin());
create policy "applications_delete_admin" on applications for delete
  using (is_admin());
