-- Migration 0037: add brands.youtube_channel_url; widen
-- youtube_presence_audits.check_status to allow 'unconfirmed'.
--
-- Found in live testing (post-0036): a name-only match (brand "Bondi
-- Plumbing" against a channel literally titled "Bondi Plumbing" whose
-- actual content is a different company, Get Plumbing /
-- getplumbing.com.au) was scored and fed into the Overall Trust Score.
-- Name is not identity. This adds:
--   - brands.youtube_channel_url: a user-confirmed channel URL/handle
--     that always wins over the fuzzy search and is resolved directly
--     (high confidence, no domain-corroboration guesswork needed).
--   - A fourth check_status value, 'unconfirmed': a name-only candidate
--     with no domain corroboration (or a conflicting domain found) --
--     shown to the user for confirm/correct, never scored, never fed
--     into the Overall Trust Score (presenceScore stays NULL for this
--     status, same as 'unavailable').
--
-- See docs/ops/post-launch-db-hardening.md section 36.

BEGIN;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS youtube_channel_url text;

ALTER TABLE youtube_presence_audits
  DROP CONSTRAINT IF EXISTS youtube_presence_audits_check_status_check;

DO $$
BEGIN
  ALTER TABLE youtube_presence_audits
    ADD CONSTRAINT youtube_presence_audits_check_status_check
    CHECK (
      check_status IS NULL
      OR check_status IN ('confirmed', 'not_found', 'unconfirmed', 'unavailable')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
