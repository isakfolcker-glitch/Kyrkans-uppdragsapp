-- =====================================================
-- Migration 005: Tillåt admins att promota roller
-- =====================================================

-- Hjälpfunktion: kan den inloggade användaren sätta ett givet admin_level?
CREATE OR REPLACE FUNCTION can_set_admin_level(target_level TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN current_admin_level() = 'super'     THEN true
    WHEN current_admin_level() = 'pastorat'  THEN target_level IN ('none','forsamling','pastorat')
    WHEN current_admin_level() = 'forsamling' THEN target_level IN ('none','forsamling')
    ELSE false
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Hjälpfunktion: är målanvändaren i samma kyrka som den inloggade?
CREATE OR REPLACE FUNCTION same_church_as(target_profile_id UUID)
RETURNS BOOLEAN AS $$
  SELECT (
    SELECT church_id FROM profiles WHERE id = target_profile_id
  ) = current_church_id()
    OR current_admin_level() IN ('pastorat','super');
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- =====================================================
-- Ersätt den gamla update-policyn för profiles
-- =====================================================
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

-- Admin kan uppdatera profiler de har rätt till, men bara sätta
-- admin_level som de själva har behörighet att tilldela.
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (
    -- Pastorat/super kan uppdatera alla i sitt pastorat
    (current_admin_level() IN ('pastorat','super') AND same_church_as(id))
    -- Församlingsadmin kan uppdatera i sin kyrka
    OR (current_admin_level() = 'forsamling' AND church_id = current_church_id())
  )
  WITH CHECK (
    -- Kontrollera att den nya admin_level är tillåten för den som uppdaterar
    can_set_admin_level(admin_level)
  );

-- =====================================================
-- Supabase Auth: sätt rätt profil från user_metadata vid inbjudan
-- =====================================================
-- Denna trigger körs när en inbjuden användare accepterar och får en session.
-- Den kopierar name, role, admin_level, church_id, is_employee från user_metadata.
CREATE OR REPLACE FUNCTION handle_invited_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL AND NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.profiles (
      id,
      email,
      name,
      role,
      admin_level,
      church_id,
      is_employee
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Koppla triggern till auth.users (körs vid INSERT, dvs när användaren skapas via invite)
DROP TRIGGER IF EXISTS on_auth_user_invited ON auth.users;
CREATE TRIGGER on_auth_user_invited
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_invited_user();
