-- diag-c04 (Claude.ai series) — PRODUCTION branch. READ-ONLY. Run the whole file (one statement).
-- Preview of what 0073 will change: for the 5 audits diag-0072 listed, show every
-- question currently flagged "branded" whose text does NOT contain the brand's
-- name or website. 0073 will flip these to organic, so they start counting
-- toward the score.
-- Lets you eyeball each question before applying: it should read as a generic
-- customer question that doesn't name the business.
--
-- Columns:
--   brand_name, audit_number, prompt
--   rows_flipping        all runs (should add up to diag-0072's per-audit counts)
--   run1_answers         answers that will start counting (run 1 only)
--   run1_mentioned       of those, how many named the brand (these will raise the score)
WITH target AS (
  SELECT unnest(ARRAY[
    '2391967c-2ec6-4edf-9df1-1c395621e9e6',
    '4d82e781-f93c-457d-9480-fa44b09784a0',
    '655ebf1b-839e-4e51-888b-ef727ac943ba',
    '766ab960-6792-47aa-8eb0-321712f5e7df',
    '91e8d2e8-47ec-4707-9f94-7aa8a5794d09'
  ]::uuid[]) AS audit_id
),
b AS (
  SELECT id, btrim(name) AS name,
         regexp_replace(btrim(lower(name)), '[^a-z0-9]+', '[^a-z0-9]*', 'g') AS name_rx,
         NULLIF(split_part(regexp_replace(lower(btrim(coalesce(domain, ''))), '^(https?://)?(www\.)?', ''), '.', 1), '') AS domain_stem
  FROM brands
)
SELECT
  b.name                                                   AS brand_name,
  a.audit_number,
  c.prompt,
  count(*)                                                 AS rows_flipping,
  count(*) FILTER (WHERE c.run_number = 1)                 AS run1_answers,
  count(*) FILTER (WHERE c.run_number = 1 AND c.brand_mentioned) AS run1_mentioned
FROM target t
JOIN audits a    ON a.id = t.audit_id
JOIN brands b0   ON b0.id = a.brand_id
JOIN b           ON b.id = a.brand_id
JOIN citations c ON c.audit_id = a.id
WHERE c.is_branded_prompt = true
  AND NOT (lower(c.prompt) ~ b.name_rx)
  AND NOT (b.domain_stem IS NOT NULL AND length(b.domain_stem) >= 4
           AND position(b.domain_stem IN lower(c.prompt)) > 0)
GROUP BY b.name, a.audit_number, c.prompt
ORDER BY b.name, a.audit_number, c.prompt;
