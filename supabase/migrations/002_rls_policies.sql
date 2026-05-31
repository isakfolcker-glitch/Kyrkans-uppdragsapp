-- =====================================================
-- Row Level Security – Kyrkans uppdragsapp
-- =====================================================

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE churches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastorat        ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE passes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_responsible ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notif_settings  ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Hjälpfunktioner för behörighetskontroll
-- =====================================================

-- Hämta nuvarande användares admin_level
CREATE OR REPLACE FUNCTION current_admin_level()
RETURNS TEXT AS $$
  SELECT admin_level FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Hämta nuvarande användares church_id
CREATE OR REPLACE FUNCTION current_church_id()
RETURNS INT AS $$
  SELECT church_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Är nuvarande användare admin (fadmin, padmin eller superadmin)?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT admin_level IN ('forsamling','pastorat','super')
  FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Är ansvarig för ett specifikt pass?
CREATE OR REPLACE FUNCTION is_responsible_for(pass_id_arg INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pass_responsible
    WHERE pass_id = pass_id_arg AND profile_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- =====================================================
-- PROFILES
-- =====================================================
-- Alla inloggade kan se profiler i sin kyrka
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (
    church_id = current_church_id()
    OR current_admin_level() IN ('pastorat','super')
    OR id = auth.uid()
  );

-- Egna profilen kan uppdateras av användaren själv
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Admin kan uppdatera profiler i sin kyrka
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (
    church_id = current_church_id() AND current_admin_level() IN ('forsamling','pastorat','super')
    OR current_admin_level() IN ('pastorat','super')
  );

-- Admin kan skapa profiler
CREATE POLICY "profiles_insert_admin" ON profiles FOR INSERT
  WITH CHECK (is_admin());

-- Admin kan ta bort profiler
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  USING (is_admin());

-- =====================================================
-- CHURCHES
-- =====================================================
CREATE POLICY "churches_select_all" ON churches FOR SELECT USING (true);
CREATE POLICY "churches_modify_admin" ON churches FOR ALL
  USING (current_admin_level() IN ('pastorat','super'));

-- =====================================================
-- PASTORAT
-- =====================================================
CREATE POLICY "pastorat_select_all" ON pastorat FOR SELECT USING (true);
CREATE POLICY "pastorat_modify_super" ON pastorat FOR ALL
  USING (current_admin_level() = 'super');

-- =====================================================
-- GROUPS
-- =====================================================
CREATE POLICY "groups_select_all" ON groups FOR SELECT USING (true);
CREATE POLICY "groups_modify_admin" ON groups FOR ALL
  USING (is_admin());

-- =====================================================
-- PROFILE_GROUPS
-- =====================================================
CREATE POLICY "profile_groups_select" ON profile_groups FOR SELECT
  USING (
    profile_id = auth.uid()
    OR is_admin()
  );
CREATE POLICY "profile_groups_modify_admin" ON profile_groups FOR ALL
  USING (is_admin());

-- =====================================================
-- PASSES
-- =====================================================
-- Ideella ser live-pass i sin kyrka för sina grupper
CREATE POLICY "passes_select_ideell" ON passes FOR SELECT
  USING (
    -- Admin ser allt
    is_admin()
    -- Ansvarig ser sina pass
    OR is_responsible_for(id)
    -- Ideell ser live-pass i sin kyrka
    OR (
      church_id = current_church_id()
      AND pub_status = 'live'
      AND cancelled = false
    )
  );

-- Admin kan skapa pass i sin kyrka
CREATE POLICY "passes_insert_admin" ON passes FOR INSERT
  WITH CHECK (
    is_admin()
    OR (church_id = current_church_id() AND is_responsible_for(0))
  );

-- Admin och ansvarig kan uppdatera pass
CREATE POLICY "passes_update" ON passes FOR UPDATE
  USING (is_admin() OR is_responsible_for(id));

-- Bara admin kan ta bort pass
CREATE POLICY "passes_delete_admin" ON passes FOR DELETE
  USING (is_admin());

-- =====================================================
-- PASS_GROUPS
-- =====================================================
CREATE POLICY "pass_groups_select" ON pass_groups FOR SELECT USING (true);
CREATE POLICY "pass_groups_modify" ON pass_groups FOR ALL
  USING (is_admin() OR is_responsible_for(pass_id));

-- =====================================================
-- PASS_RESPONSIBLE
-- =====================================================
CREATE POLICY "pass_responsible_select" ON pass_responsible FOR SELECT
  USING (is_admin() OR profile_id = auth.uid());
CREATE POLICY "pass_responsible_modify" ON pass_responsible FOR ALL
  USING (is_admin());

-- =====================================================
-- BOOKINGS
-- =====================================================
-- Ideell ser sina egna bokningar
CREATE POLICY "bookings_select_own" ON bookings FOR SELECT
  USING (
    profile_id = auth.uid()
    OR is_admin()
    OR is_responsible_for(pass_id)
  );

-- Ideell kan boka sig själv
CREATE POLICY "bookings_insert_self" ON bookings FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    OR is_admin()
    OR is_responsible_for(pass_id)
  );

-- Admin och ansvarig kan ta bort bokningar
CREATE POLICY "bookings_delete" ON bookings FOR DELETE
  USING (
    profile_id = auth.uid()
    OR is_admin()
    OR is_responsible_for(pass_id)
  );

-- =====================================================
-- PASS_HISTORY
-- =====================================================
CREATE POLICY "pass_history_select" ON pass_history FOR SELECT
  USING (is_admin() OR is_responsible_for(pass_id));
CREATE POLICY "pass_history_insert" ON pass_history FOR INSERT
  WITH CHECK (is_admin() OR is_responsible_for(pass_id));

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
CREATE POLICY "notifications_own" ON notifications FOR ALL
  USING (user_id = auth.uid());

-- =====================================================
-- MESSAGE_LOGS
-- =====================================================
CREATE POLICY "message_logs_select" ON message_logs FOR SELECT
  USING (is_admin());
CREATE POLICY "message_logs_insert" ON message_logs FOR INSERT
  WITH CHECK (is_admin());

-- =====================================================
-- NOTIF_SETTINGS
-- =====================================================
CREATE POLICY "notif_settings_own" ON notif_settings FOR ALL
  USING (profile_id = auth.uid());
