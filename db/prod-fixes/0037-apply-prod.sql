-- Prod-apply for migration 0037 -- reproduced VERBATIM from
-- db/migrations/0037_youtube_channel_confirmation.sql. Apply this BEFORE
-- deploying the code that reads/writes brands.youtube_channel_url and
-- writes check_status = 'unconfirmed' (the 6/7 Oct lesson -- code ahead
-- of schema breaks prod).
--
-- SRI: take a Neon snapshot/branch before running. Then run this file
-- with `psql -f db/prod-fixes/0037-apply-prod.sql "$PROD_DATABASE_URL"`
-- (or paste into the Neon SQL editor). NOT run from Claude Code.
--
-- Safety properties:
--   - brands.youtube_channel_url is additive + nullable -- every
--     existing brand row gets NULL, no existing data touched.
--   - The check_status constraint change is DROP + re-ADD with a wider
--     allowed set (adds 'unconfirmed') -- any existing row's
--     check_status ('confirmed'/'not_found'/'unavailable'/NULL) still
--     satisfies the new constraint; nothing is invalidated.
--   - Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS,
--     and the re-ADD is wrapped in a DO block that swallows
--     duplicate_object -- safe to run twice if re-run by accident.

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

-- After this runs: the YouTube Presence check can write 'unconfirmed'
-- rows (name-only matches, never scored) and brand owners can confirm a
-- real channel URL via the Trust Intelligence page, which always wins
-- over the fuzzy search.
