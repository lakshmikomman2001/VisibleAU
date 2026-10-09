-- Prod-apply for migration 0036 -- reproduced VERBATIM from
-- db/migrations/0036_youtube_presence_real_check.sql so the live schema
-- matches exactly what db/schema/youtube-presence-audits.ts (the Drizzle
-- model) expects. Apply this BEFORE deploying the code that reads/writes
-- these columns -- the 6/7 Oct lesson (migration 0034 reached main before
-- it reached prod; see docs/ops/post-launch-db-hardening.md section 30).
--
-- SRI: take a Neon snapshot/branch before running. Then run this file
-- with `psql -f db/prod-fixes/0036-apply-prod.sql "$PROD_DATABASE_URL"`
-- (or paste into the Neon SQL editor). NOT run from Claude Code.
--
-- Safety properties:
--   - Additive + nullable only: every new column allows NULL, so
--     existing rows (from the old stub cron) get NULL in all six and
--     keep passing their NOT NULL columns unchanged.
--   - Both CHECK constraints explicitly allow NULL, so existing rows
--     satisfy them immediately -- no backfill required.
--   - Idempotent: ADD COLUMN IF NOT EXISTS on all six, and both
--     constraints are wrapped in a DO block that swallows
--     duplicate_object -- safe to run twice if re-run by accident.
--   - channel_url already existed before this migration and is reused
--     as-is -- not touched here.

BEGIN;

ALTER TABLE youtube_presence_audits
  ADD COLUMN IF NOT EXISTS channel_id text;

ALTER TABLE youtube_presence_audits
  ADD COLUMN IF NOT EXISTS channel_title text;

ALTER TABLE youtube_presence_audits
  ADD COLUMN IF NOT EXISTS last_upload_at timestamptz;

ALTER TABLE youtube_presence_audits
  ADD COLUMN IF NOT EXISTS match_confidence numeric(4, 3);

ALTER TABLE youtube_presence_audits
  ADD COLUMN IF NOT EXISTS check_status text;

ALTER TABLE youtube_presence_audits
  ADD COLUMN IF NOT EXISTS unavailable_reason text;

DO $$
BEGIN
  ALTER TABLE youtube_presence_audits
    ADD CONSTRAINT youtube_presence_audits_check_status_check
    CHECK (check_status IS NULL OR check_status IN ('confirmed', 'not_found', 'unavailable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE youtube_presence_audits
    ADD CONSTRAINT youtube_presence_audits_unavailable_reason_check
    CHECK (
      unavailable_reason IS NULL
      OR unavailable_reason IN ('missing_api_key', 'quota_exceeded', 'network_error')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- After this runs: the real YouTube check (cron + manual Refresh) can
-- write confirmed/not_found/unavailable rows. Existing rows from the old
-- stub cron keep check_status = NULL (meaning "predates the real check")
-- -- they are read by the GET route as falling through to the normal
-- (non-"unavailable") path, same as before this migration, until the
-- next real check overwrites them.
