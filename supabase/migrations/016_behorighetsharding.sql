-- =====================================================================
-- Migration 016: Behörighetshärdning
-- Rättar säkerhetsgranskningen 2026-09-29:
--   * Ingen kan längre ändra sin egen roll, nivå, församling eller anställning
--     (tidigare kunde en ideell göra sig till superadmin via Supabase direkt).
--   * Nya konton får aldrig högre behörighet än "ideell" från metadata.
--     Appens API (service role) sätter rätt roll efteråt.
--   * Ideella ser bara sin egen profil. Admin ser bara personer i sin
--     församling (församlingsadmin) eller sitt pastorat (pastoratsadmin).
--   * Admin kan bara hantera pass, bokningar, grupper och personer i de
--     församlingar de ansvarar för.
-- Idempotent: kan köras flera gånger.
-- =====================================================================

-- ---------- Hjälpfunktioner ----------

CREATE OR REPLACE FUNCTION public.level_rank(lvl TEXT)
RETURNS INT AS $$
  SELECT CASE lvl WHEN 'super' THEN 3 WHEN 'pastorat' THEN 2 WHEN 'forsamling' THEN 1 ELSE 0 END;
$$ LANGUAGE SQL IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.role_level(r TEXT)
RETURNS TEXT AS $$
  SELECT CASE r WHEN 'superadmin' THEN 'super' WHEN 'padmin' THEN 'pastorat' WHEN 'fadmin' THEN 'forsamling' ELSE 'none' END;
$$ LANGUAGE SQL IMMUTABLE SET search_path = public;

-- Får inloggad användare administrera församlingen target_church?
CREATE OR REPLACE FUNCTION public.can_admin_church(target_church INT)
RETURNS BOOLEAN AS $$
  SELECT CASE public.current_admin_level()
    WHEN 'super' THEN true
    WHEN 'pastorat' THEN
      target_church IS NULL OR EXISTS (
        SELECT 1 FROM public.churches t
        JOIN public.churches mine ON mine.id = public.current_church_id()
        WHERE t.id = target_church AND t.pastorat_id IS NOT DISTINCT FROM mine.pastorat_id
      )
    WHEN 'forsamling' THEN target_church IS NOT NULL AND target_church = public.current_church_id()
    ELSE false
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_admin_pass(pass_id_arg BIGINT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT public.can_admin_church(church_id) FROM public.passes WHERE id = pass_id_arg), false);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får inloggad användare administrera personen target? Kräver att personen
-- hör till en församling man ansvarar för och inte har högre nivå än man själv.
CREATE OR REPLACE FUNCTION public.can_admin_profile(target UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT public.can_admin_church(p.church_id)
       AND public.level_rank(p.admin_level) <= public.level_rank(public.current_admin_level())
    FROM public.profiles p WHERE p.id = target
  ), false);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- ---------- Skydd mot att höja sin egen behörighet ----------

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT := auth.role();
BEGIN
  -- Appens server (service role) och Supabase Auth internt får sätta allt.
  IF caller_role IS NULL OR caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'ideell';
    NEW.admin_level := 'none';
    NEW.is_employee := false;
    NEW.church_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.admin_level IS NOT DISTINCT FROM OLD.admin_level
     AND NEW.church_id IS NOT DISTINCT FROM OLD.church_id
     AND NEW.is_employee IS NOT DISTINCT FROM OLD.is_employee THEN
    RETURN NEW;
  END IF;

  IF OLD.id = auth.uid() THEN
    RAISE EXCEPTION 'Du kan inte ändra din egen roll, behörighet eller församling.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_profile(OLD.id)
     OR NOT public.can_set_admin_level(NEW.admin_level)
     OR NOT public.can_set_admin_level(public.role_level(NEW.role)) THEN
    RAISE EXCEPTION 'Saknar behörighet att ändra den här personens roll.' USING ERRCODE = '42501';
  END IF;

  IF NEW.church_id IS DISTINCT FROM OLD.church_id THEN
    IF public.current_admin_level() NOT IN ('pastorat', 'super') OR NOT public.can_admin_church(NEW.church_id) THEN
      RAISE EXCEPTION 'Saknar behörighet att flytta personen till en annan församling.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_protect_privileges ON public.profiles;
CREATE TRIGGER profiles_protect_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- ---------- Nya konton litar inte på metadata för behörighet ----------
-- Metadata kan sättas av vem som helst vid registrering. Rollen sätts i stället
-- av appens API med service role direkt efter att kontot skapats.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, admin_level, is_employee)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'ideell', 'none', false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.notif_settings (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Profilen skapas av handle_new_user. Roll och församling sätts av API:t.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- Profiler ----------

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (id = auth.uid() OR public.can_admin_church(church_id));

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (id <> auth.uid() AND public.can_admin_profile(id))
  WITH CHECK (public.can_set_admin_level(admin_level));

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  USING (id <> auth.uid() AND public.can_admin_profile(id));

DROP POLICY IF EXISTS "notif_settings_insert" ON notif_settings;
CREATE POLICY "notif_settings_insert" ON notif_settings FOR INSERT
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "profile_groups_select" ON profile_groups;
CREATE POLICY "profile_groups_select" ON profile_groups FOR SELECT
  USING (profile_id = auth.uid() OR public.can_admin_profile(profile_id));

DROP POLICY IF EXISTS "profile_groups_modify_admin" ON profile_groups;
CREATE POLICY "profile_groups_modify_admin" ON profile_groups FOR ALL
  USING (public.can_admin_profile(profile_id))
  WITH CHECK (public.can_admin_profile(profile_id));

DROP POLICY IF EXISTS "staff_permissions_read" ON staff_permissions;
CREATE POLICY "staff_permissions_read" ON staff_permissions FOR SELECT
  USING (profile_id = auth.uid() OR public.can_admin_profile(profile_id));

DROP POLICY IF EXISTS "staff_permissions_write" ON staff_permissions;
CREATE POLICY "staff_permissions_write" ON staff_permissions FOR ALL
  USING (profile_id <> auth.uid() AND public.can_admin_profile(profile_id))
  WITH CHECK (profile_id <> auth.uid() AND public.can_admin_profile(profile_id));

-- ---------- Pass och allt som hör till pass ----------

DROP POLICY IF EXISTS "passes_select_ideell" ON passes;
CREATE POLICY "passes_select_ideell" ON passes FOR SELECT
  USING (
    public.can_admin_church(church_id)
    OR public.is_responsible_for(id)
    OR (church_id = public.current_church_id() AND pub_status = 'live' AND cancelled = false)
  );

DROP POLICY IF EXISTS "passes_insert_admin" ON passes;
CREATE POLICY "passes_insert_admin" ON passes FOR INSERT
  WITH CHECK (public.can_admin_church(church_id));

DROP POLICY IF EXISTS "passes_update" ON passes;
CREATE POLICY "passes_update" ON passes FOR UPDATE
  USING (public.can_admin_church(church_id) OR public.is_responsible_for(id))
  WITH CHECK (public.can_admin_church(church_id) OR public.is_responsible_for(id));

DROP POLICY IF EXISTS "passes_delete_admin" ON passes;
CREATE POLICY "passes_delete_admin" ON passes FOR DELETE
  USING (public.can_admin_church(church_id));

DROP POLICY IF EXISTS "pass_groups_modify" ON pass_groups;
CREATE POLICY "pass_groups_modify" ON pass_groups FOR ALL
  USING (public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id))
  WITH CHECK (public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id));

DROP POLICY IF EXISTS "pass_history_insert" ON pass_history;
CREATE POLICY "pass_history_insert" ON pass_history FOR INSERT
  WITH CHECK (public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id));

DROP POLICY IF EXISTS "pass_history_select" ON pass_history;
CREATE POLICY "pass_history_select" ON pass_history FOR SELECT
  USING (public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id));

DROP POLICY IF EXISTS "pass_responsible_modify" ON pass_responsible;
CREATE POLICY "pass_responsible_modify" ON pass_responsible FOR ALL
  USING (public.can_admin_pass(pass_id))
  WITH CHECK (public.can_admin_pass(pass_id));

DROP POLICY IF EXISTS "pass_responsible_select" ON pass_responsible;
CREATE POLICY "pass_responsible_select" ON pass_responsible FOR SELECT
  USING (public.can_admin_pass(pass_id) OR profile_id = auth.uid());

DROP POLICY IF EXISTS "bookings_select_own" ON bookings;
CREATE POLICY "bookings_select_own" ON bookings FOR SELECT
  USING (profile_id = auth.uid() OR public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id));

DROP POLICY IF EXISTS "bookings_insert_self" ON bookings;
CREATE POLICY "bookings_insert_self" ON bookings FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id));

DROP POLICY IF EXISTS "bookings_delete" ON bookings;
CREATE POLICY "bookings_delete" ON bookings FOR DELETE
  USING (profile_id = auth.uid() OR public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id));

DROP POLICY IF EXISTS "pass_messages_select" ON pass_messages;
CREATE POLICY "pass_messages_select" ON pass_messages FOR SELECT
  USING (
    public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id)
    OR EXISTS (SELECT 1 FROM bookings b WHERE b.pass_id = pass_messages.pass_id AND b.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "pass_messages_insert" ON pass_messages;
CREATE POLICY "pass_messages_insert" ON pass_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid() AND (
      public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id)
      OR EXISTS (SELECT 1 FROM bookings b WHERE b.pass_id = pass_messages.pass_id AND b.profile_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "pass_messages_delete" ON pass_messages;
CREATE POLICY "pass_messages_delete" ON pass_messages FOR DELETE
  USING (author_id = auth.uid() OR public.can_admin_pass(pass_id));

DROP POLICY IF EXISTS "waitlist_select_admin" ON waitlist;
CREATE POLICY "waitlist_select_admin" ON waitlist FOR SELECT
  USING (public.can_admin_pass(pass_id));

DROP POLICY IF EXISTS "waitlist_delete" ON waitlist;
CREATE POLICY "waitlist_delete" ON waitlist FOR DELETE
  USING (profile_id = auth.uid() OR public.can_admin_pass(pass_id));

-- ---------- Grupper och kyrkobyggnader ----------

DROP POLICY IF EXISTS "groups_modify_admin" ON groups;
CREATE POLICY "groups_modify_admin" ON groups FOR ALL
  USING (
    (church_id IS NULL AND public.current_admin_level() IN ('pastorat', 'super'))
    OR (church_id IS NOT NULL AND public.can_admin_church(church_id))
  )
  WITH CHECK (
    (church_id IS NULL AND public.current_admin_level() IN ('pastorat', 'super'))
    OR (church_id IS NOT NULL AND public.can_admin_church(church_id))
  );

DROP POLICY IF EXISTS "kyrkor_modify_admin" ON kyrkor;
CREATE POLICY "kyrkor_modify_admin" ON kyrkor FOR ALL
  USING (public.can_admin_church(forsamling_id))
  WITH CHECK (public.can_admin_church(forsamling_id));

-- ---------- Ansökningar ----------
-- Tabellen används inte av appen i dag men tog emot personuppgifter från vem
-- som helst utan inloggning. Stängs tills funktionen byggs på riktigt.
REVOKE INSERT ON applications FROM anon, authenticated;

-- ---------- Rättigheter på hjälpfunktionerna ----------
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileges() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_invited_user()        FROM PUBLIC, anon, authenticated;
