-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Driver Onboarding Schema Update
-- ════════════════════════════════════════════════════════════════════════════
--
--  Adds `matricule` and `onboarding_completed` columns to `livreur.profiles`
--  to support driver onboarding tracking and human-readable IDs.
--
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add columns to livreur.profiles
ALTER TABLE livreur.profiles ADD COLUMN IF NOT EXISTS matricule text UNIQUE;
ALTER TABLE livreur.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN livreur.profiles.matricule IS 'Human-readable driver ID (e.g. LIV-2026-9284).';
COMMENT ON COLUMN livreur.profiles.onboarding_completed IS 'Flag indicating if the driver completed onboarding tour and vehicle setup.';

-- 2. Register this migration
INSERT INTO public._migrations (filename, app, checksum)
VALUES ('012_driver_onboarding.sql', 'livreur', null)
ON CONFLICT (filename) DO NOTHING;
