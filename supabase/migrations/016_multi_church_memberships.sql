-- Migration 016: flera församlingar per konto och roll per församling
-- profile_churches blir källa för medlemskap, roll och lokal adminnivå.
-- Legacy-fälten på profiles behålls tillfälligt för bakåtkompatibilitet.

CREATE TABLE IF NOT EXISTS public.profile_churches (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  church_id INT NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'ideell'
    CHECK (role IN ('ideell','anstalld','fadmin','padmin','superadmin','kiosk')),
  admin_level TEXT NOT NULL DEFAULT 'none'
    CHECK (admin_level IN ('none','forsamling','pastorat','super')),
  is_employee BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (profile_id, church_id)
);

CREATE INDEX IF NOT EXISTS profile_churches_church_idx
  ON public.profile_churches(church_id, active);
CREATE INDEX IF NOT EXISTS profile_churches_profile_idx
  ON public.profile_churches(profile_id, active);

-- Flytta befintlig enkelförsamlingskoppling till medlemskapstabellen.
INSERT INTO public.profile_churches (
  profile_id, church_id, role, admin_level, is_employee, active, invited_at, accepted_at
)
SELECT
  id, church_id, role, admin_level, is_employee, true,
  COALESCE(created_at, now()),
  CASE WHEN onboarding_done THEN COALESCE(updated_at, now()) ELSE NULL END
FROM public.profiles
WHERE church_id IS NOT NULL
ON CONFLICT (profile_id, church_id) DO NOTHING;

-- Om en äldre superadmin saknar church_id, ge den ett aktivt systemmedlemskap
-- i första församlingen så kontot inte låses ute vid migreringen.
INSERT INTO public.profile_churches (
  profile_id, church_id, role, admin_level, is_employee, active, invited_at, accepted_at
)
SELECT p.id, c.id, 'superadmin', 'super', true, true, now(), now()
FROM public.profiles p
CROSS JOIN LATERAL (
  SELECT id FROM public.churches ORDER BY id LIMIT 1
) c
WHERE p.admin_level = 'super'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_churches pc WHERE pc.profile_id = p.id
  )
ON CONFLICT (profile_id, church_id) DO NOTHING;

ALTER TABLE public.profile_churches ENABLE ROW LEVEL SECURITY;

-- Utskick behöver veta vilken församling de hör till.
ALTER TABLE public.message_logs
  ADD COLUMN IF NOT EXISTS church_id INT REFERENCES public.churches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS message_logs_church_idx
  ON public.message_logs(church_id, sent_at DESC);

-- Hjälpfunktioner. De kör som ägare så RLS-policys kan fråga medlemskap
-- utan rekursion.
CREATE OR REPLACE FUNCTION public.is_system_super_admin()
RETURNS BOOLEAN AS $$
  SELECT
    COALESCE((SELECT admin_level = 'super' FROM public.profiles WHERE id = auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profile_churches
      WHERE profile_id = auth.uid() AND active AND admin_level = 'super'
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_active_membership(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_churches
    WHERE profile_id = auth.uid()
      AND church_id = target_church_id
      AND active
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.membership_admin_level(target_church_id INT)
RETURNS TEXT AS $$
  SELECT COALESCE((
    SELECT admin_level
    FROM public.profile_churches
    WHERE profile_id = auth.uid()
      AND church_id = target_church_id
      AND active
    LIMIT 1
  ), 'none');
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.membership_role(target_church_id INT)
RETURNS TEXT AS $$
  SELECT COALESCE((
    SELECT role
    FROM public.profile_churches
    WHERE profile_id = auth.uid()
      AND church_id = target_church_id
      AND active
    LIMIT 1
  ), 'ideell');
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_pastorat_admin_access(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_churches pc
    JOIN public.churches source_church ON source_church.id = pc.church_id
    JOIN public.churches target_church ON target_church.id = target_church_id
    WHERE pc.profile_id = auth.uid()
      AND pc.active
      AND pc.admin_level IN ('pastorat','super')
      AND source_church.pastorat_id IS NOT DISTINCT FROM target_church.pastorat_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_access_church(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR public.has_active_membership(target_church_id)
    OR public.has_pastorat_admin_access(target_church_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_admin_church(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR public.membership_admin_level(target_church_id) = 'forsamling'
    OR public.has_pastorat_admin_access(target_church_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_manage_church_settings(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR public.has_pastorat_admin_access(target_church_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Bakåtkompatibla helpers använder högsta aktiva medlemskapsnivå.
CREATE OR REPLACE FUNCTION public.current_admin_level()
RETURNS TEXT AS $$
  SELECT CASE
    WHEN public.is_system_super_admin() THEN 'super'
    WHEN EXISTS (
      SELECT 1 FROM public.profile_churches
      WHERE profile_id = auth.uid() AND active AND admin_level = 'pastorat'
    ) THEN 'pastorat'
    WHEN EXISTS (
      SELECT 1 FROM public.profile_churches
      WHERE profile_id = auth.uid() AND active AND admin_level = 'forsamling'
    ) THEN 'forsamling'
    ELSE 'none'
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_church_id()
RETURNS INT AS $$
  SELECT church_id
  FROM public.profile_churches
  WHERE profile_id = auth.uid() AND active
  ORDER BY invited_at, church_id
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT public.current_admin_level() IN ('forsamling','pastorat','super');
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.same_church_as(target_profile_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profile_churches target_membership
      WHERE target_membership.profile_id = target_profile_id
        AND target_membership.active
        AND public.can_admin_church(target_membership.church_id)
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Nya auth-användare får bara en neutral profil.
-- Roll och församling sätts alltid via en serverstyrd inbjudan i profile_churches.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, admin_level, is_employee)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'ideell',
    'none',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(public.profiles.name, ''), EXCLUDED.name);

  INSERT INTO public.notif_settings (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Den äldre invite-triggern får inte längre skriva global roll/church på profilen.
DROP TRIGGER IF EXISTS on_auth_user_invited ON auth.users;

-- Medlemskap: användaren ser sina egna, admin ser medlemskap i sitt scope.
DROP POLICY IF EXISTS "profile_churches_select" ON public.profile_churches;
DROP POLICY IF EXISTS "profile_churches_write" ON public.profile_churches;
CREATE POLICY "profile_churches_select" ON public.profile_churches FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.can_admin_church(church_id)
  );

-- Medlemskap skapas/ändras via server-API med service role.
REVOKE INSERT, UPDATE, DELETE ON public.profile_churches FROM authenticated;
GRANT SELECT ON public.profile_churches TO authenticated;

-- Skydda legacy-behörighetsfält på profiles mot självändring.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  name, phone, birth_year, emergency_contact_name, emergency_contact_phone,
  onboarding_done, available, ini, av_color, ac_color, updated_at
) ON public.profiles TO authenticated;

-- PROFILES
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.is_system_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profile_churches target_membership
      WHERE target_membership.profile_id = profiles.id
        AND target_membership.active
        AND public.can_admin_church(target_membership.church_id)
    )
  );

CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- CHURCHES
DROP POLICY IF EXISTS "churches_select_all" ON public.churches;
DROP POLICY IF EXISTS "churches_modify_admin" ON public.churches;
CREATE POLICY "churches_select_all" ON public.churches FOR SELECT USING (true);
CREATE POLICY "churches_modify_admin" ON public.churches FOR ALL
  USING (public.can_manage_church_settings(id))
  WITH CHECK (public.can_manage_church_settings(id));

-- GROUPS
DROP POLICY IF EXISTS "groups_select_all" ON public.groups;
DROP POLICY IF EXISTS "groups_modify_admin" ON public.groups;
CREATE POLICY "groups_select_members" ON public.groups FOR SELECT
  USING (church_id IS NULL OR public.can_access_church(church_id));
CREATE POLICY "groups_modify_admin" ON public.groups FOR ALL
  USING (church_id IS NOT NULL AND public.can_admin_church(church_id))
  WITH CHECK (church_id IS NOT NULL AND public.can_admin_church(church_id));

-- PROFILE_GROUPS
DROP POLICY IF EXISTS "profile_groups_select" ON public.profile_groups;
DROP POLICY IF EXISTS "profile_groups_modify_admin" ON public.profile_groups;
CREATE POLICY "profile_groups_select" ON public.profile_groups FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = profile_groups.group_id
        AND g.church_id IS NOT NULL
        AND public.can_admin_church(g.church_id)
    )
  );
CREATE POLICY "profile_groups_modify_admin" ON public.profile_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = profile_groups.group_id
        AND g.church_id IS NOT NULL
        AND public.can_admin_church(g.church_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = profile_groups.group_id
        AND g.church_id IS NOT NULL
        AND public.can_admin_church(g.church_id)
    )
  );

-- PASSES
DROP POLICY IF EXISTS "passes_select_ideell" ON public.passes;
DROP POLICY IF EXISTS "passes_insert_admin" ON public.passes;
DROP POLICY IF EXISTS "passes_update" ON public.passes;
DROP POLICY IF EXISTS "passes_delete_admin" ON public.passes;

CREATE POLICY "passes_select_members" ON public.passes FOR SELECT
  USING (
    public.can_access_church(church_id)
    AND (
      public.can_admin_church(church_id)
      OR public.is_responsible_for(id)
      OR (pub_status = 'live' AND cancelled = false)
    )
  );

CREATE POLICY "passes_insert_admin" ON public.passes FOR INSERT
  WITH CHECK (public.can_admin_church(church_id));

CREATE POLICY "passes_update" ON public.passes FOR UPDATE
  USING (public.can_admin_church(church_id) OR public.is_responsible_for(id))
  WITH CHECK (public.can_admin_church(church_id) OR public.is_responsible_for(id));

CREATE POLICY "passes_delete_admin" ON public.passes FOR DELETE
  USING (public.can_admin_church(church_id));

-- PASS_GROUPS
DROP POLICY IF EXISTS "pass_groups_select" ON public.pass_groups;
DROP POLICY IF EXISTS "pass_groups_modify" ON public.pass_groups;
CREATE POLICY "pass_groups_select" ON public.pass_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_groups.pass_id
        AND public.can_access_church(p.church_id)
    )
  );
CREATE POLICY "pass_groups_modify" ON public.pass_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_groups.pass_id
        AND (public.can_admin_church(p.church_id) OR public.is_responsible_for(p.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_groups.pass_id
        AND (public.can_admin_church(p.church_id) OR public.is_responsible_for(p.id))
    )
  );

-- PASS_RESPONSIBLE
DROP POLICY IF EXISTS "pass_responsible_select" ON public.pass_responsible;
DROP POLICY IF EXISTS "pass_responsible_modify" ON public.pass_responsible;
CREATE POLICY "pass_responsible_select" ON public.pass_responsible FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_responsible.pass_id
        AND public.can_admin_church(p.church_id)
    )
  );
CREATE POLICY "pass_responsible_modify" ON public.pass_responsible FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_responsible.pass_id
        AND public.can_admin_church(p.church_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_responsible.pass_id
        AND public.can_admin_church(p.church_id)
    )
  );

-- BOOKINGS
DROP POLICY IF EXISTS "bookings_select_own" ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_self" ON public.bookings;
DROP POLICY IF EXISTS "bookings_delete" ON public.bookings;
CREATE POLICY "bookings_select_scope" ON public.bookings FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = bookings.pass_id
        AND (public.can_admin_church(p.church_id) OR public.is_responsible_for(p.id))
    )
  );
CREATE POLICY "bookings_insert_scope" ON public.bookings FOR INSERT
  WITH CHECK (
    (profile_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = bookings.pass_id AND public.can_access_church(p.church_id)
    ))
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = bookings.pass_id
        AND (public.can_admin_church(p.church_id) OR public.is_responsible_for(p.id))
    )
  );
CREATE POLICY "bookings_delete_scope" ON public.bookings FOR DELETE
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = bookings.pass_id
        AND (public.can_admin_church(p.church_id) OR public.is_responsible_for(p.id))
    )
  );

-- PASS_HISTORY
DROP POLICY IF EXISTS "pass_history_select" ON public.pass_history;
DROP POLICY IF EXISTS "pass_history_insert" ON public.pass_history;
CREATE POLICY "pass_history_select" ON public.pass_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_history.pass_id
        AND (public.can_admin_church(p.church_id) OR public.is_responsible_for(p.id))
    )
  );
CREATE POLICY "pass_history_insert" ON public.pass_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_history.pass_id
        AND (public.can_admin_church(p.church_id) OR public.is_responsible_for(p.id))
    )
  );

-- STAFF_PERMISSIONS (fortfarande per person, men kan bara hanteras av admin
-- som delar minst en församling med personen).
DROP POLICY IF EXISTS "staff_permissions_read" ON public.staff_permissions;
DROP POLICY IF EXISTS "staff_permissions_write" ON public.staff_permissions;
CREATE POLICY "staff_permissions_read" ON public.staff_permissions FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profile_churches pc
      WHERE pc.profile_id = staff_permissions.profile_id
        AND pc.active
        AND public.can_admin_church(pc.church_id)
    )
  );
CREATE POLICY "staff_permissions_write" ON public.staff_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profile_churches pc
      WHERE pc.profile_id = staff_permissions.profile_id
        AND pc.active
        AND public.can_admin_church(pc.church_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profile_churches pc
      WHERE pc.profile_id = staff_permissions.profile_id
        AND pc.active
        AND public.can_admin_church(pc.church_id)
    )
  );

-- WAITLIST
DROP POLICY IF EXISTS "waitlist_select_own" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_select_admin" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_insert_own" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_delete" ON public.waitlist;
CREATE POLICY "waitlist_select_scope" ON public.waitlist FOR SELECT
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = waitlist.pass_id
        AND public.can_admin_church(p.church_id)
    )
  );
CREATE POLICY "waitlist_insert_own" ON public.waitlist FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = waitlist.pass_id
        AND public.can_access_church(p.church_id)
    )
  );
CREATE POLICY "waitlist_delete_scope" ON public.waitlist FOR DELETE
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = waitlist.pass_id
        AND public.can_admin_church(p.church_id)
    )
  );

-- PASS_MESSAGES
DROP POLICY IF EXISTS "pass_messages_select" ON public.pass_messages;
DROP POLICY IF EXISTS "pass_messages_insert" ON public.pass_messages;
DROP POLICY IF EXISTS "pass_messages_delete" ON public.pass_messages;
CREATE POLICY "pass_messages_select" ON public.pass_messages FOR SELECT
  USING (
    public.is_responsible_for(pass_id)
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_messages.pass_id
        AND public.can_admin_church(p.church_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.pass_id = pass_messages.pass_id
        AND b.profile_id = auth.uid()
    )
  );
CREATE POLICY "pass_messages_insert" ON public.pass_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_responsible_for(pass_id)
      OR EXISTS (
        SELECT 1 FROM public.passes p
        WHERE p.id = pass_messages.pass_id
          AND public.can_admin_church(p.church_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.pass_id = pass_messages.pass_id
          AND b.profile_id = auth.uid()
      )
    )
  );
CREATE POLICY "pass_messages_delete" ON public.pass_messages FOR DELETE
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.passes p
      WHERE p.id = pass_messages.pass_id
        AND public.can_admin_church(p.church_id)
    )
  );

-- APPLICATIONS
DROP POLICY IF EXISTS "applications_select_admin" ON public.applications;
DROP POLICY IF EXISTS "applications_update_admin" ON public.applications;
DROP POLICY IF EXISTS "applications_delete_admin" ON public.applications;
CREATE POLICY "applications_select_admin" ON public.applications FOR SELECT
  USING (church_id IS NOT NULL AND public.can_admin_church(church_id));
CREATE POLICY "applications_update_admin" ON public.applications FOR UPDATE
  USING (church_id IS NOT NULL AND public.can_admin_church(church_id))
  WITH CHECK (church_id IS NOT NULL AND public.can_admin_church(church_id));
CREATE POLICY "applications_delete_admin" ON public.applications FOR DELETE
  USING (church_id IS NOT NULL AND public.can_admin_church(church_id));

-- MESSAGE_LOGS
DROP POLICY IF EXISTS "message_logs_select" ON public.message_logs;
DROP POLICY IF EXISTS "message_logs_insert" ON public.message_logs;
CREATE POLICY "message_logs_select" ON public.message_logs FOR SELECT
  USING (
    (church_id IS NOT NULL AND public.can_admin_church(church_id))
    OR (church_id IS NULL AND public.is_system_super_admin())
  );
CREATE POLICY "message_logs_insert" ON public.message_logs FOR INSERT
  WITH CHECK (church_id IS NOT NULL AND public.can_admin_church(church_id));

REVOKE EXECUTE ON FUNCTION public.is_system_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_membership(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.membership_admin_level(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.membership_role(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_pastorat_admin_access(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_church(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_admin_church(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_church_settings(INT) FROM anon;

GRANT EXECUTE ON FUNCTION public.is_system_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_membership(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_admin_level(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_role(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pastorat_admin_access(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_church(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_church(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_church_settings(INT) TO authenticated;
