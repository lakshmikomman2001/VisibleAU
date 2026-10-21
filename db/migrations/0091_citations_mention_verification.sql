-- Migration 0091 (Vunnara, 21 Oct, "audit reliability", Part B): a
-- name match alone isn't proof a mention is THIS business ("Omega
-- Services" is a common name) -- lib/audit/verify-mention.ts
-- classifies each one as verified_domain / verified_location /
-- unverified, going forward.
--
-- NULLABLE, NO DEFAULT -- deliberately, same reasoning as migration
-- 0045 (response_text). Historical rows were never classified; NULL
-- means "not classified", and every reader (lib/audit/organic-
-- citations.ts, lib/scoring/resolve-audit-dimensions.ts) treats NULL
-- as "keep counting it exactly as before this hotfix" -- only a NEW
-- row can ever be the honest "unverified" that stops counting.
--
-- A nullable column with no default is a metadata-only change on
-- Postgres (no table rewrite, no new RLS policy needed -- citations'
-- existing row-level policies already cover every column).
ALTER TABLE citations ADD COLUMN IF NOT EXISTS mention_verification text;

DO $$ BEGIN
  ALTER TABLE citations
    ADD CONSTRAINT citations_mention_verification_check
    CHECK (mention_verification IN ('verified_domain', 'verified_location', 'unverified'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
