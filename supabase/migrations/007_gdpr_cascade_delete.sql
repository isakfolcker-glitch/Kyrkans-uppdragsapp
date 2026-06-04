-- Migration 007: GDPR – cascade delete när profil tas bort
-- Säkerställer att all användardata raderas när ett konto tas bort

-- Bookings: radera automatiskt när profilen tas bort
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_profile_id_fkey,
  ADD CONSTRAINT bookings_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Profile groups: radera automatiskt
ALTER TABLE profile_groups
  DROP CONSTRAINT IF EXISTS profile_groups_profile_id_fkey,
  ADD CONSTRAINT profile_groups_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Notif settings: radera automatiskt
ALTER TABLE notif_settings
  DROP CONSTRAINT IF EXISTS notif_settings_profile_id_fkey,
  ADD CONSTRAINT notif_settings_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Pass responsible: radera automatiskt
ALTER TABLE pass_responsible
  DROP CONSTRAINT IF EXISTS pass_responsible_profile_id_fkey,
  ADD CONSTRAINT pass_responsible_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Notifications: radera automatiskt
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
