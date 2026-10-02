-- Kör efter 019 (och 020 om grupphanteringen installerats).
-- Ägaren binds en gång av servern efter verifierad inloggning och SYSTEM_OWNER_EMAIL.
-- Tom tabell innebär att ingen har systembehörighet. Gamla superroller är lokala.
BEGIN;
CREATE TABLE IF NOT EXISTS public.system_owner (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT
);
ALTER TABLE public.system_owner ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_owner FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.system_owner TO service_role;

CREATE OR REPLACE FUNCTION public.claim_system_owner(p_profile_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.system_owner (profile_id) VALUES (p_profile_id)
    ON CONFLICT (singleton) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.system_owner WHERE profile_id = p_profile_id) THEN
    RAISE EXCEPTION 'System owner is already bound' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_system_owner(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_system_owner(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.is_system_super_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.system_owner WHERE profile_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_system_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_system_super_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_admin_level()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN public.is_system_super_admin() THEN 'super'
    WHEN EXISTS (SELECT 1 FROM public.profile_churches WHERE profile_id = auth.uid()
      AND active AND accepted_at IS NOT NULL AND admin_level IN ('pastorat','super')) THEN 'pastorat'
    WHEN EXISTS (SELECT 1 FROM public.profile_churches WHERE profile_id = auth.uid()
      AND active AND accepted_at IS NOT NULL AND admin_level = 'forsamling') THEN 'forsamling'
    ELSE 'none' END;
$$;

CREATE OR REPLACE FUNCTION public.can_set_admin_level(target_level TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT target_level <> 'super' AND CASE public.current_admin_level()
    WHEN 'super' THEN target_level IN ('none','forsamling','pastorat')
    WHEN 'pastorat' THEN target_level IN ('none','forsamling','pastorat')
    WHEN 'forsamling' THEN target_level IN ('none','forsamling') ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pastorat_ids()
RETURNS SETOF INT LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT DISTINCT c.pastorat_id FROM public.profile_churches pc
  JOIN public.churches c ON c.id = pc.church_id
  WHERE pc.profile_id = auth.uid() AND pc.active AND pc.accepted_at IS NOT NULL
    AND pc.admin_level IN ('pastorat','super') AND c.pastorat_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_admin_church_for(target_church INT, uid UUID)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.system_owner WHERE profile_id = uid)
    OR EXISTS (SELECT 1 FROM public.profile_churches pc
      WHERE pc.profile_id = uid AND pc.active AND pc.accepted_at IS NOT NULL
      AND pc.church_id = target_church AND pc.admin_level IN ('forsamling','pastorat','super'))
    OR EXISTS (SELECT 1 FROM public.profile_churches pc
      JOIN public.churches mine ON mine.id = pc.church_id
      JOIN public.churches t ON t.id = target_church
      WHERE pc.profile_id = uid AND pc.active AND pc.accepted_at IS NOT NULL
      AND pc.admin_level IN ('pastorat','super')
      AND mine.pastorat_id IS NOT NULL AND mine.pastorat_id = t.pastorat_id));
$$;

CREATE OR REPLACE FUNCTION public.can_admin_church(target_church INT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.can_admin_church_for(target_church, auth.uid());
$$;

-- Protect the owner even when their legacy profile has no administrative role.
CREATE OR REPLACE FUNCTION public.profile_max_level(uid UUID)
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.system_owner WHERE profile_id = uid) THEN 'super'
    ELSE CASE GREATEST(
      COALESCE((SELECT public.level_rank(p.admin_level) FROM public.profiles p WHERE p.id = uid),0),
      COALESCE((SELECT max(public.level_rank(pc.admin_level)) FROM public.profile_churches pc WHERE pc.profile_id = uid AND pc.active),0))
    WHEN 3 THEN 'super' WHEN 2 THEN 'pastorat' WHEN 1 THEN 'forsamling' ELSE 'none' END END;
$$;
REVOKE ALL ON FUNCTION public.can_admin_church_for(INT, UUID), public.profile_max_level(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_church_for(INT, UUID), public.profile_max_level(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.current_admin_level(), public.can_set_admin_level(TEXT), public.admin_pastorat_ids(), public.can_admin_church(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_admin_level(), public.can_set_admin_level(TEXT), public.admin_pastorat_ids(), public.can_admin_church(INT) TO authenticated, service_role;
COMMIT;
