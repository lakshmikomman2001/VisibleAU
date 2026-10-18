-- Migration 0048 (Vunnara Build 1, Part D): structured, confirmed
-- location columns on brands.
--
-- suburb/city/state/country: the confirmed, structured location --
-- never parsed out of primary_regions' "STATE:Suburb" strings at read
-- time. location_mode distinguishes a brand with genuinely no fixed
-- address ("online_only") from one that simply hasn't confirmed its
-- location yet (NULL). location_confirmed_at is NULL until the user
-- actually confirms (via the now-required wizard step, or the
-- settings banner for existing brands) -- never backfilled or guessed
-- (NO MOCK DATA IN PRODUCTION).
--
-- ALL NULLABLE / NO DEFAULT -- metadata-only on Postgres (no table
-- rewrite), and live code between apply and push never has to handle
-- a NOT NULL column it doesn't know about yet.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS suburb text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS location_mode text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS location_confirmed_at timestamptz;
