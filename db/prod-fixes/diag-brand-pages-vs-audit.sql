-- diag-brand-pages-vs-audit.sql -- READ-ONLY. For Sri, on production (visibleau_prod), before pushing the 17 Nov
-- "every brand page must agree with the audit" commits. Nothing here writes: one READ ONLY transaction, rolled back.
--
--   psql "$PROD_URL" -v ON_ERROR_STOP=1 -f db/prod-fixes/diag-brand-pages-vs-audit.sql
--
-- Brands checked: Hero Home Services and Omega Services (the demo brands). Each query says what to expect and what
-- each result would mean.

BEGIN TRANSACTION READ ONLY;

-- 1. The demo brands' audits. Expect Hero's #48 (13 Nov) and #50 (15 Nov) in ISO week 2026-W46, #48 with no
--    question_set_hash (it ran before migration 0150) and the same prompt_pack_version as #50.
--    If so: the weekly trend compared them (lib/audit/question-set.ts compares the pack version when one has no
--    hash) -- the cause of the old card's 81.8% (part 1).
SELECT b.name, a.audit_number, a.status, a.completed_at, to_char(a.completed_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS iso_week,
       a.prompt_pack_version, left(a.question_set_hash, 12) AS question_set_hash, a.methodology_version,
       a.excluded_from_trends_reason, a.metadata -> 'engineFailures' AS engine_failures
FROM audits a JOIN brands b ON b.id = a.brand_id
WHERE b.name IN ('Hero Home Services', 'Omega Services') AND b.deleted_at IS NULL
ORDER BY b.name, a.completed_at DESC NULLS LAST, a.audit_number DESC
LIMIT 30;

-- 2. Their visibility_trends rows, newest calculated first -- the row the old Visibility card read.
--    Expect for Hero: 2026-W46 weekly with mention_rate 81.82, citation_rate 0.00, brand_archetype known_but_untrusted.
--    If the newest row by calculated_at is NOT 2026-W46: an operator's trend exclusion recomputed an older week after
--    #50, and the card showed that older week (the second cause, part 1). Either way the new card doesn't read it.
SELECT b.name, t.period_type, t.period_label, t.audit_count, t.mention_rate, t.citation_rate, t.brand_archetype,
       t.citation_volatility_score, t.methodology_version, t.calculated_at
FROM visibility_trends t JOIN brands b ON b.id = t.brand_id
WHERE b.name IN ('Hero Home Services', 'Omega Services') AND b.deleted_at IS NULL
ORDER BY b.name, t.calculated_at DESC
LIMIT 20;

-- 3. Hero's 2026-W46 the way the old aggregator counted it: distinct everyday QUESTIONS across the week's complete
--    audits, mentioned by any engine (unverified included, every run). Expect 11 questions, 9 mentioned (9/11 =
--    81.82%). If different, the trend row came from another set of audits -- query 2 says which week.
SELECT count(DISTINCT c.prompt) AS questions,
       count(DISTINCT c.prompt) FILTER (WHERE c.brand_mentioned) AS mentioned_questions
FROM citations c JOIN audits a ON a.id = c.audit_id JOIN brands b ON b.id = a.brand_id
WHERE b.name = 'Hero Home Services' AND b.deleted_at IS NULL AND a.status = 'complete'
  AND to_char(a.completed_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') = '2026-W46'
  AND c.is_branded_prompt IS NOT TRUE;

-- 4. Each recent audit's own figures, as the audit page counts them (and every page now does): everyday answers
--    (run 1, not branded), verified mentions, and mentions that linked a source. Expect Hero #50: 40, 13, 13.
--    Any page that shows other figures for the same audit disagrees with the audit page.
SELECT b.name, a.audit_number,
       count(*) AS everyday_answers,
       count(*) FILTER (WHERE c.brand_mentioned AND c.mention_verification IS DISTINCT FROM 'unverified') AS mentioned,
       count(*) FILTER (WHERE c.brand_mentioned AND c.mention_verification IS DISTINCT FROM 'unverified'
                          AND jsonb_array_length(jsonb_path_query_array(c.cited_sources, '$[*] ? (!exists(@.cited ? (@ == false)))')) > 0)
         AS mentions_with_a_source,
       count(*) FILTER (WHERE c.brand_mentioned AND c.mention_verification = 'unverified') AS unverified_matches
FROM citations c JOIN audits a ON a.id = c.audit_id JOIN brands b ON b.id = a.brand_id
WHERE b.name IN ('Hero Home Services', 'Omega Services') AND b.deleted_at IS NULL AND a.status = 'complete'
  AND c.run_number = 1 AND c.is_branded_prompt IS NOT TRUE
GROUP BY b.name, a.audit_number
ORDER BY b.name, a.audit_number DESC
LIMIT 12;

-- 5. Why the old card said "Citation 0.0%": how many of #50's mentions cite the brand's OWN site (the old trend's
--    definition: its domain exactly in cited_sources). Expect 0 for Hero, with the sources being directories
--    (Localsearch etc.). If 0: "Citation 0.0%" was a different measure under the audit page's word.
SELECT b.name, a.audit_number, b.domain,
       count(*) FILTER (WHERE c.cited_sources @> jsonb_build_array(jsonb_build_object('domain', b.domain))) AS mentions_citing_own_site,
       count(*) AS mentions
FROM citations c JOIN audits a ON a.id = c.audit_id JOIN brands b ON b.id = a.brand_id
WHERE b.name IN ('Hero Home Services', 'Omega Services') AND b.deleted_at IS NULL AND a.status = 'complete'
  AND c.run_number = 1 AND c.is_branded_prompt IS NOT TRUE AND c.brand_mentioned
GROUP BY b.name, a.audit_number, b.domain
ORDER BY b.name, a.audit_number DESC
LIMIT 6;

-- 6. Tasks whose stored "lift" was made from an expected-impact bucket (score_before 80/50/20, part 3). Every row
--    here is a lift the dashboard's "Measured impact" summed; the pages now measure each task's change from its own
--    audit to its re-audit instead, so these stored numbers are no longer shown. Expect a few rows, or none.
SELECT b.name, t.title, t.status, t.score_before, t.score_after, t.lift_achieved, t.completed_at,
       t.audit_id IS NOT NULL AS has_own_audit, t.reaudit_id IS NOT NULL AS has_reaudit
FROM remediation_tasks t JOIN brands b ON b.id = t.brand_id
WHERE t.score_before IN (80, 50, 20) AND (t.lift_achieved IS NOT NULL OR t.score_after IS NOT NULL)
ORDER BY t.completed_at DESC NULLS LAST
LIMIT 20;

-- 7. Drift alerts that name sentiment or context (no classifier exists, so these came from the inline runner's
--    defaults: sentiment ?? 50, context ?? 25 -- part 3). The drift page no longer names them and shows each alert's
--    change from its two audits. Count by brand; expect few or none.
SELECT b.name, count(*) AS alerts_naming_unmeasured_dimensions
FROM drift_alerts d JOIN brands b ON b.id = d.brand_id
WHERE d.dimension_deltas ?| ARRAY['sentiment', 'context']
GROUP BY b.name
ORDER BY 2 DESC;

-- 8. Reports made with the earlier method (key wins or gaps: only the generator before 8eff2f9 wrote them). Each now
--    shows "made with an earlier report method" and no Key Wins. Expect only reports from before 1 Nov 2026.
SELECT b.name, r.period_label, r.created_at,
       jsonb_array_length(coalesce(r.key_wins, '[]'::jsonb)) AS key_wins,
       jsonb_array_length(coalesce(r.key_gaps, '[]'::jsonb)) AS key_gaps
FROM generated_reports r JOIN brands b ON b.id = r.brand_id
WHERE jsonb_array_length(coalesce(r.key_wins, '[]'::jsonb)) > 0 OR jsonb_array_length(coalesce(r.key_gaps, '[]'::jsonb)) > 0
ORDER BY r.created_at DESC
LIMIT 20;

-- 9. Topical gaps: the share stored as "no content". Expect nearly every row false -- the calculator matches the
--    audit's answers to unexpanded library templates, so most never match and default to false (part 3: no page shows
--    these any more). If most rows are TRUE for a brand, say so: the calculator matched more than expected.
SELECT b.name, count(*) AS topics, count(*) FILTER (WHERE NOT g.brand_has_content) AS no_content,
       max(g.cross_prompt_impact) AS max_cross_prompt_impact
FROM topical_coverage_gaps g JOIN brands b ON b.id = g.brand_id
WHERE b.name IN ('Hero Home Services', 'Omega Services') AND b.deleted_at IS NULL
GROUP BY b.name;

-- 10. Referral data the crawl-to-referral ratio would need. Expect 0 rows: nothing in the app writes ai_referral_hits
--     (part 2 hides the ratio until a referral is measured). Any rows mean a writer exists that this task didn't find.
SELECT count(*) AS ai_referral_hits FROM ai_referral_hits;

-- 11. Head-to-head comparisons recorded as a WIN where the answer never names the brand (the domain-only bug in
--     lib/conversational/comparison-runner.ts, part 3). Expect some rows if any brand matched only by its domain.
SELECT b.name, count(*) FILTER (WHERE r.brand_won) AS wins,
       count(*) FILTER (WHERE r.brand_won AND position(lower(b.name) IN lower(coalesce(r.verdict_snippet, ''))) = 0) AS wins_without_the_name_in_the_snippet
FROM comparison_prompt_results r JOIN brands b ON b.id = r.brand_id
WHERE b.deleted_at IS NULL
GROUP BY b.name
ORDER BY 2 DESC
LIMIT 20;

ROLLBACK;
