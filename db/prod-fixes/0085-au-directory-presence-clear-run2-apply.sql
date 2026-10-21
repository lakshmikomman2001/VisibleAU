-- 0085-au-directory-presence-clear-run2-apply.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part A3)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql's backup_row_count matches
-- (SELECT count(*) FROM brand_entity_scores). Sri-authorized only. NOT
-- run from Claude Code.
--
-- Clears au_directory_presence on every row to the column's own
-- default ('[]'::jsonb). NULL is not an option here -- the column is
-- NOT NULL with no backfill plan (confirmed: db/schema/brand-entity-
-- scores.ts's auDirectoryPresence has no nullable() -- a literal NULL
-- UPDATE would fail the constraint outright, not silently succeed).
--
-- Sri, 21 Oct follow-up, item 4: re-confirmed every reader treats this
-- column as "not measured", never as "confirmed empty / not listed
-- anywhere" -- re-audited this follow-up, not just assumed from Part
-- A3:
--   - app/api/brands/[brandId]/entity-score/route.ts: hardcodes
--     auDirectoryPresence: null in its JSON response, unconditionally.
--   - app/api/brand-entity/[brandId]/route.ts: WAS passing the raw row
--     through unmodified (a real gap this follow-up found and fixed)
--     -- now also hardcodes auDirectoryPresence: null.
--   - app/(auth)/brands/[brandId]/trust/entity-score/page.tsx: typed
--     `auDirectoryPresence: null` (a TypeScript literal null type, not
--     just a runtime default) and never rendered.
--   - app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx: the
--     directory row/breakdown section is fully removed (Part A).
--   - lib/trust/trust-scorer.ts, lib/communication/narrative-
--     generator.ts, and every other brand_entity_scores reader:
--     grepped this follow-up for `auDirectoryPresence` -- none
--     reference it by name.
--
-- Expected result: "Statement executed successfully" on the UPDATE
-- tab, then one row with backup_row_count == updated_row_count == the
-- full brand_entity_scores row count.
BEGIN;

UPDATE brand_entity_scores
SET au_directory_presence = '[]'::jsonb
WHERE au_directory_presence IS DISTINCT FROM '[]'::jsonb;

COMMIT;

SELECT
  (SELECT count(*) FROM _backup_0085_brand_entity_scores) AS backup_row_count,
  (SELECT count(*) FROM brand_entity_scores) AS updated_row_count;
