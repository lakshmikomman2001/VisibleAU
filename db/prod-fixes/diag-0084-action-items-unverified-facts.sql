-- diag-0084-action-items-unverified-facts.sql (Vunnara, 21 Oct, hotfix:
-- "Usually #16" / recommendations state unverified facts, item 2,
-- read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only. Changes NO data.
--
-- WHY: lib/recommendations/confidence-labels.ts's own rule (already
-- implemented, pre-dating this hotfix, commit 5fe41c0) is that a row
-- may show "confirmed" only when a real checker ran and its result is
-- stored as the row's confidence_basis ("verified"/"inferred"/
-- "speculative" -- lib/recommendations/types.ts). confidence_basis
-- IS NULL means isLegacyConfidence() is true -- a row written before
-- that column existed, or (a separate, now-fixed bug -- see this
-- hotfix's own commit) by lib/audit/run-audit-inline.ts's actionItems
-- insert, which never wrote the field at all until this hotfix. Every
-- display surface (audit page, PDF, client portal, agency dashboards)
-- already handles this correctly via displayRecommendationTitle/
-- displayPriorityLabel/displayConfidenceLabel -- a legacy row shows
-- "Check: <title>" and "<priority> · unverified", never a bare
-- "confirmed" claim.
--
-- This file is the data-side companion: a point-in-time count of how
-- many OPEN rows are affected, so Sri can see the real scope (how many
-- customers currently have a legacy-styled recommendation) without
-- guessing from the code alone. It does not change anything -- the
-- existing display-layer fix already makes every one of these rows
-- read honestly today.
--
-- Flags an open row as "asserts a fact with no stored evidence" when:
--   (a) confidence_label = 'confirmed' (the row's OWN stored label
--       claims settled fact) AND
--   (b) confidence_basis IS NULL (no checker result recorded at all --
--       isLegacyConfidence()), OR evidence_refs is a real but EMPTY
--       jsonb array (a basis was somehow recorded with zero backing
--       references -- not expected to ever happen given today's code,
--       included defensively so this diagnostic would actually catch
--       it if it ever did).

-- Result 1: the count, by how it qualifies -- a quick scope check
-- before reading the full row list below.
SELECT
  count(*) FILTER (WHERE confidence_basis IS NULL) AS confirmed_no_basis_at_all,
  count(*) FILTER (
    WHERE confidence_basis IS NOT NULL AND jsonb_array_length(evidence_refs) = 0
  ) AS confirmed_basis_but_zero_evidence_refs,
  count(*) AS total_confirmed_unverified
FROM action_items
WHERE status = 'open'
  AND confidence_label = 'confirmed'
  AND (confidence_basis IS NULL OR jsonb_array_length(evidence_refs) = 0);

-- Result 2: every such row, one at a time, exactly the fields the
-- hotfix asked for (brand_id, title, trigger, created_at) plus enough
-- context (organization/audit/recommendation_key/basis/evidence_refs)
-- to go look at any one of them in the product.
SELECT
  ai.id AS action_item_id,
  ai.organization_id,
  ai.brand_id,
  b.name AS brand_name,
  ai.audit_id,
  ai.title,
  ai.recommendation_key AS trigger,
  ai.dimension,
  ai.confidence_label,
  ai.confidence_basis,
  ai.evidence_refs,
  ai.created_at
FROM action_items ai
JOIN brands b ON b.id = ai.brand_id
WHERE ai.status = 'open'
  AND ai.confidence_label = 'confirmed'
  AND (ai.confidence_basis IS NULL OR jsonb_array_length(ai.evidence_refs) = 0)
ORDER BY ai.created_at DESC;
