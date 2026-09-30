-- =====================================================================
-- Migration 017: Uppföljning av säkerhetsgranskningen 2026-09-29
--   * Pastoratsadmin kan bara skapa, ändra och radera församlingar i sitt
--     eget pastorat och kan inte flytta dem till ett annat pastorat.
--   * Utskickslogg och ansökningar syns bara inom egen församling.
--   * Bara admin eller ansvarig kan markera ett svar som personalens.
-- Kräver 016. Idempotent.
-- =====================================================================

-- ---------- Församlingar ----------
DROP POLICY IF EXISTS "churches_modify_admin" ON churches;
DROP POLICY IF EXISTS "churches_modify_super" ON churches;
DROP POLICY IF EXISTS "churches_update_pastorat" ON churches;

CREATE POLICY "churches_modify_super" ON churches FOR ALL
  USING (public.current_admin_level() = 'super')
  WITH CHECK (public.current_admin_level() = 'super');

-- Pastoratsadmin hanterar församlingar i sitt eget pastorat,
-- men kan inte flytta dem till ett annat pastorat.
DROP POLICY IF EXISTS "churches_insert_pastorat" ON churches;
DROP POLICY IF EXISTS "churches_delete_pastorat" ON churches;

CREATE OR REPLACE FUNCTION public.current_pastorat_id()
RETURNS INT AS $$
  SELECT c.pastorat_id FROM public.churches c WHERE c.id = public.current_church_id();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE POLICY "churches_update_pastorat" ON churches FOR UPDATE
  USING (public.current_admin_level() = 'pastorat' AND public.can_admin_church(id))
  WITH CHECK (
    public.current_admin_level() = 'pastorat'
    AND public.current_pastorat_id() IS NOT NULL
    AND pastorat_id = public.current_pastorat_id()
  );

CREATE POLICY "churches_insert_pastorat" ON churches FOR INSERT
  WITH CHECK (
    public.current_admin_level() = 'pastorat'
    AND public.current_pastorat_id() IS NOT NULL
    AND pastorat_id = public.current_pastorat_id()
  );

CREATE POLICY "churches_delete_pastorat" ON churches FOR DELETE
  USING (
    public.current_admin_level() = 'pastorat'
    AND public.current_pastorat_id() IS NOT NULL
    AND pastorat_id = public.current_pastorat_id()
  );

-- ---------- Utskickslogg ----------
DROP POLICY IF EXISTS "message_logs_select" ON message_logs;
CREATE POLICY "message_logs_select" ON message_logs FOR SELECT
  USING (
    from_user_id = auth.uid()
    OR public.current_admin_level() = 'super'
    OR (public.is_admin() AND public.can_admin_profile(from_user_id))
  );

DROP POLICY IF EXISTS "message_logs_insert" ON message_logs;
CREATE POLICY "message_logs_insert" ON message_logs FOR INSERT
  WITH CHECK (public.is_admin() AND from_user_id = auth.uid());

-- ---------- Ansökningar ----------
DROP POLICY IF EXISTS "applications_select_admin" ON applications;
CREATE POLICY "applications_select_admin" ON applications FOR SELECT
  USING (public.can_admin_church(church_id));

DROP POLICY IF EXISTS "applications_update_admin" ON applications;
CREATE POLICY "applications_update_admin" ON applications FOR UPDATE
  USING (public.can_admin_church(church_id))
  WITH CHECK (public.can_admin_church(church_id));

DROP POLICY IF EXISTS "applications_delete_admin" ON applications;
CREATE POLICY "applications_delete_admin" ON applications FOR DELETE
  USING (public.can_admin_church(church_id));

-- ---------- Frågor på pass ----------
DROP POLICY IF EXISTS "pass_messages_insert" ON pass_messages;
CREATE POLICY "pass_messages_insert" ON pass_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id)
      OR (
        is_staff_reply = false
        AND EXISTS (SELECT 1 FROM bookings b WHERE b.pass_id = pass_messages.pass_id AND b.profile_id = auth.uid())
      )
    )
  );
