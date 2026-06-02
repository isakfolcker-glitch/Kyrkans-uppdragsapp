-- Migration 006: Lägg till fält för onboarding-formulär
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_year   INT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT false;
