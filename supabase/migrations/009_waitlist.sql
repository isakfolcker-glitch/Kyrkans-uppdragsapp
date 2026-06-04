-- Waitlist table
create table if not exists waitlist (
  id          bigserial primary key,
  pass_id     bigint      not null references passes(id) on delete cascade,
  profile_id  uuid        not null references profiles(id) on delete cascade,
  name        text        not null,
  mail        text        not null,
  created_at  timestamptz not null default now(),
  unique(pass_id, profile_id)
);

alter table waitlist enable row level security;

-- Users can see their own waitlist entries
create policy "waitlist_select_own" on waitlist
  for select using (profile_id = auth.uid());

-- Admins can see all waitlist entries for their church
create policy "waitlist_select_admin" on waitlist
  for select using (
    exists (
      select 1 from profiles where id = auth.uid()
        and admin_level in ('forsamling','pastorat','super')
    )
  );

-- Users can join waitlist
create policy "waitlist_insert_own" on waitlist
  for insert with check (profile_id = auth.uid());

-- Users can leave waitlist, admins can remove anyone
create policy "waitlist_delete" on waitlist
  for delete using (
    profile_id = auth.uid() or
    exists (
      select 1 from profiles where id = auth.uid()
        and admin_level in ('forsamling','pastorat','super')
    )
  );
