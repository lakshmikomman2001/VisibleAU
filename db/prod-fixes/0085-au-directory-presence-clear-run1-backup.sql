-- 0085-au-directory-presence-clear-run1-backup.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part A3)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Run
-- AFTER the push (this depends on checkAuDirectories already being
-- gone from the deployed code -- running it before the push would let
-- the still-live checker immediately refill the column it clears).
-- Sri-authorized only. NOT run from Claude Code.
--
-- WHY: brand_entity_scores.au_directory_presence was written by
-- checkAuDirectories (lib/brand-entity/au-directory-aggregate.ts,
-- deleted this hotfix) -- it requested hipages.com.au/find/{brand-slug},
-- a trade-CATEGORY browse page, not a business-name search, so it
-- 404'd for almost any real business name and that 404 was recorded as
-- a confirmed "not_listed". Every value this column has ever held is
-- therefore untrustworthy, not just values from a particular date.
-- Clearing it to the column's own default (empty array) rather than
-- NULL -- the column is NOT NULL with no backfill plan, so NULL would
-- violate the constraint; an empty array is this schema's existing
-- "nothing here" value and is already how every reader (app/api/
-- brands/[brandId]/entity-score/route.ts, components/domain/trust/
-- entity-authority-grid.tsx, app/(auth)/brands/[brandId]/brand-entity-
-- audit/page.tsx) now treats it as "not measured" at read time (code
-- shipped in this same hotfix, before this file ever runs).
--
-- score_of_10 is deliberately NOT touched here -- that would mean
-- re-deriving historical abn/wikipedia/auTld booleans for old rows,
-- which this file has no safe way to do and the task never asked for;
-- a stale historical score stays exactly as stale as it already was,
-- only the untrustworthy directory data is removed.
--
-- Snapshots the one affected column's CURRENT values into
-- _backup_0085_brand_entity_scores (Neon's editor can't \copy) -- drop
-- it later with run4, once run3's post-check looks right and no
-- rollback is needed.
--
-- Expected result: "Statement executed successfully" on the CREATE
-- TABLE tab, then one row with backup_row_count = (SELECT count(*)
-- FROM brand_entity_scores).
CREATE TABLE _backup_0085_brand_entity_scores AS
SELECT id, au_directory_presence
FROM brand_entity_scores;

SELECT count(*) AS backup_row_count FROM _backup_0085_brand_entity_scores;
