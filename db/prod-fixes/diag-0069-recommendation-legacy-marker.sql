-- diag-0069-recommendation-legacy-marker.sql (task #46, "fix: stored
-- value contradicting its own CI", follow-up #1, read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: a recommendation row's confidence_label can only be trusted as
-- "confirmed" if it came from the real evidence-driven system (commit
-- 5fe41c0). created_at can't prove that -- code reaches prod on DEPLOY,
-- not on commit, so a row created between 5fe41c0 shipping locally and
-- Phase 2/3's actual prod deploy (17 Oct) still came from the OLD static
-- table. Migration 0046 adds action_items.confidence_basis, written only
-- by the evidence-driven generator -- NULL on every row written before
-- that column existed, whatever its date. This query shows Sri the real
-- split in prod, so the size of the "legacy" bucket isn't a surprise.
--
-- Run AFTER 0069-action-items-confidence-basis-run2-apply.sql (this
-- query reads confidence_basis, which doesn't exist before that). Run it
-- again after the next code deploy that actually writes the column --
-- the "no marker" bucket should stop growing for newly-created rows (it
-- will still include every row from before the column existed; those
-- don't retroactively gain a value).

-- Query 1: counts only, by marker presence and created date (day,
-- Australia/Sydney) -- no recommendation text, brand or audit ids.
SELECT
  (confidence_basis IS NOT NULL) AS has_evidence_basis_marker,
  (created_at AT TIME ZONE 'Australia/Sydney')::date AS created_date_syd,
  confidence_label,
  count(*) AS row_count
FROM action_items
GROUP BY has_evidence_basis_marker, created_date_syd, confidence_label
ORDER BY created_date_syd, has_evidence_basis_marker, confidence_label;

-- Query 2: the specific dangerous bucket -- confidence_label = 'confirmed'
-- with NO evidence_basis marker, i.e. every row that will now correctly
-- display "not verified" instead of a trusted "Confirmed". Grouped by
-- day only, not by brand/audit, to stay safe to paste anywhere.
SELECT
  (created_at AT TIME ZONE 'Australia/Sydney')::date AS created_date_syd,
  count(*) AS unverified_confirmed_row_count
FROM action_items
WHERE confidence_label = 'confirmed'
  AND confidence_basis IS NULL
GROUP BY created_date_syd
ORDER BY created_date_syd;
