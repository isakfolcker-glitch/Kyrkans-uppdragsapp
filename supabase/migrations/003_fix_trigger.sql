-- =====================================================
-- Fix: Tillåt trigger att skapa profil utan RLS-block
-- =====================================================

-- Uppdatera INSERT-policy för profiles så trigger kan köra
DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (
    id = auth.uid()          -- Användaren skapar sin egen profil
    OR auth.uid() IS NULL    -- Systemtrigger (ingen inloggad användare)
  );

-- Uppdatera notif_settings så trigger kan skapa rad
DROP POLICY IF EXISTS "notif_settings_own" ON notif_settings;
CREATE POLICY "notif_settings_select" ON notif_settings FOR SELECT
  USING (profile_id = auth.uid());
CREATE POLICY "notif_settings_insert" ON notif_settings FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    OR auth.uid() IS NULL
  );
CREATE POLICY "notif_settings_update" ON notif_settings FOR UPDATE
  USING (profile_id = auth.uid());

-- Återskapa triggerfunktionen med explicit schema-sökväg
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, admin_level, is_employee)
  VALUES (
    NEW.id,
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
