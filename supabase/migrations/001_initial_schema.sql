-- =====================================================
-- Kyrkans uppdragsapp – Databassschema
-- =====================================================

-- Pastorat
CREATE TABLE IF NOT EXISTS pastorat (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kyrkor / Församlingar
CREATE TABLE IF NOT EXISTS churches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  admin_name TEXT,
  tel TEXT,
  address TEXT,
  pastorat_id INT REFERENCES pastorat(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uppdragsgrupper
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  cls TEXT NOT NULL DEFAULT 'tag-extra',
  church_id INT REFERENCES churches(id) ON DELETE CASCADE
);

-- Profiler (kopplade till auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'ideell'
    CHECK (role IN ('ideell','anstalld','fadmin','padmin','superadmin','kiosk')),
  admin_level TEXT NOT NULL DEFAULT 'none'
    CHECK (admin_level IN ('none','forsamling','pastorat','super')),
  is_employee BOOLEAN NOT NULL DEFAULT false,
  church_id INT REFERENCES churches(id) ON DELETE SET NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  ini TEXT,
  av_color TEXT DEFAULT '#EEEDFE',
  ac_color TEXT DEFAULT '#3C3489',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profil ↔ Grupper (många-till-många)
CREATE TABLE IF NOT EXISTS profile_groups (
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, group_id)
);

-- Pass
CREATE TABLE IF NOT EXISTS passes (
  id SERIAL PRIMARY KEY,
  church_id INT REFERENCES churches(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  date_str TEXT NOT NULL,
  time_str TEXT NOT NULL,
  plats TEXT NOT NULL DEFAULT '',
  spots INT NOT NULL DEFAULT 2,
  filled INT NOT NULL DEFAULT 0,
  vk TEXT DEFAULT '',
  tel TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cancelled BOOLEAN NOT NULL DEFAULT false,
  pub_status TEXT NOT NULL DEFAULT 'live' CHECK (pub_status IN ('live','scheduled')),
  pub_date TEXT DEFAULT '',
  kiosk_visible BOOLEAN NOT NULL DEFAULT false,
  import_ref TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pass ↔ Grupper
CREATE TABLE IF NOT EXISTS pass_groups (
  pass_id INT REFERENCES passes(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (pass_id, group_id)
);

-- Pass ↔ Ansvariga anställda
CREATE TABLE IF NOT EXISTS pass_responsible (
  pass_id INT REFERENCES passes(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (pass_id, profile_id)
);

-- Bokningar
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  pass_id INT REFERENCES passes(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  ini TEXT,
  av_color TEXT DEFAULT '#F1EFE8',
  ac_color TEXT DEFAULT '#5F5E5A',
  mail TEXT DEFAULT '',
  tel TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','manual','kiosk')),
  no_account BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Passhistorik
CREATE TABLE IF NOT EXISTS pass_history (
  id SERIAL PRIMARY KEY,
  pass_id INT REFERENCES passes(id) ON DELETE CASCADE NOT NULL,
  entry TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notiser
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reminder','cancelled','new_pass','message')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Utskickslogg
CREATE TABLE IF NOT EXISTS message_logs (
  id SERIAL PRIMARY KEY,
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_name TEXT NOT NULL,
  to_label TEXT NOT NULL,
  to_count INT NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Notifikationsinställningar per användare
-- =====================================================
CREATE TABLE IF NOT EXISTS notif_settings (
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  passdag BOOLEAN DEFAULT true,
  pamin BOOLEAN DEFAULT true,
  instllt BOOLEAN DEFAULT true,
  nyttpass BOOLEAN DEFAULT true,
  meddelande BOOLEAN DEFAULT true
);

-- =====================================================
-- Automatisk updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER passes_updated_at BEFORE UPDATE ON passes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- Automatisk profil vid ny användare
-- =====================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, role, admin_level, is_employee)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'ideell'),
    COALESCE(NEW.raw_user_meta_data->>'admin_level', 'none'),
    COALESCE((NEW.raw_user_meta_data->>'is_employee')::boolean, false)
  );
  INSERT INTO notif_settings (profile_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- Funktion: uppdatera filled när bokning läggs till/tas bort
-- =====================================================
CREATE OR REPLACE FUNCTION update_pass_filled()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE passes SET filled = filled + 1 WHERE id = NEW.pass_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE passes SET filled = GREATEST(0, filled - 1) WHERE id = OLD.pass_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER bookings_filled_insert
  AFTER INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION update_pass_filled();
CREATE OR REPLACE TRIGGER bookings_filled_delete
  AFTER DELETE ON bookings FOR EACH ROW EXECUTE FUNCTION update_pass_filled();

-- =====================================================
-- Grunddata: Grupper
-- =====================================================
INSERT INTO groups (id, label, cls) VALUES
  ('kv',      'Katedralvärd', 'tag-kv'),
  ('bv',      'Dörrvakt',     'tag-bv'),
  ('brand',   'Brandvakt',    'tag-brand'),
  ('konsert', 'Konsertvärd',  'tag-konsert'),
  ('extra',   'Extra hjälp',  'tag-extra'),
  ('vakt',    'Nattväkt',     'tag-vakt'),
  ('kor',     'Körvärd',      'tag-kor')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Grunddata: Pastorat och Kyrkor (kan ändras)
-- =====================================================
INSERT INTO pastorat (name) VALUES ('Växjö pastorat') ON CONFLICT DO NOTHING;

INSERT INTO churches (name, admin_name, tel, pastorat_id) VALUES
  ('Växjö domkyrka', 'Anna K', '073-100 00 01', 1),
  ('Öjaby kyrka',    'Bo M',   '073-100 00 02', 1),
  ('Sandsbro kyrka', 'Lena P', '073-100 00 03', 1),
  ('Rottne kyrka',   'Karin J','073-100 00 04', 1)
ON CONFLICT DO NOTHING;
