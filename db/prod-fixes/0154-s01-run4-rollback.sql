-- 0154-s01-run4-rollback.sql (23 Nov 2026, sprint S01 part 2): undoes migration 0154. ONLY with the pre-S01 code
-- deployed (the S01 code selects these columns with every report, schedule, branding row and brand).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES, AND LOSES DATA: report preferences, action choices and notes, agency actions, report snapshots and tiers,
-- tier names and ABN suggestions. Take a pg_dump of the three tables and the four altered tables first.
BEGIN;

DROP TABLE IF EXISTS "report_action_choices";
DROP TABLE IF EXISTS "report_brand_preferences";
DROP TABLE IF EXISTS "agency_actions";

ALTER TABLE "generated_reports" DROP CONSTRAINT IF EXISTS "generated_reports_report_tier_check";
ALTER TABLE "generated_reports" DROP COLUMN IF EXISTS "report_tier";
ALTER TABLE "generated_reports" DROP COLUMN IF EXISTS "contents_snapshot";

ALTER TABLE "report_delivery_schedules" DROP CONSTRAINT IF EXISTS "report_delivery_schedules_report_tier_check";
ALTER TABLE "report_delivery_schedules" DROP COLUMN IF EXISTS "report_tier";

ALTER TABLE "agency_brand_assets" DROP CONSTRAINT IF EXISTS "agency_brand_assets_report_tier_names_workspace_only";
ALTER TABLE "agency_brand_assets" DROP CONSTRAINT IF EXISTS "agency_brand_assets_report_tier_names_check";
ALTER TABLE "agency_brand_assets" DROP COLUMN IF EXISTS "report_tier_names";
DROP FUNCTION IF EXISTS "report_tier_names_ok"(JSONB);

ALTER TABLE "brands" DROP COLUMN IF EXISTS "abn_suggestion";

COMMIT;
