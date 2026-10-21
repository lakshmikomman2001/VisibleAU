-- 0088-au-local-citations-dismiss-run3-post-check.sql (Vunnara, 21
-- Oct, "directory listings... never scraping", Part E)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- Read-only. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row, remaining_wrong_count = 0. If not, do not
-- proceed -- send Claude a screenshot.
SELECT count(*) AS remaining_wrong_count
FROM action_items
WHERE id IN (SELECT id FROM _backup_0088_action_items)
  AND (
    status <> 'dismissed'
    OR dismissed_reason IS DISTINCT FROM 'Replaced: the earlier directory check was unreliable'
    OR dismissed_at IS NULL
  );
