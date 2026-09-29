-- Fångar upp säkerhetshärdningen som kördes direkt i produktionsdatabasen
-- (Supabase-migration "012_security_hardening", 2026-06-15) men aldrig sparades
-- i repot. Utan denna fil saknar en nybyggd databas (t.ex. testmiljön)
-- fast search_path på funktionerna och anon kan anropa behörighetsfunktionerna.
-- Idempotent: säker att köra mot produktion där den redan är tillämpad.

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

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

CREATE OR REPLACE FUNCTION public.current_admin_level()
RETURNS TEXT AS $$
  SELECT admin_level FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_church_id()
RETURNS INT AS $$
  SELECT church_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(admin_level IN ('forsamling','pastorat','super'), false)
  FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_responsible_for(pass_id_arg INT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pass_responsible
    WHERE pass_id = pass_id_arg AND profile_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_set_admin_level(target_level TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN public.current_admin_level() = 'super'      THEN true
    WHEN public.current_admin_level() = 'pastorat'   THEN target_level IN ('none','forsamling','pastorat')
    WHEN public.current_admin_level() = 'forsamling' THEN target_level IN ('none','forsamling')
    ELSE false
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.same_church_as(target_profile_id UUID)
RETURNS BOOLEAN AS $$
  SELECT (
    SELECT church_id FROM public.profiles WHERE id = target_profile_id
  ) = public.current_church_id()
    OR public.current_admin_level() IN ('pastorat','super');
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

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

CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL AND NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, name, role, admin_level, church_id, is_employee)
    VALUES (
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

-- Rättigheter och index för applications som produktionen har men 014 saknade
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);
CREATE INDEX IF NOT EXISTS applications_email_idx ON applications(lower(email));
GRANT SELECT, INSERT ON applications TO anon, authenticated;
GRANT UPDATE, DELETE ON applications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE applications_id_seq TO anon, authenticated;
