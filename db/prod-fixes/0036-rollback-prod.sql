-- Rollback for 0036-apply-prod.sql -- a second rollback path alongside
-- the Neon snapshot taken before applying. Only needed if applying 0036
-- itself somehow causes a NEW problem (it shouldn't -- additive/
-- nullable/idempotent, see 0036-apply-prod.sql's comment) and restoring
-- the snapshot isn't the preferred option.
--
-- NOT run from Claude Code. Run only if explicitly needed, after
-- confirming with Sri.

BEGIN;

ALTER TABLE youtube_presence_audits
  DROP CONSTRAINT IF EXISTS youtube_presence_audits_check_status_check;

ALTER TABLE youtube_presence_audits
  DROP CONSTRAINT IF EXISTS youtube_presence_audits_unavailable_reason_check;

ALTER TABLE youtube_presence_audits
  DROP COLUMN IF EXISTS channel_id;

ALTER TABLE youtube_presence_audits
  DROP COLUMN IF EXISTS channel_title;

ALTER TABLE youtube_presence_audits
  DROP COLUMN IF EXISTS last_upload_at;

ALTER TABLE youtube_presence_audits
  DROP COLUMN IF EXISTS match_confidence;

ALTER TABLE youtube_presence_audits
  DROP COLUMN IF EXISTS check_status;

ALTER TABLE youtube_presence_audits
  DROP COLUMN IF EXISTS unavailable_reason;

COMMIT;

-- WARNING: this re-introduces the same class of outage as the 6 Oct one
-- (see docs/ops/post-launch-db-hardening.md section 30) if the current
-- app code (which reads/writes these columns) is still deployed. Only
-- run this if the app code is ALSO being rolled back to a pre-this-task
-- commit at the same time.
