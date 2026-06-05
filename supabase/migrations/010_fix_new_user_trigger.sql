-- Migration 010: Fix handle_new_user trigger to include email column
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
