-- =====================================================
-- Migration 012: Säkerhetshärdning av databasfunktioner
-- =====================================================
-- Fix 1: Lägg till SET search_path = public på alla funktioner
--         för att förhindra search_path-manipulationsattacker.
-- Fix 2: Återkalla EXECUTE-behörighet från anon-rollen på
--         interna hjälpfunktioner som inte ska vara publika.
-- =====================================================

-- update_updated_at (triggerfunktion)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- update_pass_filled (triggerfunktion)
CREATE OR REPLACE FUNCTION public.update_pass_filled()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.passes SET filled = filled + 1 WHERE id = NEW.pass_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.passes SET filled = GREATEST(0, filled - 1) WHERE id = OLD.pass_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- current_admin_level
CREATE OR REPLACE FUNCTION public.current_admin_level()
RETURNS TEXT AS $$
  SELECT admin_level FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- current_church_id
CREATE OR REPLACE FUNCTION public.current_church_id()
RETURNS INT AS $$
  SELECT church_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    admin_level IN ('forsamling','pastorat','super'),
    false
  )
  FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- is_responsible_for
CREATE OR REPLACE FUNCTION public.is_responsible_for(pass_id_arg INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pass_responsible
    WHERE pass_id = pass_id_arg AND profile_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- can_set_admin_level
CREATE OR REPLACE FUNCTION public.can_set_admin_level(target_level TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN public.current_admin_level() = 'super'      THEN true
    WHEN public.current_admin_level() = 'pastorat'   THEN target_level IN ('none','forsamling','pastorat')
    WHEN public.current_admin_level() = 'forsamling' THEN target_level IN ('none','forsamling')
    ELSE false
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- same_church_as
CREATE OR REPLACE FUNCTION public.same_church_as(target_profile_id UUID)
RETURNS BOOLEAN AS $$
  SELECT (
    SELECT church_id FROM public.profiles WHERE id = target_profile_id
  ) = public.current_church_id()
    OR public.current_admin_level() IN ('pastorat','super');
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- handle_new_user (triggerfunktion)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, admin_level, is_employee)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'ideell'),
    COALESCE(NEW.raw_user_meta_data->>'admin_level', 'none'),
    COALESCE((NEW.raw_user_meta_data->>'is_employee')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.notif_settings (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- handle_invited_user (triggerfunktion)
CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL AND NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.profiles (
      id, email, name, role, admin_level, church_id, is_employee
    ) VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
      COALESCE(NEW.raw_user_meta_data->>'role', 'ideell'),
      COALESCE(NEW.raw_user_meta_data->>'admin_level', 'none'),
      (NEW.raw_user_meta_data->>'church_id')::INT,
      COALESCE((NEW.raw_user_meta_data->>'is_employee')::BOOLEAN, false)
    )
    ON CONFLICT (id) DO UPDATE SET
      name        = EXCLUDED.name,
      role        = EXCLUDED.role,
      admin_level = EXCLUDED.admin_level,
      church_id   = EXCLUDED.church_id,
      is_employee = EXCLUDED.is_employee;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- Fix 2: Återkalla EXECUTE från anon-rollen
-- Dessa funktioner ska inte vara anropbara direkt via
-- REST API (/rest/v1/rpc/...) utan autentisering.
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.current_admin_level()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_church_id()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_responsible_for(INT)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_set_admin_level(TEXT)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.same_church_as(UUID)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_invited_user()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_pass_filled()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at()            FROM anon;
