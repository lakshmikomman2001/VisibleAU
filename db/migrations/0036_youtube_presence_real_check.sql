-- Migration 0036: add youtube_presence_audits.channel_id, channel_title,
-- last_upload_at, match_confidence, check_status, unavailable_reason
--
-- Trust Intelligence honesty pass follow-up: the YouTube Presence check
-- was a hardcoded stub (channelExists always false). This replaces it
-- with a real YouTube Data API v3 lookup (search.list -> conservative
-- name/domain match -> channels.list + playlistItems.list enrichment).
--
-- Three honest, distinctly-stored outcomes per check (check_status):
--   'confirmed'   -- a channel was matched above the confidence
--                    threshold; channel_id/channel_title/match_confidence
--                    and the real stats are populated.
--   'not_found'   -- the API was reachable and no candidate matched
--                    confidently (or no candidates at all) -- a real,
--                    measured zero presence, not a stub.
--   'unavailable' -- couldn't check at all (missing YOUTUBE_API_KEY,
--                    quota exceeded, or a network/API error) --
--                    unavailable_reason records which. Must never be
--                    presented as a measured 0.
--
-- channel_url already existed (text, nullable) and is reused as-is.
--
-- See docs/ops/post-launch-db-hardening.md section 35.

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
