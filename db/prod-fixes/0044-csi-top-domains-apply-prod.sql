-- Applies migration 0039 to prod: adds citation_source_intelligence.top_domains.
-- Verbatim-equivalent to db/migrations/0039_citation_source_top_domains.sql.
--
-- Sri-authorized only. NOT run from Claude Code.
-- Snapshot -> precheck -> apply -> re-precheck -> THEN push. Additive,
-- nullable column -- low risk, but see the precheck file for why this
-- one specifically must land before the code ships, not after (four
-- full-column readers would 42703 otherwise).

BEGIN;

ALTER TABLE citation_source_intelligence
  ADD COLUMN IF NOT EXISTS top_domains jsonb;

COMMIT;

-- Verify: re-run 0044-csi-top-domains-precheck-prod.sql's query 1 and
-- confirm top_domains now appears.
