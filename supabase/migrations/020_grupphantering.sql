-- Gruppens kontaktperson. Ger inga nya behörigheter eller passansvar.
-- Kör efter 019, först mot testdatabasen. Befintliga grupper får NULL.
BEGIN;

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS responsible_profile_id UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS groups_responsible_profile_idx
  ON public.groups(responsible_profile_id) WHERE responsible_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_group_responsible()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.responsible_profile_id IS NOT NULL THEN
    IF NEW.church_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profile_churches m
      WHERE m.profile_id = NEW.responsible_profile_id AND m.church_id = NEW.church_id
        AND m.active AND m.accepted_at IS NOT NULL AND m.is_employee
        AND m.role IN ('anstalld', 'fadmin', 'padmin', 'superadmin')
    ) THEN
      RAISE EXCEPTION 'Ansvarig måste vara aktiv anställd i gruppens församling' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS groups_validate_responsible ON public.groups;
CREATE TRIGGER groups_validate_responsible
  BEFORE INSERT OR UPDATE OF responsible_profile_id, church_id ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_group_responsible();

-- Avslutat medlemskap, avböjd inbjudan eller byte till ideell/kiosk tar bort
-- kontaktansvaret i just den församlingen, utan att påverka andra församlingar.
CREATE OR REPLACE FUNCTION public.clear_ineligible_group_responsible()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET responsible_profile_id = NULL
      WHERE church_id = OLD.church_id AND responsible_profile_id = OLD.profile_id;
    RETURN OLD;
  END IF;
  IF NOT NEW.active OR NEW.accepted_at IS NULL OR NOT NEW.is_employee
    OR NEW.role NOT IN ('anstalld', 'fadmin', 'padmin', 'superadmin')
    OR NEW.profile_id <> OLD.profile_id OR NEW.church_id <> OLD.church_id THEN
    UPDATE public.groups SET responsible_profile_id = NULL
      WHERE church_id = OLD.church_id AND responsible_profile_id = OLD.profile_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS memberships_clear_group_responsible ON public.profile_churches;
CREATE TRIGGER memberships_clear_group_responsible
  AFTER UPDATE OR DELETE ON public.profile_churches
  FOR EACH ROW EXECUTE FUNCTION public.clear_ineligible_group_responsible();

-- En transaktion för namn, färg, kontaktperson och medlemsändringar.
-- API:t kontrollerar canAdminOrStaff(..., kan_hantera_grupper, church_id).
-- Funktionen kan endast anropas med service_role, aldrig direkt av klienten.
-- Medlemsändringar skickas som tillägg/borttagningar så att andra samtidiga
-- redigeringar och medlemskap i andra grupper/församlingar bevaras.
CREATE OR REPLACE FUNCTION public.save_group_management(
  p_group_id TEXT, p_church_id INT, p_label TEXT, p_cls TEXT,
  p_responsible_profile_id UUID, p_add_member_ids UUID[],
  p_remove_member_ids UUID[], p_create BOOLEAN DEFAULT false
) RETURNS JSONB LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  result public.groups;
BEGIN
  IF p_church_id IS NULL OR p_church_id <= 0 OR p_label IS NULL
    OR length(trim(p_label)) NOT BETWEEN 1 AND 100
    OR p_cls IS NULL OR p_cls !~ '^tag-[a-z0-9-]{1,40}$'
    OR p_add_member_ids IS NULL OR p_remove_member_ids IS NULL
    OR cardinality(p_add_member_ids) > 1000 OR cardinality(p_remove_member_ids) > 1000
    OR p_add_member_ids && p_remove_member_ids THEN
    RAISE EXCEPTION 'Ogiltig grupp' USING ERRCODE = '22023';
  END IF;

  -- Lås medlemskap före gruppen, samma ordning som medlemskapets städtrigger.
  PERFORM 1 FROM public.profile_churches m
    WHERE m.church_id = p_church_id
      AND (m.profile_id = ANY(p_add_member_ids || p_remove_member_ids)
           OR m.profile_id = p_responsible_profile_id)
    ORDER BY m.profile_id FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM unnest(p_add_member_ids || p_remove_member_ids) AS requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profile_churches m
      WHERE m.profile_id = requested.id AND m.church_id = p_church_id
        AND m.active AND m.accepted_at IS NOT NULL AND m.role <> 'kiosk'
    )
  ) THEN
    RAISE EXCEPTION 'Medlemmen tillhör inte församlingen' USING ERRCODE = '22023';
  END IF;

  IF p_create THEN
    INSERT INTO public.groups(id, church_id, label, cls, responsible_profile_id)
    VALUES (p_group_id, p_church_id, trim(p_label), p_cls, p_responsible_profile_id)
    RETURNING * INTO result;
  ELSE
    SELECT * INTO result FROM public.groups
      WHERE id = p_group_id AND church_id = p_church_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gruppen finns inte i församlingen' USING ERRCODE = '22023'; END IF;
    UPDATE public.groups SET label = trim(p_label), cls = p_cls,
      responsible_profile_id = p_responsible_profile_id
      WHERE id = p_group_id RETURNING * INTO result;
  END IF;

  DELETE FROM public.profile_groups WHERE group_id = p_group_id AND profile_id = ANY(p_remove_member_ids);
  INSERT INTO public.profile_groups(group_id, profile_id)
    SELECT p_group_id, id FROM unnest(p_add_member_ids) AS requested(id)
    ON CONFLICT (profile_id, group_id) DO NOTHING;
  RETURN to_jsonb(result);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_group_responsible() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_ineligible_group_responsible() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_group_management(TEXT, INT, TEXT, TEXT, UUID, UUID[], UUID[], BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_group_management(TEXT, INT, TEXT, TEXT, UUID, UUID[], UUID[], BOOLEAN)
  TO service_role;

COMMIT;
