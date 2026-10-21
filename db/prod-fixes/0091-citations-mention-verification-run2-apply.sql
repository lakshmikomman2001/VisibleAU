-- 0091-citations-mention-verification-run2-apply.sql (Vunnara, 21
-- Oct, "audit reliability", Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql confirms the column is
-- missing, and BEFORE the push (new code reads/writes this column
-- from the moment it's deployed).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Adds citations.mention_verification. Nullable + no DEFAULT is
-- metadata-only on Postgres (no table rewrite) -- same reasoning as
-- 0057's response_text. Existing rows stay NULL = "not classified",
-- and every reader (lib/audit/organic-citations.ts, lib/scoring/
-- resolve-audit-dimensions.ts) treats NULL as "count it exactly as
-- before this hotfix".
--
-- Expected result: "Statement executed successfully" on every tab.
BEGIN;

ALTER TABLE citations ADD COLUMN IF NOT EXISTS mention_verification text;

DO $$ BEGIN
  ALTER TABLE citations
    ADD CONSTRAINT citations_mention_verification_check
    CHECK (mention_verification IN ('verified_domain', 'verified_location', 'unverified'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'mention_verification'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'citations_mention_verification_check'
  ) AS constraint_present;
