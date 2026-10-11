-- Rollback for 0044-csi-top-domains-apply-prod.sql / migration 0039.
--
-- Safe: drops only the new nullable column, no FK/index dependents. App
-- code already treats a missing/null top_domains gracefully (the write
-- is non-fatal, and the read path renders "Top domains appear after the
-- next audit." when top_domains is null), so dropping this column after
-- the app code has shipped does not break any of the four readers --
-- it just stops the domain list showing, same as before migration 0039.
--
-- Sri-authorized only. NOT run from Claude Code.

ALTER TABLE citation_source_intelligence
  DROP COLUMN IF EXISTS top_domains;
