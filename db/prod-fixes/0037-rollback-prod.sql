-- Rollback for 0037-apply-prod.sql -- a second rollback path alongside
-- the Neon snapshot taken before applying. Only needed if applying 0037
-- itself somehow causes a NEW problem and restoring the snapshot isn't
-- the preferred option.
--
-- NOT run from Claude Code. Run only if explicitly needed, after
-- confirming with Sri.
--
-- WARNING: if any row already has check_status = 'unconfirmed' when
-- this runs, re-narrowing the CHECK constraint back to the pre-0037 set
-- will fail (existing rows would violate it). Either delete/update those
-- rows first, or skip the constraint rollback and only drop the column.

BEGIN;

ALTER TABLE brands
  DROP COLUMN IF EXISTS youtube_channel_url;

ALTER TABLE youtube_presence_audits
  DROP CONSTRAINT IF EXISTS youtube_presence_audits_check_status_check;

DO $$
BEGIN
  ALTER TABLE youtube_presence_audits
    ADD CONSTRAINT youtube_presence_audits_check_status_check
    CHECK (check_status IS NULL OR check_status IN ('confirmed', 'not_found', 'unavailable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- WARNING: this re-introduces the same class of outage as the 6 Oct one
-- (see docs/ops/post-launch-db-hardening.md section 30) if the current
-- app code (which reads/writes youtube_channel_url and writes
-- check_status = 'unconfirmed') is still deployed. Only run this if the
-- app code is ALSO being rolled back to a pre-this-task commit at the
-- same time.
