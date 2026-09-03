-- Fler notistyper: bekräftad anmälan, väntelista, uppflyttning från väntelista
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('reminder','cancelled','new_pass','message','signup','waitlist_joined','waitlist_promoted'));

-- Snabbare uppslag av olästa notiser per användare
create index if not exists idx_notifications_user_created on notifications (user_id, created_at desc);
