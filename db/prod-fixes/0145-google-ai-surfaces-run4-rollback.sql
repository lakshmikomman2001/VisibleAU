-- 0145-google-ai-surfaces-run4-rollback.sql (Google AI surfaces, Phase 1, part 1): ONLY IF run2 HAS TO BE
-- UNDONE, with the code from before this push deployed (the pushed code names these tables).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Sri-authorized only. NOT run from Claude Code.
--
-- Drops only the five tables run2 created; no existing table is touched, so no existing data goes with
-- them. It refuses (RAISE EXCEPTION, nothing dropped) if any of them holds a row: a recorded setting,
-- change, postcode or Google result would be lost. To undo after Google has run, turn the env switch
-- GOOGLE_AI_SURFACES_ENABLED off instead (redeploy) -- that stops every Google call and keeps the rows.

BEGIN;

DO $$
DECLARE
  n BIGINT;
BEGIN
  SELECT (SELECT count(*) FROM feature_settings) + (SELECT count(*) FROM feature_setting_changes)
       + (SELECT count(*) FROM brand_google_locations) + (SELECT count(*) FROM audit_google_surfaces)
       + (SELECT count(*) FROM google_surface_results)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION '0145 rollback refused: the Google tables hold % row(s); nothing was dropped', n;
  END IF;
END $$;

DROP TABLE IF EXISTS "google_surface_results";
DROP TABLE IF EXISTS "audit_google_surfaces";
DROP TABLE IF EXISTS "brand_google_locations";
DROP TABLE IF EXISTS "feature_setting_changes";
DROP TABLE IF EXISTS "feature_settings";

COMMIT;

-- Check. Expected: all five f.
SELECT
  to_regclass('public.feature_settings') IS NOT NULL        AS feature_settings,
  to_regclass('public.feature_setting_changes') IS NOT NULL AS feature_setting_changes,
  to_regclass('public.brand_google_locations') IS NOT NULL  AS brand_google_locations,
  to_regclass('public.audit_google_surfaces') IS NOT NULL   AS audit_google_surfaces,
  to_regclass('public.google_surface_results') IS NOT NULL  AS google_surface_results;
