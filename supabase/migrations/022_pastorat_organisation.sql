-- =====================================================================
-- Migration 022: Pastoratsorganisation (leverans 1 av 4)
-- Bygger grunden för Stift → pastorat → församlingar → kyrkor:
--   * Pastorat blir en egen juridisk organisation med kontaktuppgifter.
--   * Pastoratsadmin (padmin) blir ett eget medlemskap per pastorat
--     (pastorat_memberships), separat från församlingsmedlemskap.
--   * Systemadmin (superadmin) blir en egen tabell (system_admins) i stället
--     för att bo i profile_churches eller profiles.admin_level.
--   * Alla ändringar av någon annans behörighet loggas i membership_audit.
--   * Hierarki för vem som får bjuda in/ge roller:
--       superadmin → pastoratsadmin → församlingsadmin (fadmin)
--       → anställd (bara ideell, bara med kan_lagg_till_personal) → ideell (inget).
--     Ingen kan höja sin egen behörighet.
--
-- OBS: Migration 021 (en låst "systemägare") är INTE körd någonstans och
-- används INTE här – den krockar med kravet på flera superadmin.
--
-- Rör ALDRIG profile_churches i det här steget (bara kopiera data till de
-- nya tabellerna, aldrig lägga till eller ta bort rader där).
--
-- Idempotent: kan köras flera gånger, mot test och produktion.
-- =====================================================================

-- =====================================================================
-- DEL 1: Nya kolumner på pastorat
-- =====================================================================

ALTER TABLE public.pastorat ADD COLUMN IF NOT EXISTS org_nr     TEXT;
ALTER TABLE public.pastorat ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE public.pastorat ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE public.pastorat ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE public.pastorat ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- org_nr ska vara unikt, men bara när det är ifyllt (många pastorat saknar
-- det ännu). Partiellt unikt index i stället för UNIQUE-kolumn.
DROP INDEX IF EXISTS public.pastorat_org_nr_unique;
CREATE UNIQUE INDEX IF NOT EXISTS pastorat_org_nr_unique
  ON public.pastorat (org_nr) WHERE org_nr IS NOT NULL;

DROP TRIGGER IF EXISTS pastorat_updated_at ON public.pastorat;
CREATE TRIGGER pastorat_updated_at BEFORE UPDATE ON public.pastorat
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- DEL 2: Nya tabeller
-- =====================================================================

-- Pastoratsmedlemskap: en rad per person och pastorat. Samma mönster som
-- profile_churches (invited_by/invited_at/accepted_at/active), men bara
-- rollen 'padmin' finns på pastoratsnivå.
CREATE TABLE IF NOT EXISTS public.pastorat_memberships (
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pastorat_id INT  NOT NULL REFERENCES public.pastorat(id)  ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'padmin' CHECK (role IN ('padmin')),
  active      BOOLEAN NOT NULL DEFAULT true,
  invited_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (profile_id, pastorat_id)
);

ALTER TABLE public.pastorat_memberships ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pastorat_memberships_pastorat_idx
  ON public.pastorat_memberships(pastorat_id, active);
CREATE INDEX IF NOT EXISTS pastorat_memberships_profile_idx
  ON public.pastorat_memberships(profile_id, active);

-- Systemadmin: en liten, enkel tabell. Ingen accepted_at – att ge
-- systemadminrättigheter gäller direkt (bara en annan systemadmin kan göra det).
CREATE TABLE IF NOT EXISTS public.system_admins (
  profile_id  UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  granted_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_admins ENABLE ROW LEVEL SECURITY;

-- Logg över alla ändringar av någon annans behörighet (församling, pastorat
-- eller system). Visar vem som ändrade, vem det gällde, vilket område och
-- vad som gällde innan/efter.
CREATE TABLE IF NOT EXISTS public.membership_audit (
  id               BIGSERIAL PRIMARY KEY,
  changed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope            TEXT NOT NULL CHECK (scope IN ('church','pastorat','system')),
  church_id        INT REFERENCES public.churches(id) ON DELETE SET NULL,
  pastorat_id      INT REFERENCES public.pastorat(id)  ON DELETE SET NULL,
  old_role         TEXT,
  old_admin_level  TEXT,
  new_role         TEXT,
  new_admin_level  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT membership_audit_scope_matches_area CHECK (
    (scope = 'church'    AND church_id   IS NOT NULL AND pastorat_id IS NULL)
    OR (scope = 'pastorat' AND pastorat_id IS NOT NULL AND church_id IS NULL)
    OR (scope = 'system'   AND church_id   IS NULL AND pastorat_id IS NULL)
  )
);

ALTER TABLE public.membership_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS membership_audit_profile_idx  ON public.membership_audit(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS membership_audit_church_idx   ON public.membership_audit(church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS membership_audit_pastorat_idx ON public.membership_audit(pastorat_id, created_at DESC);

-- Skrivning bara via SECURITY DEFINER-funktionerna nedan (eller service role
-- för membership_audit, som bara appens egen loggning skriver till).
-- Samma mönster som profile_churches redan skyddas med.
REVOKE INSERT, UPDATE, DELETE ON public.pastorat             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pastorat_memberships  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.system_admins         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.membership_audit      FROM anon, authenticated;

GRANT SELECT ON public.pastorat_memberships TO authenticated;
GRANT SELECT ON public.system_admins        TO authenticated;
GRANT SELECT ON public.membership_audit     TO authenticated;

-- =====================================================================
-- DEL 3: Kopiera befintlig data (lägger inte till eller tar bort något i
-- profile_churches, bara kopierar till de nya tabellerna)
-- =====================================================================

-- Alla med admin_level='super' (i profiles.admin_level ELLER i en aktiv rad
-- i profile_churches) → en rad i system_admins.
INSERT INTO public.system_admins (profile_id, granted_by, granted_at)
SELECT DISTINCT s.profile_id, NULL::uuid, now()
FROM (
  SELECT id AS profile_id FROM public.profiles WHERE admin_level = 'super'
  UNION
  SELECT profile_id FROM public.profile_churches WHERE active AND admin_level = 'super'
) s
ON CONFLICT (profile_id) DO NOTHING;

-- Alla aktiva rader i profile_churches med admin_level='pastorat' vars
-- församling har ett pastorat_id satt → en rad i pastorat_memberships
-- (samma accepted_at, så väntande förblir väntande).
DO $$
DECLARE
  moved   INT;
  skipped INT;
BEGIN
  INSERT INTO public.pastorat_memberships (profile_id, pastorat_id, role, active, invited_by, invited_at, accepted_at)
  SELECT pc.profile_id, c.pastorat_id, 'padmin', true, pc.invited_by, pc.invited_at, pc.accepted_at
  FROM public.profile_churches pc
  JOIN public.churches c ON c.id = pc.church_id
  WHERE pc.active AND pc.admin_level = 'pastorat' AND c.pastorat_id IS NOT NULL
  ON CONFLICT (profile_id, pastorat_id) DO NOTHING;

  GET DIAGNOSTICS moved = ROW_COUNT;

  SELECT count(*) INTO skipped
  FROM public.profile_churches pc
  JOIN public.churches c ON c.id = pc.church_id
  WHERE pc.active AND pc.admin_level = 'pastorat' AND c.pastorat_id IS NULL;

  RAISE NOTICE 'Migration 022: % pastoratsmedlemskap flyttade till pastorat_memberships, % kunde INTE flyttas (församlingen saknade pastorat).', moved, skipped;
END $$;

-- =====================================================================
-- DEL 4: Behörighetsfunktioner
-- =====================================================================

-- Är den inloggade systemadmin? Nya tabellen ELLER (övergångsperiod) den
-- gamla superraden som gällde innan denna migration.
CREATE OR REPLACE FUNCTION public.is_system_super_admin()
RETURNS BOOLEAN AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.system_admins WHERE profile_id = auth.uid())
    OR COALESCE((SELECT admin_level = 'super' FROM public.profiles WHERE id = auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profile_churches
      WHERE profile_id = auth.uid() AND active AND accepted_at IS NOT NULL AND admin_level = 'super'
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Pastorat där den inloggade är pastoratsadmin: accepterade aktiva
-- pastorat_memberships ELLER (övergångsperiod) gamla pastoratsrader i
-- profile_churches, precis som innan denna migration.
CREATE OR REPLACE FUNCTION public.admin_pastorat_ids()
RETURNS SETOF INT AS $$
  SELECT pastorat_id
  FROM public.pastorat_memberships
  WHERE profile_id = auth.uid() AND active AND accepted_at IS NOT NULL
  UNION
  SELECT DISTINCT c.pastorat_id
  FROM public.profile_churches pc
  JOIN public.churches c ON c.id = pc.church_id
  WHERE pc.profile_id = auth.uid() AND pc.active AND pc.accepted_at IS NOT NULL
    AND pc.admin_level = 'pastorat' AND c.pastorat_id IS NOT NULL;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får den inloggade administrera pastoratet (superadmin eller pastoratsadmin där)?
CREATE OR REPLACE FUNCTION public.can_admin_pastorat(target_pastorat INT)
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin()
    OR target_pastorat IN (SELECT public.admin_pastorat_ids());
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får den inloggade SE pastoratet? can_admin_pastorat ELLER ett accepterat
-- eller väntande medlemskap i en församling i pastoratet.
CREATE OR REPLACE FUNCTION public.can_view_pastorat(target_pastorat INT)
RETURNS BOOLEAN AS $$
  SELECT public.can_admin_pastorat(target_pastorat)
    OR EXISTS (
      SELECT 1
      FROM public.profile_churches pc
      JOIN public.churches c ON c.id = pc.church_id
      WHERE pc.profile_id = auth.uid() AND pc.active AND c.pastorat_id = target_pastorat
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Samma parameternamn (target_church_id) som i 019_flera_forsamlingar, annars
-- vägrar PostgreSQL att ersätta funktionen. Skriven om att använda
-- admin_pastorat_ids() i stället för att räkna direkt på profile_churches.
CREATE OR REPLACE FUNCTION public.has_pastorat_admin_access(target_church_id INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.churches c
    WHERE c.id = target_church_id
      AND c.pastorat_id IS NOT NULL
      AND c.pastorat_id IN (SELECT public.admin_pastorat_ids())
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får den inloggade ge target_role i target_church?
--   * superadmin, pastoratsadmin för församlingens pastorat eller fadmin med
--     direkt medlemskap där: ideell, anstalld, fadmin eller kiosk.
--   * anställd med kan_lagg_till_personal i församlingen: bara ideell.
CREATE OR REPLACE FUNCTION public.can_grant_church_role(target_church INT, target_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN target_role NOT IN ('ideell','anstalld','fadmin','kiosk') THEN false
    WHEN public.is_system_super_admin() THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.churches c
      WHERE c.id = target_church AND c.pastorat_id IS NOT NULL
        AND c.pastorat_id IN (SELECT public.admin_pastorat_ids())
    ) THEN true
    WHEN public.membership_admin_level(target_church) = 'forsamling' THEN true
    WHEN target_role = 'ideell' AND public.has_staff_permission_for_church(target_church, 'kan_lagg_till_personal') THEN true
    ELSE false
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får den inloggade ge pastoratsroll (padmin) i target_pastorat?
-- Bara superadmin eller pastoratsadmin i samma pastorat.
CREATE OR REPLACE FUNCTION public.can_grant_pastorat_role(target_pastorat INT)
RETURNS BOOLEAN AS $$
  SELECT public.can_admin_pastorat(target_pastorat);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får den inloggade ge systemadminrättigheter? Bara en systemadmin.
CREATE OR REPLACE FUNCTION public.can_grant_system_admin()
RETURNS BOOLEAN AS $$
  SELECT public.is_system_super_admin();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- =====================================================================
-- DEL 5: Skrivfunktioner (körs med anroparens EGNA inloggning, auth.uid(),
-- aldrig service role – så databasen alltid kan neka. Varje funktion som
-- ändrar någon annans behörighet nekar om: anroparen försöker ändra sig
-- själv, anroparen saknar rätt (can_grant_*), eller målpersonens nuvarande
-- nivå i området redan är högre än anroparens. Varje lyckad ändring loggas
-- i membership_audit.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.grant_church_membership(target_profile UUID, target_church INT, target_role TEXT)
RETURNS VOID AS $$
DECLARE
  caller_level TEXT;
  existing     RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() = target_profile THEN
    RAISE EXCEPTION 'Du kan inte ge dig själv en roll.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_grant_church_role(target_church, target_role) THEN
    RAISE EXCEPTION 'Saknar behörighet att ge den här rollen i den här församlingen.' USING ERRCODE = '42501';
  END IF;

  SELECT role, admin_level INTO existing
  FROM public.profile_churches WHERE profile_id = target_profile AND church_id = target_church;

  caller_level := CASE
    WHEN public.is_system_super_admin() THEN 'super'
    WHEN public.has_pastorat_admin_access(target_church) THEN 'pastorat'
    WHEN public.membership_admin_level(target_church) = 'forsamling' THEN 'forsamling'
    ELSE 'none'
  END;

  IF public.level_rank(COALESCE(existing.admin_level, 'none')) > public.level_rank(caller_level) THEN
    RAISE EXCEPTION 'Personen har redan högre behörighet än du har i den här församlingen.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profile_churches (profile_id, church_id, role, admin_level, is_employee, active, invited_by, invited_at, accepted_at)
  VALUES (target_profile, target_church, target_role, public.role_level(target_role), target_role = 'anstalld', true, auth.uid(), now(), NULL)
  ON CONFLICT (profile_id, church_id) DO UPDATE SET
    role = EXCLUDED.role,
    admin_level = EXCLUDED.admin_level,
    is_employee = EXCLUDED.is_employee,
    active = true,
    invited_by = auth.uid(),
    invited_at = now(),
    accepted_at = NULL;

  INSERT INTO public.membership_audit (changed_by, profile_id, scope, church_id, old_role, old_admin_level, new_role, new_admin_level)
  VALUES (auth.uid(), target_profile, 'church', target_church, existing.role, existing.admin_level, target_role, public.role_level(target_role));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_church_role(target_profile UUID, target_church INT, new_role TEXT)
RETURNS VOID AS $$
DECLARE
  caller_level TEXT;
  existing     RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() = target_profile THEN
    RAISE EXCEPTION 'Du kan inte ändra din egen roll.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_grant_church_role(target_church, new_role) THEN
    RAISE EXCEPTION 'Saknar behörighet att ge den här rollen i den här församlingen.' USING ERRCODE = '42501';
  END IF;

  SELECT role, admin_level INTO existing
  FROM public.profile_churches
  WHERE profile_id = target_profile AND church_id = target_church AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personen är inte medlem i den här församlingen.' USING ERRCODE = 'P0002';
  END IF;

  caller_level := CASE
    WHEN public.is_system_super_admin() THEN 'super'
    WHEN public.has_pastorat_admin_access(target_church) THEN 'pastorat'
    WHEN public.membership_admin_level(target_church) = 'forsamling' THEN 'forsamling'
    ELSE 'none'
  END;

  IF public.level_rank(existing.admin_level) > public.level_rank(caller_level) THEN
    RAISE EXCEPTION 'Personen har högre behörighet än du har i den här församlingen.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profile_churches SET
    role = new_role,
    admin_level = public.role_level(new_role),
    is_employee = (new_role = 'anstalld')
  WHERE profile_id = target_profile AND church_id = target_church;

  INSERT INTO public.membership_audit (changed_by, profile_id, scope, church_id, old_role, old_admin_level, new_role, new_admin_level)
  VALUES (auth.uid(), target_profile, 'church', target_church, existing.role, existing.admin_level, new_role, public.role_level(new_role));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.revoke_church_membership(target_profile UUID, target_church INT)
RETURNS VOID AS $$
DECLARE
  existing RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() = target_profile THEN
    RAISE EXCEPTION 'Du kan inte ta bort ditt eget medlemskap här.' USING ERRCODE = '42501';
  END IF;

  SELECT role, admin_level INTO existing
  FROM public.profile_churches WHERE profile_id = target_profile AND church_id = target_church AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personen är inte medlem i den här församlingen.' USING ERRCODE = 'P0002';
  END IF;

  -- Att ta bort någon kräver samma rätt som att ge den roll personen har idag.
  IF NOT public.can_grant_church_role(target_church, existing.role) THEN
    RAISE EXCEPTION 'Saknar behörighet att ta bort den här personen.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profile_churches SET active = false
  WHERE profile_id = target_profile AND church_id = target_church;

  INSERT INTO public.membership_audit (changed_by, profile_id, scope, church_id, old_role, old_admin_level, new_role, new_admin_level)
  VALUES (auth.uid(), target_profile, 'church', target_church, existing.role, existing.admin_level, NULL, 'none');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.grant_pastorat_membership(target_profile UUID, target_pastorat INT)
RETURNS VOID AS $$
DECLARE
  existing RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() = target_profile THEN
    RAISE EXCEPTION 'Du kan inte ge dig själv pastoratsbehörighet.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_grant_pastorat_role(target_pastorat) THEN
    RAISE EXCEPTION 'Saknar behörighet att ge pastoratsbehörighet här.' USING ERRCODE = '42501';
  END IF;

  SELECT role, active INTO existing
  FROM public.pastorat_memberships WHERE profile_id = target_profile AND pastorat_id = target_pastorat;

  INSERT INTO public.pastorat_memberships (profile_id, pastorat_id, role, active, invited_by, invited_at, accepted_at)
  VALUES (target_profile, target_pastorat, 'padmin', true, auth.uid(), now(), NULL)
  ON CONFLICT (profile_id, pastorat_id) DO UPDATE SET
    active = true, invited_by = auth.uid(), invited_at = now(), accepted_at = NULL;

  INSERT INTO public.membership_audit (changed_by, profile_id, scope, pastorat_id, old_role, old_admin_level, new_role, new_admin_level)
  VALUES (
    auth.uid(), target_profile, 'pastorat', target_pastorat,
    CASE WHEN existing.active THEN existing.role END,
    CASE WHEN existing.active THEN 'pastorat' END,
    'padmin', 'pastorat'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.revoke_pastorat_membership(target_profile UUID, target_pastorat INT)
RETURNS VOID AS $$
DECLARE
  existing RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() = target_profile THEN
    RAISE EXCEPTION 'Du kan inte ta bort din egen pastoratsbehörighet här.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_grant_pastorat_role(target_pastorat) THEN
    RAISE EXCEPTION 'Saknar behörighet att ta bort pastoratsbehörighet här.' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO existing
  FROM public.pastorat_memberships WHERE profile_id = target_profile AND pastorat_id = target_pastorat AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personen är inte pastoratsadmin här.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.pastorat_memberships SET active = false
  WHERE profile_id = target_profile AND pastorat_id = target_pastorat;

  INSERT INTO public.membership_audit (changed_by, profile_id, scope, pastorat_id, old_role, old_admin_level, new_role, new_admin_level)
  VALUES (auth.uid(), target_profile, 'pastorat', target_pastorat, existing.role, 'pastorat', NULL, 'none');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.grant_system_admin(target_profile UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() = target_profile THEN
    RAISE EXCEPTION 'Du kan inte ge dig själv systemadminrättigheter.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_grant_system_admin() THEN
    RAISE EXCEPTION 'Bara en systemadmin kan ge den här rättigheten.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.system_admins (profile_id, granted_by, granted_at)
  VALUES (target_profile, auth.uid(), now())
  ON CONFLICT (profile_id) DO NOTHING;

  INSERT INTO public.membership_audit (changed_by, profile_id, scope, old_role, old_admin_level, new_role, new_admin_level)
  VALUES (auth.uid(), target_profile, 'system', NULL, 'none', 'superadmin', 'super');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.revoke_system_admin(target_profile UUID)
RETURNS VOID AS $$
DECLARE
  remaining INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;
  IF auth.uid() = target_profile THEN
    RAISE EXCEPTION 'Du kan inte ta bort din egen systemadminrättighet.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_grant_system_admin() THEN
    RAISE EXCEPTION 'Bara en systemadmin kan ta bort den här rättigheten.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.system_admins WHERE profile_id = target_profile) THEN
    RAISE EXCEPTION 'Personen är inte systemadmin.' USING ERRCODE = 'P0002';
  END IF;

  -- Räkna alla andra systemadmin (nya tabellen och, under övergångsperioden,
  -- gamla superrader), så det alltid finns minst en kvar.
  SELECT count(*) INTO remaining FROM (
    SELECT profile_id FROM public.system_admins WHERE profile_id <> target_profile
    UNION
    SELECT id FROM public.profiles WHERE admin_level = 'super' AND id <> target_profile
    UNION
    SELECT profile_id FROM public.profile_churches
      WHERE active AND accepted_at IS NOT NULL AND admin_level = 'super' AND profile_id <> target_profile
  ) remaining_admins;

  IF remaining = 0 THEN
    RAISE EXCEPTION 'Det måste alltid finnas minst en systemadmin.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.system_admins WHERE profile_id = target_profile;

  INSERT INTO public.membership_audit (changed_by, profile_id, scope, old_role, old_admin_level, new_role, new_admin_level)
  VALUES (auth.uid(), target_profile, 'system', 'superadmin', 'super', NULL, 'none');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Accept/decline ändrar bara ens EGEN rad (accepted_at eller active),
-- aldrig roll eller nivå, och loggas därför inte i membership_audit.

CREATE OR REPLACE FUNCTION public.accept_church_membership(target_church INT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.profile_churches
  SET accepted_at = now()
  WHERE profile_id = auth.uid() AND church_id = target_church AND active AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingen väntande inbjudan hittades.' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decline_church_membership(target_church INT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.profile_churches
  SET active = false
  WHERE profile_id = auth.uid() AND church_id = target_church AND active AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingen väntande inbjudan hittades.' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.accept_pastorat_membership(target_pastorat INT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.pastorat_memberships
  SET accepted_at = now()
  WHERE profile_id = auth.uid() AND pastorat_id = target_pastorat AND active AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingen väntande inbjudan hittades.' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decline_pastorat_membership(target_pastorat INT)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte inloggad.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.pastorat_memberships
  SET active = false
  WHERE profile_id = auth.uid() AND pastorat_id = target_pastorat AND active AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingen väntande inbjudan hittades.' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================================
-- DEL 6: RLS-policyer
-- =====================================================================

-- CHURCHES: churches_select_all (USING true, sedan migration 002) har aldrig
-- tagits bort, så alla har kunnat läsa alla församlingar. Ersätts nu.
DROP POLICY IF EXISTS "churches_select_all" ON public.churches;
DROP POLICY IF EXISTS "churches_select_members" ON public.churches;
CREATE POLICY "churches_select_members" ON public.churches FOR SELECT
  USING (
    public.can_access_church(id)
    OR EXISTS (
      SELECT 1 FROM public.profile_churches pc
      WHERE pc.profile_id = auth.uid() AND pc.church_id = churches.id
        AND pc.active AND pc.accepted_at IS NULL
    )
  );

-- PASTORAT: samma problem med pastorat_select_all (USING true).
DROP POLICY IF EXISTS "pastorat_select_all" ON public.pastorat;
DROP POLICY IF EXISTS "pastorat_select_members" ON public.pastorat;
CREATE POLICY "pastorat_select_members" ON public.pastorat FOR SELECT
  USING (public.can_view_pastorat(id));

DROP POLICY IF EXISTS "pastorat_modify_super" ON public.pastorat;
CREATE POLICY "pastorat_modify_super" ON public.pastorat FOR ALL
  USING (public.is_system_super_admin())
  WITH CHECK (public.is_system_super_admin());

-- KYRKOR: samma problem med kyrkor_select_all (USING true).
DROP POLICY IF EXISTS "kyrkor_select_all" ON public.kyrkor;
DROP POLICY IF EXISTS "kyrkor_select_members" ON public.kyrkor;
CREATE POLICY "kyrkor_select_members" ON public.kyrkor FOR SELECT
  USING (public.can_access_church(forsamling_id));

-- PASTORAT_MEMBERSHIPS: egna rader, eller pastoratsadmin för pastoratet.
DROP POLICY IF EXISTS "pastorat_memberships_select" ON public.pastorat_memberships;
CREATE POLICY "pastorat_memberships_select" ON public.pastorat_memberships FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.can_admin_pastorat(pastorat_id)
  );

-- SYSTEM_ADMINS: egen rad, eller systemadmin.
DROP POLICY IF EXISTS "system_admins_select" ON public.system_admins;
CREATE POLICY "system_admins_select" ON public.system_admins FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.is_system_super_admin()
  );

-- MEMBERSHIP_AUDIT: systemadmin, eller admin för det område raden gäller.
DROP POLICY IF EXISTS "membership_audit_select" ON public.membership_audit;
CREATE POLICY "membership_audit_select" ON public.membership_audit FOR SELECT
  USING (
    public.is_system_super_admin()
    OR (scope = 'church' AND church_id IS NOT NULL AND public.can_admin_church(church_id))
    OR (scope = 'pastorat' AND pastorat_id IS NOT NULL AND public.can_admin_pastorat(pastorat_id))
  );

-- =====================================================================
-- DEL 7: Rättigheter på funktionerna
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.is_system_super_admin()                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_pastorat_ids()                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_pastorat_admin_access(INT)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_admin_pastorat(INT)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_pastorat(INT)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_grant_church_role(INT, TEXT)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_grant_pastorat_role(INT)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_grant_system_admin()                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_church_membership(UUID, INT, TEXT)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_church_role(UUID, INT, TEXT)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_church_membership(UUID, INT)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_pastorat_membership(UUID, INT)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_pastorat_membership(UUID, INT)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_system_admin(UUID)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_system_admin(UUID)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_church_membership(INT)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_church_membership(INT)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_pastorat_membership(INT)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_pastorat_membership(INT)                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_system_super_admin()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pastorat_ids()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pastorat_admin_access(INT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_pastorat(INT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_pastorat(INT)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_grant_church_role(INT, TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_grant_pastorat_role(INT)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_grant_system_admin()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_church_membership(UUID, INT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_church_role(UUID, INT, TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_church_membership(UUID, INT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_pastorat_membership(UUID, INT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_pastorat_membership(UUID, INT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_system_admin(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_system_admin(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_church_membership(INT)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_church_membership(INT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_pastorat_membership(INT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_pastorat_membership(INT)           TO authenticated;
