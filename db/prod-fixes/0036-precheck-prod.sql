-- READ-ONLY precheck for migration 0036 (youtube_presence_audits real
-- check columns: channel_id, channel_title, last_upload_at,
-- match_confidence, check_status, unavailable_reason).
--
-- Run this against prod BEFORE applying 0036-apply-prod.sql. Nothing in
-- this file writes anything. NOT run from Claude Code.

-- 1. Do the six new columns already exist on prod? Expect 0 rows if 0036
--    was never applied.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'youtube_presence_audits'
  AND column_name IN (
    'channel_id', 'channel_title', 'last_upload_at',
    'match_confidence', 'check_status', 'unavailable_reason'
  );

-- 2. Do the two CHECK constraints already exist under these names?
SELECT conname
FROM pg_constraint
WHERE conname IN (
  'youtube_presence_audits_check_status_check',
  'youtube_presence_audits_unavailable_reason_check'
);

-- 3. Context only: how many existing rows (from the old stub cron) would
--    get NULL check_status after this migration -- they stay NULL
--    (meaning "predates the real check") rather than being
--    backfilled/reinterpreted. Not acted on by this migration.
SELECT count(*) FROM youtube_presence_audits;
