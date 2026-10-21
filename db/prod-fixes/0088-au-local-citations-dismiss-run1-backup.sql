-- 0088-au-local-citations-dismiss-run1-backup.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part E)
--
-- PRODUCTION branch. Run on its own, as one editor submission. Run
-- AFTER the push (depends on the directory-visibility rule already
-- being the deployed code -- see run2-apply.sql's own header) and
-- AFTER reviewing diag-0087's output. Sri-authorized only. NOT run
-- from Claude Code.
--
-- WHY: au-local-citations is retired (lib/recommendations/triggers.ts)
-- -- its existing action_items rows get marked dismissed, reason
-- "Replaced: the earlier directory check was unreliable", using the
-- EXISTING status enum value ("dismissed" -- action_items.status is
-- free text, but app/api/action-items/[id]/status/route.ts's own zod
-- schema is the real constraint: z.enum(["in_progress","done",
-- "dismissed"]); there is no "superseded" value anywhere in this
-- codebase, so this never invents one). Never deletes a row.
--
-- Snapshots the affected columns' CURRENT values into
-- _backup_0088_action_items (Neon's editor can't \copy) -- drop it
-- later once run3's post-check looks right and no rollback is needed.
--
-- Expected result: "Statement executed successfully" on the CREATE
-- TABLE tab, then one row with backup_row_count = the number of
-- au-local-citations rows not already dismissed (diag-0087's own
-- "status, count(*)" summary, minus any 'dismissed' bucket).
CREATE TABLE _backup_0088_action_items AS
SELECT id, status, dismissed_reason, dismissed_at, updated_at
FROM action_items
WHERE recommendation_key = 'au-local-citations'
  AND status <> 'dismissed';

SELECT count(*) AS backup_row_count FROM _backup_0088_action_items;
