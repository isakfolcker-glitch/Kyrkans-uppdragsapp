-- Migration 012: Ansökningar om konto (självregistrering för ideella)
-- En ideell kan ansöka om ett konto via /ansok. Ansökan granskas av en
-- admin (försiktig/pastorat/super) som antingen godkänner (skickar en
-- vanlig inbjudan) eller avslår den.

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  birth_year INT,
  church_id INT REFERENCES churches(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);
CREATE INDEX IF NOT EXISTS applications_email_idx ON applications(lower(email));

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Vem som helst (även utloggad) kan skicka in en ansökan.
CREATE POLICY "applications_insert_public" ON applications FOR INSERT
  WITH CHECK (status = 'pending');

-- Bara admin kan se och granska ansökningar.
CREATE POLICY "applications_select_admin" ON applications FOR SELECT
  USING (is_admin());
CREATE POLICY "applications_update_admin" ON applications FOR UPDATE
  USING (is_admin());
CREATE POLICY "applications_delete_admin" ON applications FOR DELETE
  USING (is_admin());

-- Explicita GRANTs (krävs sedan Supabase slutade auto-exponera nya tabeller).
GRANT SELECT, INSERT ON applications TO anon, authenticated;
GRANT UPDATE, DELETE ON applications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE applications_id_seq TO anon, authenticated;
