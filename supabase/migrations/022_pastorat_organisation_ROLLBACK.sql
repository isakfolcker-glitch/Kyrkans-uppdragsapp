-- =====================================================================
-- ROLLBACK för migration 022_pastorat_organisation.sql
--
-- Körs ALDRIG automatiskt. Sparas bara för hand om 022 måste backas.
-- Rör INTE profile_churches (den tabellen ändrades aldrig av 022, bara lästes).
--
-- Kör i den här ordningen: policyer och funktioner före tabeller/kolumner,
-- annars klagar Postgres på beroenden.
-- =====================================================================

-- ---------- RLS-policyer: återställ till läget innan 022 ----------

DROP POLICY IF EXISTS "churches_select_members" ON public.churches;
CREATE POLICY "churches_select_all" ON public.churches FOR SELECT USING (true);

DROP POLICY IF EXISTS "pastorat_select_members" ON public.pastorat;
CREATE POLICY "pastorat_select_all" ON public.pastorat FOR SELECT USING (true);

DROP POLICY IF EXISTS "pastorat_modify_super" ON public.pastorat;
CREATE POLICY "pastorat_modify_super" ON public.pastorat FOR ALL
  USING (public.current_admin_level() = 'super');

DROP POLICY IF EXISTS "kyrkor_select_members" ON public.kyrkor;
CREATE POLICY "kyrkor_select_all" ON public.kyrkor FOR SELECT USING (true);

DROP POLICY IF EXISTS "pastorat_memberships_select" ON public.pastorat_memberships;
DROP POLICY IF EXISTS "system_admins_select" ON public.system_admins;
DROP POLICY IF EXISTS "membership_audit_select" ON public.membership_audit;

-- ---------- Skrivfunktioner ----------

DROP FUNCTION IF EXISTS public.grant_church_membership(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.set_church_role(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.revoke_church_membership(UUID, INT);
DROP FUNCTION IF EXISTS public.grant_pastorat_membership(UUID, INT);
DROP FUNCTION IF EXISTS public.revoke_pastorat_membership(UUID, INT);
DROP FUNCTION IF EXISTS public.grant_system_admin(UUID);
DROP FUNCTION IF EXISTS public.revoke_system_admin(UUID);
DROP FUNCTION IF EXISTS public.accept_church_membership(INT);
DROP FUNCTION IF EXISTS public.decline_church_membership(INT);
DROP FUNCTION IF EXISTS public.accept_pastorat_membership(INT);
DROP FUNCTION IF EXISTS public.decline_pastorat_membership(INT);

-- ---------- Nya behörighetsfunktioner från 022 ----------

DROP FUNCTION IF EXISTS public.can_grant_church_role(INT, TEXT);
DROP FUNCTION IF EXISTS public.can_grant_pastorat_role(INT);
DROP FUNCTION IF EXISTS public.can_grant_system_admin();
DROP FUNCTION IF EXISTS public.can_admin_pastorat(INT);
DROP FUNCTION IF EXISTS public.can_view_pastorat(INT);

-- ---------- Funktioner som 022 skrev om: återställ 019-versionen ----------

CREATE OR REPLACE FUNCTION public.is_system_super_admin()
RETURNS BOOLEAN AS $$
  SELECT
    COALESCE((SELECT admin_level = 'super' FROM public.profiles WHERE id = auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profile_churches
      WHERE profile_id = auth.uid() AND active AND accepted_at IS NOT NULL AND admin_level = 'super'
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_pastorat_ids()
RETURNS SETOF INT AS $$
  SELECT DISTINCT c.pastorat_id
  FROM public.profile_churches pc
  JOIN public.churches c ON c.id = pc.church_id
  WHERE pc.profile_id = auth.uid() AND pc.active AND pc.accepted_at IS NOT NULL
    AND pc.admin_level = 'pastorat' AND c.pastorat_id IS NOT NULL;
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
      AND pc.accepted_at IS NOT NULL
      AND pc.admin_level IN ('pastorat','super')
      AND source_church.pastorat_id IS NOT NULL
      AND source_church.pastorat_id = target_church.pastorat_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- ---------- Nya tabeller ----------

DROP TABLE IF EXISTS public.membership_audit;
DROP TABLE IF EXISTS public.pastorat_memberships;
DROP TABLE IF EXISTS public.system_admins;

-- ---------- Nya kolumner och trigger på pastorat ----------

DROP TRIGGER IF EXISTS pastorat_updated_at ON public.pastorat;
DROP INDEX IF EXISTS public.pastorat_org_nr_unique;
ALTER TABLE public.pastorat DROP COLUMN IF EXISTS org_nr;
ALTER TABLE public.pastorat DROP COLUMN IF EXISTS address;
ALTER TABLE public.pastorat DROP COLUMN IF EXISTS email;
ALTER TABLE public.pastorat DROP COLUMN IF EXISTS phone;
ALTER TABLE public.pastorat DROP COLUMN IF EXISTS updated_at;

-- Återställ skrivrättigheter på pastorat (022 drog in dem från authenticated).
GRANT INSERT, UPDATE, DELETE ON public.pastorat TO authenticated;
