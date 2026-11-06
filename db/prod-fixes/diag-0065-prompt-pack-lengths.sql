-- diag-0065-prompt-pack-lengths.sql (task #46, Part 2 addendum, read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: lib/prompts/templates.ts's CATEGORY_TEMPLATES pools are, for every
-- category except 5 SaaS/software ones (saas_design_tools 8,
-- accounting_software 8, crm_software 6, hr_software 6, ecommerce_platform
-- 6), smaller than buildPromptPack's own categoryCount target
-- (Math.ceil(10*0.6) = 6) -- every trades_*, allied_health_*,
-- legal_services, real_estate_agency, hospitality_restaurant,
-- education_online, and the generic "general" fallback bucket has 3-5
-- templates. Per lib/prompts/build-prompt-pack.ts:30-42, when the
-- category pool supplies fewer than 6, the padding step
-- (`extras = resolved.filter(p => !unique.includes(p))`) has nothing
-- left to draw from (every category template was already taken), so the
-- final prompt_pack structurally lands below 10 -- not a rare dedup
-- collision, but the EXPECTED outcome for almost every non-SaaS brand.
-- Per Part 1, a stored prompt_pack shorter than PROMPTS_PER_AUDIT (10)
-- makes the inline runner (lib/audit/run-audit-inline.ts:486-506)
-- regenerate via buildPromptPack() fresh, with its own unseeded
-- Math.random() shuffle, on EVERY inline-triggered audit for that brand.
-- This query exists to show how widespread that condition is across real
-- production brands, not just the 3 already surfaced by evidence
-- (Get Plumbing, Bondi Plumbing, Omega Services).
--
-- Query 1: counts only -- grouped by prompt_pack length (bucketed) and by
-- classification_status, so Sri can see the shape of the problem without
-- any row-level customer data in a result he might paste somewhere.
--
-- Query 2: ids only, for brands with a non-null prompt_pack shorter than
-- 10 AND classification_status = 'complete' (the exact condition that
-- triggers per-audit re-randomization on the inline runner) -- no name,
-- no domain, so this stays safe to share.

-- Query 1: counts_by_length_and_status
-- jsonb_typeof guard: defensive against a prompt_pack row ever stored as a
-- jsonb SCALAR instead of a real array (the same JSON.stringify()-vs-
-- client.json() class of bug this task has hit before on other jsonb
-- columns) -- jsonb_array_length() errors outright on a scalar, which
-- would otherwise crash this entire diagnostic query on one bad row.
SELECT
  classification_status,
  CASE
    WHEN prompt_pack IS NULL THEN 'null (unclassified or no pack)'
    WHEN jsonb_typeof(prompt_pack) <> 'array' THEN 'non-array jsonb (data bug, needs separate look)'
    WHEN jsonb_array_length(prompt_pack) >= 10 THEN '>= 10 (stable)'
    ELSE jsonb_array_length(prompt_pack)::text || ' (< 10, re-randomizes per inline audit)'
  END AS prompt_pack_length_bucket,
  count(*) AS brand_count
FROM brands
WHERE deleted_at IS NULL
GROUP BY classification_status, prompt_pack_length_bucket
ORDER BY classification_status, prompt_pack_length_bucket;

-- Query 2: affected_brand_ids
SELECT id, jsonb_array_length(prompt_pack) AS prompt_pack_length
FROM brands
WHERE deleted_at IS NULL
  AND classification_status = 'complete'
  AND prompt_pack IS NOT NULL
  AND jsonb_typeof(prompt_pack) = 'array'
  AND jsonb_array_length(prompt_pack) < 10
ORDER BY prompt_pack_length, id;
