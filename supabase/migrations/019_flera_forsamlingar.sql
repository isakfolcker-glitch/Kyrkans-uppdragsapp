-- =====================================================================
-- Migration 019: flera församlingar per konto och roll per församling
-- Byggd av ChatGPT:s 016_multi_church_memberships, anpassad så att den körs
-- ovanpå 016_behorighetsharding, 017 och 018 (som redan finns i produktion
-- respektive körs före denna):
--   * Rättad dollar-quoting ($ -> $$) och samma parameternamn på can_admin_church.
--   * Pastoratsåtkomst kräver ett riktigt pastorat, inte två tomma.
--   * Församlingar: pastoratsadmin kan inte flytta församlingar mellan pastorat.
--   * Kommentarer: reglerna från 018 behålls.
--   * Behörighetsfunktionerna från 016 och 018 räknar med medlemskap.
-- profile_churches blir källa för medlemskap, roll och lokal adminnivå.
-- Legacy-fälten på profiles behålls tillfälligt för bakåtkompatibilitet.
-- Idempotent.
-- =====================================================================

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

CREATE TABLE IF NOT EXISTS public.profile_church_permissions (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  church_id INT NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  kan_skapa_pass BOOLEAN NOT NULL DEFAULT false,
  kan_redigera_pass BOOLEAN NOT NULL DEFAULT false,
  kan_se_bokningar BOOLEAN NOT NULL DEFAULT false,
  kan_hantera_bokningar BOOLEAN NOT NULL DEFAULT false,
  kan_se_personal BOOLEAN NOT NULL DEFAULT false,
  kan_lagg_till_personal BOOLEAN NOT NULL DEFAULT false,
  kan_hantera_grupper BOOLEAN NOT NULL DEFAULT false,
  kan_skicka_utskick BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, church_id)
);

ALTER TABLE public.profile_church_permissions ENABLE ROW LEVEL SECURITY;

-- Flytta äldre personbehörigheter till personens tidigare huvudförsamling.
INSERT INTO public.profile_church_permissions (
  profile_id, church_id,
  kan_skapa_pass, kan_redigera_pass, kan_se_bokningar, kan_hantera_bokningar,
  kan_se_personal, kan_lagg_till_personal, kan_hantera_grupper, kan_skicka_utskick,
  updated_at
)
SELECT
  sp.profile_id, p.church_id,
  sp.kan_skapa_pass, sp.kan_redigera_pass, sp.kan_se_bokningar, sp.kan_hantera_bokningar,
  sp.kan_se_personal, sp.kan_lagg_till_personal, sp.kan_hantera_grupper, sp.kan_skicka_utskick,
  COALESCE(sp.updated_at, now())
FROM public.staff_permissions sp
JOIN public.profiles p ON p.id = sp.profile_id
WHERE p.church_id IS NOT NULL
ON CONFLICT (profile_id, church_id) DO NOTHING;

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
      AND source_church.pastorat_id IS NOT NULL
      AND source_church.pastorat_id = target_church.pastorat_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_access_church(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR public.has_active_membership(target_church_id)
    OR public.has_pastorat_admin_access(target_church_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Parameternamnet måste vara target_church, samma som i 016_behorighetsharding,
-- annars vägrar PostgreSQL att ersätta funktionen.
CREATE OR REPLACE FUNCTION public.can_admin_church(target_church INT)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR public.membership_admin_level(target_church) = 'forsamling'
    OR public.has_pastorat_admin_access(target_church);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_manage_church_settings(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR public.has_pastorat_admin_access(target_church_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_staff_permission_for_church(target_church_id INT, permission_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT public.has_active_membership(target_church_id)
    AND public.membership_role(target_church_id) = 'anstalld'
    AND EXISTS (
      SELECT 1
      FROM public.profile_church_permissions sp
      WHERE sp.profile_id = auth.uid()
        AND sp.church_id = target_church_id
        AND CASE permission_name
          WHEN 'kan_skapa_pass' THEN sp.kan_skapa_pass
          WHEN 'kan_redigera_pass' THEN sp.kan_redigera_pass
          WHEN 'kan_se_bokningar' THEN sp.kan_se_bokningar
          WHEN 'kan_hantera_bokningar' THEN sp.kan_hantera_bokningar
          WHEN 'kan_se_personal' THEN sp.kan_se_personal
          WHEN 'kan_lagg_till_personal' THEN sp.kan_lagg_till_personal
          WHEN 'kan_hantera_grupper' THEN sp.kan_hantera_grupper
          WHEN 'kan_skicka_utskick' THEN sp.kan_skicka_utskick
          ELSE false
        END
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_view_people_in_church(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT public.can_admin_church(target_church_id)
    OR public.has_staff_permission_for_church(target_church_id, 'kan_se_personal')
    OR public.has_staff_permission_for_church(target_church_id, 'kan_lagg_till_personal')
    OR public.has_staff_permission_for_church(target_church_id, 'kan_skicka_utskick');
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
        AND public.can_view_people_in_church(target_membership.church_id)
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
    OR public.can_view_people_in_church(church_id)
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
        AND public.can_view_people_in_church(target_membership.church_id)
    )
  );

CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- CHURCHES: se slutet av filen (ersätter 017 med medlemskapsmodellen)

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
        AND public.can_view_people_in_church(g.church_id)
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

-- Församlingsspecifika rättigheter för anställda.
DROP POLICY IF EXISTS "profile_church_permissions_select" ON public.profile_church_permissions;
DROP POLICY IF EXISTS "profile_church_permissions_write" ON public.profile_church_permissions;
CREATE POLICY "profile_church_permissions_select" ON public.profile_church_permissions FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.can_admin_church(church_id)
  );
CREATE POLICY "profile_church_permissions_write" ON public.profile_church_permissions FOR ALL
  USING (public.can_admin_church(church_id))
  WITH CHECK (public.can_admin_church(church_id));

REVOKE INSERT, UPDATE, DELETE ON public.profile_church_permissions FROM authenticated;
GRANT SELECT ON public.profile_church_permissions TO authenticated;

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

-- PASS_MESSAGES: reglerna från 018 gäller och ändras inte här.

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
    (church_id IS NOT NULL AND (
      public.can_admin_church(church_id)
      OR public.has_staff_permission_for_church(church_id, 'kan_skicka_utskick')
    ))
    OR (church_id IS NULL AND public.is_system_super_admin())
  );
CREATE POLICY "message_logs_insert" ON public.message_logs FOR INSERT
  WITH CHECK (
    church_id IS NOT NULL
    AND (
      public.can_admin_church(church_id)
      OR public.has_staff_permission_for_church(church_id, 'kan_skicka_utskick')
    )
  );

REVOKE EXECUTE ON FUNCTION public.is_system_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_membership(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.membership_admin_level(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.membership_role(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_pastorat_admin_access(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_church(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_admin_church(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_church_settings(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission_for_church(INT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_people_in_church(INT) FROM anon;

GRANT EXECUTE ON FUNCTION public.is_system_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_membership(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_admin_level(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_role(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pastorat_admin_access(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_church(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_church(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_church_settings(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission_for_church(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_people_in_church(INT) TO authenticated;

-- =====================================================================
-- Tillägg: säkerhetsregler från 016_behorighetsharding, 017 och 018
-- flyttade till medlemskapsmodellen.
-- =====================================================================

-- Pastorat där inloggad användare är pastoratsadmin (aktivt medlemskap).
CREATE OR REPLACE FUNCTION public.admin_pastorat_ids()
RETURNS SETOF INT AS $$
  SELECT DISTINCT c.pastorat_id
  FROM public.profile_churches pc
  JOIN public.churches c ON c.id = pc.church_id
  WHERE pc.profile_id = auth.uid() AND pc.active
    AND pc.admin_level = 'pastorat' AND c.pastorat_id IS NOT NULL;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "churches_modify_admin" ON public.churches;
DROP POLICY IF EXISTS "churches_modify_super" ON public.churches;
DROP POLICY IF EXISTS "churches_update_pastorat" ON public.churches;
DROP POLICY IF EXISTS "churches_insert_pastorat" ON public.churches;
DROP POLICY IF EXISTS "churches_delete_pastorat" ON public.churches;

CREATE POLICY "churches_modify_super" ON public.churches FOR ALL
  USING (public.is_system_super_admin())
  WITH CHECK (public.is_system_super_admin());

CREATE POLICY "churches_update_pastorat" ON public.churches FOR UPDATE
  USING (pastorat_id IN (SELECT public.admin_pastorat_ids()))
  WITH CHECK (pastorat_id IN (SELECT public.admin_pastorat_ids()));

CREATE POLICY "churches_insert_pastorat" ON public.churches FOR INSERT
  WITH CHECK (pastorat_id IN (SELECT public.admin_pastorat_ids()));

CREATE POLICY "churches_delete_pastorat" ON public.churches FOR DELETE
  USING (pastorat_id IN (SELECT public.admin_pastorat_ids()));

-- Högsta nivå en person har (medlemskap eller gammal kolumn).
CREATE OR REPLACE FUNCTION public.profile_max_level(uid UUID)
RETURNS TEXT AS $$
  SELECT CASE GREATEST(
      COALESCE((SELECT public.level_rank(p.admin_level) FROM public.profiles p WHERE p.id = uid), 0),
      COALESCE((SELECT max(public.level_rank(pc.admin_level)) FROM public.profile_churches pc WHERE pc.profile_id = uid AND pc.active), 0))
    WHEN 3 THEN 'super' WHEN 2 THEN 'pastorat' WHEN 1 THEN 'forsamling' ELSE 'none' END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får inloggad användare administrera personen? Personen ska vara aktiv medlem
-- i en församling man administrerar och inte ha högre nivå än man själv.
CREATE OR REPLACE FUNCTION public.can_admin_profile(target UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_churches pc
    WHERE pc.profile_id = target AND pc.active
      AND public.can_admin_church(pc.church_id)
  )
  AND public.level_rank(public.profile_max_level(target)) <= public.level_rank(public.current_admin_level());
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Samma regel som can_admin_church, men för en given person (används för
-- att avgöra vem som har åtkomst till ett pass kommentarer).
CREATE OR REPLACE FUNCTION public.can_admin_church_for(target_church INT, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.admin_level = 'super')
    OR EXISTS (
      SELECT 1 FROM public.profile_churches pc
      WHERE pc.profile_id = uid AND pc.active AND pc.admin_level = 'super'
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_churches pc
      WHERE pc.profile_id = uid AND pc.active AND pc.admin_level = 'forsamling'
        AND pc.church_id = target_church
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_churches pc
      JOIN public.churches mine ON mine.id = pc.church_id
      JOIN public.churches t ON t.id = target_church
      WHERE pc.profile_id = uid AND pc.active AND pc.admin_level = 'pastorat'
        AND mine.pastorat_id IS NOT NULL AND mine.pastorat_id = t.pastorat_id
    )
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Kommentarer: kiosk (globalt eller i passets församling) har aldrig åtkomst.
CREATE OR REPLACE FUNCTION public.pass_thread_access_for(pass_id_arg INT, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT uid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role <> 'kiosk')
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_churches pc
      JOIN public.passes ps ON ps.church_id = pc.church_id
      WHERE ps.id = pass_id_arg AND pc.profile_id = uid AND pc.active AND pc.role = 'kiosk'
    )
    AND (
      EXISTS (SELECT 1 FROM public.bookings b WHERE b.pass_id = pass_id_arg AND b.profile_id = uid)
      OR EXISTS (SELECT 1 FROM public.pass_responsible r WHERE r.pass_id = pass_id_arg AND r.profile_id = uid)
      OR EXISTS (SELECT 1 FROM public.passes ps WHERE ps.id = pass_id_arg AND ps.vk_profile_id = uid)
      OR public.can_admin_pass_for(pass_id_arg, uid)
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.admin_pastorat_ids()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.profile_max_level(UUID)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_admin_church_for(INT, UUID)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pass_thread_access_for(INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_pastorat_ids()             TO authenticated;
