-- diag-0087-au-local-citations-action-items.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part E)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: au-local-citations (lib/recommendations/triggers.ts, retired
-- this hotfix) is replaced by directory-visibility -- real Part D
-- citation counts + Part C owner confirmation, never
-- checkAuDirectories' broken hipages.com.au/find/{brand-slug} lookup
-- (deleted, Part A). Every existing action_items row this old rule
-- ever wrote states a claim ("You're not listed on X", or the
-- unverified "check your directory listings" fallback) that was never
-- actually checked reliably. Run this FIRST, before 0088's dismiss,
-- so Sri can see exactly what's about to be marked dismissed and how
-- many rows/brands/orgs it touches.
--
-- Expected result: one row per existing au-local-citations action
-- item, oldest first. A 0-row result means there is nothing for 0088
-- to do (not an error).
SELECT
  ai.id,
  ai.organization_id,
  ai.brand_id,
  ai.audit_id,
  ai.title,
  ai.status,
  ai.confidence_label,
  ai.confidence_basis,
  ai.created_at
FROM action_items ai
WHERE ai.recommendation_key = 'au-local-citations'
ORDER BY ai.created_at;

-- Summary: counts by current status, so Sri can see at a glance how
-- many are open/in_progress/done vs already dismissed (0088 only ever
-- touches the non-dismissed ones).
SELECT status, count(*) AS row_count
FROM action_items
WHERE recommendation_key = 'au-local-citations'
GROUP BY status
ORDER BY status;
