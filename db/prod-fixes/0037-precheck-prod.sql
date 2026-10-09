-- READ-ONLY precheck for migration 0037 (brands.youtube_channel_url;
-- widened youtube_presence_audits.check_status CHECK to allow
-- 'unconfirmed'). Run this against prod BEFORE applying
-- 0037-apply-prod.sql. Nothing in this file writes anything. NOT run
-- from Claude Code.

-- 1. Does brands.youtube_channel_url already exist? Expect 0 rows if
--    0037 was never applied.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'brands' AND column_name = 'youtube_channel_url';

-- 2. Does the check_status constraint already allow 'unconfirmed'?
--    (pg_get_constraintdef shows the actual allowed list.)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'youtube_presence_audits_check_status_check';

-- 3. Context only: how many youtube_presence_audits rows currently have
--    check_status = 'confirmed' with a low match_confidence (<0.6) --
--    these are candidates for the name-only false-match class this
--    migration's app-code companion fixes going forward. Not touched by
--    this migration or by Claude Code; informational only.
SELECT count(*) FROM youtube_presence_audits
WHERE check_status = 'confirmed' AND match_confidence < 0.6;
