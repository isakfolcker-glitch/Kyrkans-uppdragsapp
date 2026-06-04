-- Migration 008: Granulerat behörighetssystem för anställda
-- Pastorat/superadmin har alltid alla behörigheter.
-- Anställda (anstalld) får specifika behörigheter via denna tabell.

CREATE TABLE IF NOT EXISTS staff_permissions (
  profile_id              UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  kan_skapa_pass          BOOLEAN NOT NULL DEFAULT false,
  kan_redigera_pass       BOOLEAN NOT NULL DEFAULT false,
  kan_se_bokningar        BOOLEAN NOT NULL DEFAULT false,
  kan_hantera_bokningar   BOOLEAN NOT NULL DEFAULT false,
  kan_se_personal         BOOLEAN NOT NULL DEFAULT false,
  kan_lagg_till_personal  BOOLEAN NOT NULL DEFAULT false,
  kan_hantera_grupper     BOOLEAN NOT NULL DEFAULT false,
  kan_skicka_utskick      BOOLEAN NOT NULL DEFAULT false,
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- RLS: bara admin kan läsa/skriva
ALTER TABLE staff_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_permissions_read" ON staff_permissions FOR SELECT
  USING (
    profile_id = auth.uid()
    OR current_admin_level() IN ('forsamling','pastorat','super')
  );

CREATE POLICY "staff_permissions_write" ON staff_permissions FOR ALL
  USING (current_admin_level() IN ('forsamling','pastorat','super'))
  WITH CHECK (current_admin_level() IN ('forsamling','pastorat','super'));
