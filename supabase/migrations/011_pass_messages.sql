-- Pass Q&A messages
create table if not exists pass_messages (
  id              bigserial primary key,
  pass_id         int         not null references passes(id) on delete cascade,
  author_id       uuid        references auth.users(id) on delete set null,
  author_name     text        not null,
  body            text        not null,
  is_staff_reply  boolean     not null default false,
  created_at      timestamptz not null default now()
);

alter table pass_messages enable row level security;

-- Anyone booked on the pass, or admin/responsible, can read
create policy "pass_messages_select" on pass_messages
  for select using (
    is_admin()
    or is_responsible_for(pass_id)
    or exists (
      select 1 from bookings
      where bookings.pass_id = pass_messages.pass_id
        and bookings.profile_id = auth.uid()
    )
  );

-- Same audience can post
create policy "pass_messages_insert" on pass_messages
  for insert with check (
    author_id = auth.uid()
    and (
      is_admin()
      or is_responsible_for(pass_id)
      or exists (
        select 1 from bookings
        where bookings.pass_id = pass_messages.pass_id
          and bookings.profile_id = auth.uid()
      )
    )
  );

-- Only author or admin can delete
create policy "pass_messages_delete" on pass_messages
  for delete using (
    author_id = auth.uid() or is_admin()
  );
