-- diag-0111-report-numbers-omega.sql (Vunnara, 1 Nov, "DEMO-BLOCKER: the
-- PDF report shows unsupported numbers and claims", part 1): where the
-- 2026-W44 PDF's numbers for Omega Services came from, and what the audit
-- page's own rules give for the same audits.
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECTs only, inside a READ ONLY
-- transaction that ends in ROLLBACK. Counts, rates, flags, dates, audit
-- numbers and ids only -- no answer text, question text, URLs, domains or
-- names in the output. Sri runs it; NOT run from Claude Code against
-- production.
--
-- The brand: Omega Services in the Splice Marketing workspace. Query 0
-- must return exactly ONE row; every later query picks the brand the same
-- way (the `b` CTE).
--
-- The period: 2026-W44 as the trend job labels it -- the ISO week of each
-- audit's completed_at in the server's time zone (UTC on Vercel;
-- inngest/functions/aggregate-visibility-trend.ts:56-58), so 26 Oct 00:00
-- UTC to 1 Nov 23:59:59.999 UTC. Query 3 shows each audit's week in UTC
-- and in Sydney time, in case they differ.
--
-- What each query checks (the PDF line it explains):
--   1  the stored report: 60% / 40% / 0.67 / "recognised authority"
--   2  the weekly trend rows, and the delta behind "trending up"
--   3  the brand's audits: which ones the trend pooled, which it left out
--   4  the audit page's numbers per audit and engine (7 of 40 and so on)
--   5  the trend's 60% / 40% recomputed, next to the answer-level rates
--   6  "20 source types analysed, 0 critical gaps"
--   7  directory profiles the owner confirmed ("none were your profile")
--   8  "Immutable evidence snapshots"
--   9  the header's agency name ("VisibleAU"), and the report template

BEGIN TRANSACTION READ ONLY;

-- 0. The brand (expect exactly 1 row), and which cover details exist.
SELECT
  b.id AS brand_id,
  b.organization_id,
  coalesce(btrim(b.suburb), '') <> '' AS has_suburb,
  coalesce(btrim(b.state), '') <> '' AS has_state,
  cardinality(b.categories) AS category_count,
  CASE WHEN jsonb_typeof(b.prompt_pack) = 'array'
    THEN jsonb_array_length(b.prompt_pack) END AS prompt_pack_questions
FROM brands b
JOIN organizations o ON o.id = b.organization_id
WHERE b.name ILIKE 'Omega Services%'
  AND o.name ILIKE 'Splice Marketing%';

-- 1. The W44 report as stored: the numbers render-report-pdf.ts printed.
-- stored_mention_rate / stored_citation_rate / stored_ratio / stored_archetype
-- should read 60 / 40 / 0.666... / recognised_authority.
WITH b AS (
  SELECT b.id, b.organization_id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  r.id AS report_id,
  r.created_at AT TIME ZONE 'Australia/Sydney' AS created_sydney,
  r.report_type,
  r.template_id IS NOT NULL AS has_template,
  r.audit_id IS NOT NULL AS has_audit_id,
  r.headline = 'AI Visibility Report' AS headline_is_the_default,
  r.mention_source_summary ->> 'mentionRate' AS stored_mention_rate,
  r.mention_source_summary ->> 'citationRate' AS stored_citation_rate,
  r.mention_source_summary ->> 'ratio' AS stored_ratio,
  r.mention_source_summary ->> 'archetype' AS stored_archetype,
  CASE WHEN jsonb_typeof(r.key_wins) = 'array' THEN jsonb_array_length(r.key_wins) END AS key_wins,
  CASE WHEN jsonb_typeof(r.key_gaps) = 'array' THEN jsonb_array_length(r.key_gaps) END AS key_gaps,
  r.pdf_url IS NOT NULL AS has_pdf
FROM generated_reports r
JOIN b ON r.brand_id = b.id
WHERE r.period_label = '2026-W44'
ORDER BY r.created_at;

-- 2. The weekly trend rows (newest 8). The PDF's "Early signal: visibility
-- trending up" is W44's score_composite_avg minus the newest earlier
-- weekly row's (generate-narrative-report.ts:113-145), shown as "up" when
-- that difference is >= 0 and sample_quality is Hypothesis or
-- Insufficient data (narrative-generator.ts:230-233).
-- written_before_19_oct: score_composite_avg became the average headline
-- mention rate in the 19 Oct code; a row last written before then may
-- still hold the older weighted score.
WITH b AS (
  SELECT b.id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
),
t AS (
  SELECT
    t.*,
    t.score_composite_avg - lag(t.score_composite_avg) OVER (ORDER BY t.period_label)
      AS delta_vs_previous_row
  FROM visibility_trends t
  JOIN b ON t.brand_id = b.id
  WHERE t.period_type = 'weekly'
)
SELECT
  period_label,
  audit_count,
  sample_quality,
  score_composite_avg,
  delta_vs_previous_row,
  mention_rate,
  citation_rate,
  mention_source_ratio,
  brand_archetype,
  calculated_at AT TIME ZONE 'Australia/Sydney' AS calculated_sydney,
  updated_at AT TIME ZONE 'Australia/Sydney' AS updated_sydney,
  updated_at < timestamptz '2026-10-19 00:00:00+11' AS written_before_19_oct
FROM t
ORDER BY period_label DESC
LIMIT 8;

-- 3. The brand's audits since 1 Oct: their week (UTC, as the trend job
-- labels it, and Sydney), status, and whether every engine answered (the
-- same test as lib/audit/engine-failure.ts's everyEngineAnswered -- false
-- means the trend left the audit out). failed_answers_by_engine: from
-- audits.metadata.engineFailures, counts only.
WITH b AS (
  SELECT b.id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  a.audit_number,
  a.status,
  a.completed_at AT TIME ZONE 'Australia/Sydney' AS completed_sydney,
  to_char(a.completed_at AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS week_utc,
  to_char(a.completed_at AT TIME ZONE 'Australia/Sydney', 'IYYY-"W"IW') AS week_sydney,
  a.prompts_count,
  cardinality(a.engines) AS engines_planned,
  (
    SELECT string_agg(ef.key || '=' || ef.value, ', ' ORDER BY ef.key)
    FROM jsonb_each_text(
      CASE WHEN jsonb_typeof(a.metadata -> 'engineFailures') = 'object'
        THEN a.metadata -> 'engineFailures' ELSE '{}'::jsonb END
    ) AS ef
    WHERE ef.value ~ '^[0-9]+$'
  ) AS failed_answers_by_engine,
  NOT EXISTS (
    SELECT 1
    FROM jsonb_each_text(
      CASE WHEN jsonb_typeof(a.metadata -> 'engineFailures') = 'object'
        THEN a.metadata -> 'engineFailures' ELSE '{}'::jsonb END
    ) AS ef(engine, failed)
    WHERE coalesce(a.prompts_count, 0) > 0
      AND ef.failed ~ '^[0-9]+$'
      AND ef.failed::int >= a.prompts_count
  ) AS every_engine_answered
FROM audits a
JOIN b ON a.brand_id = b.id
WHERE a.created_at >= timestamptz '2026-10-01 00:00:00+10'
ORDER BY a.audit_number;

-- 4. The audit page's numbers (lib/scoring/resolve-audit-dimensions.ts:
-- everyday questions only, first run only, verified mentions only), per
-- audit and engine, then per audit (engine = 'ALL'). Expect #37 ALL 30 / 5,
-- #39 ALL 40 / 7 with ChatGPT 4, Claude 0, Gemini 0, Perplexity 3.
-- answers_citing_brand_site: answers whose cited sources include the
-- brand's own domain, matched the way the trend job matches it.
WITH b AS (
  SELECT b.id, b.domain FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  a.audit_number,
  coalesce(c.engine, 'ALL') AS engine,
  count(*) AS answers,
  count(*) FILTER (
    WHERE c.brand_mentioned AND c.mention_verification IS DISTINCT FROM 'unverified'
  ) AS verified_mentions,
  count(*) FILTER (
    WHERE c.brand_mentioned AND c.mention_verification = 'unverified'
  ) AS unverified_matches,
  count(*) FILTER (
    WHERE c.brand_mentioned AND c.mention_verification IS DISTINCT FROM 'unverified'
      AND jsonb_typeof(c.cited_sources) = 'array' AND jsonb_array_length(c.cited_sources) > 0
  ) AS mentions_with_a_source,
  count(*) FILTER (
    WHERE c.cited_sources @> jsonb_build_array(jsonb_build_object('domain', b.domain))
  ) AS answers_citing_brand_site
FROM citations c
JOIN audits a ON a.id = c.audit_id
JOIN b ON a.brand_id = b.id
WHERE a.audit_number IN (37, 38, 39)
  AND c.is_branded_prompt IS NOT TRUE
  AND c.run_number = 1
GROUP BY GROUPING SETS ((a.audit_number, c.engine), (a.audit_number))
ORDER BY a.audit_number, (c.engine IS NULL) DESC, c.engine;

-- 5. The trend's 60% / 40%, recomputed exactly as
-- lib/visibility/visibility-trend-aggregator.ts:175-235 does: every
-- complete W44 audit in which every engine answered, everyday questions
-- only, but EVERY run, unverified matches included, and counted by
-- DISTINCT QUESTION TEXT -- a question counts as "mentioned" if any one
-- answer to it, from any engine, in any of those audits, named the brand.
-- Next to it: the same audits on the audit page's rules (answers, first
-- run, verified), and the archetype each pair of rates gets from the same
-- thresholds (lib/visibility/mention-source-divide.ts:3-19: mention >= 20
-- and citation >= 10 is "recognised_authority").
WITH b AS (
  SELECT b.id, b.domain FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
),
wk AS (
  SELECT a.id, a.audit_number
  FROM audits a
  JOIN b ON a.brand_id = b.id
  WHERE a.status = 'complete'
    AND a.completed_at >= timestamptz '2026-10-26 00:00:00+00'
    AND a.completed_at <= timestamptz '2026-11-01 23:59:59.999+00'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each_text(
        CASE WHEN jsonb_typeof(a.metadata -> 'engineFailures') = 'object'
          THEN a.metadata -> 'engineFailures' ELSE '{}'::jsonb END
      ) AS ef(engine, failed)
      WHERE coalesce(a.prompts_count, 0) > 0
        AND ef.failed ~ '^[0-9]+$'
        AND ef.failed::int >= a.prompts_count
    )
),
c AS (
  SELECT
    c.prompt,
    c.run_number,
    c.brand_mentioned,
    c.mention_verification IS DISTINCT FROM 'unverified' AS verified,
    c.cited_sources @> jsonb_build_array(jsonb_build_object('domain', b.domain)) AS cites_brand_site
  FROM citations c
  JOIN wk ON wk.id = c.audit_id
  CROSS JOIN b
  WHERE c.is_branded_prompt IS NOT TRUE
),
s AS (
  SELECT
    (SELECT string_agg(audit_number::text, ',' ORDER BY audit_number) FROM wk) AS audits_pooled,
    count(*) AS all_rows,
    count(*) FILTER (WHERE run_number > 1) AS repeat_run_rows,
    count(DISTINCT prompt) AS distinct_questions,
    count(DISTINCT prompt) FILTER (WHERE brand_mentioned) AS questions_mentioned_any_answer,
    count(DISTINCT prompt) FILTER (WHERE brand_mentioned AND verified AND run_number = 1)
      AS questions_mentioned_first_run_verified,
    count(DISTINCT prompt) FILTER (WHERE cites_brand_site) AS questions_citing_brand_site,
    count(*) FILTER (WHERE run_number = 1) AS first_run_answers,
    count(*) FILTER (WHERE run_number = 1 AND brand_mentioned AND verified) AS first_run_verified_mentions,
    count(*) FILTER (WHERE run_number = 1 AND cites_brand_site) AS first_run_answers_citing_brand_site
  FROM c
),
r AS (
  SELECT
    s.*,
    round(100.0 * questions_mentioned_any_answer / nullif(distinct_questions, 0), 2) AS trend_mention_rate,
    round(100.0 * questions_citing_brand_site / nullif(distinct_questions, 0), 2) AS trend_citation_rate,
    round(100.0 * first_run_verified_mentions / nullif(first_run_answers, 0), 2) AS answer_mention_rate,
    round(100.0 * first_run_answers_citing_brand_site / nullif(first_run_answers, 0), 2) AS answer_citation_rate
  FROM s
)
SELECT
  r.*,
  round(trend_citation_rate / nullif(trend_mention_rate, 0), 2) AS trend_ratio,
  CASE
    WHEN trend_mention_rate >= 20 AND trend_citation_rate >= 10 THEN 'recognised_authority'
    WHEN trend_mention_rate >= 20 THEN 'known_but_untrusted'
    WHEN trend_citation_rate >= 10 THEN 'niche_authority'
    ELSE 'invisible'
  END AS archetype_from_trend_rates,
  CASE
    WHEN answer_mention_rate >= 20 AND answer_citation_rate >= 10 THEN 'recognised_authority'
    WHEN answer_mention_rate >= 20 THEN 'known_but_untrusted'
    WHEN answer_citation_rate >= 10 THEN 'niche_authority'
    ELSE 'invisible'
  END AS archetype_from_answer_rates
FROM r;

-- 6. "20 source types analysed, 0 critical gaps" (render-report-pdf.ts:
-- 195-219): the brand's newest 20 per-audit citation_source_intelligence
-- rows, from ANY audit (no period filter). Each row is one (audit, engine,
-- source type), so 20 is the query's LIMIT, not 20 different types.
-- "critical" needs share > 20% AND brand_present_in_source false, and
-- brand_present_in_source is true whenever ANY answer citing that type
-- also mentioned the brand -- not only when the brand's own page was cited.
-- tied_at_cutoff > 0 means rows share the 20th row's calculated_at, so
-- which 20 the PDF counted wasn't fixed.
WITH b AS (
  SELECT b.id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
),
csi AS (
  SELECT x.*
  FROM citation_source_intelligence x
  JOIN b ON x.brand_id = b.id
  WHERE x.audit_id IS NOT NULL AND x.source_type <> '__no_citations__'
),
last20 AS (
  SELECT * FROM csi ORDER BY calculated_at DESC LIMIT 20
)
SELECT
  (SELECT count(*) FROM csi) AS per_audit_rows_total,
  count(*) AS rows_counted_in_pdf,
  count(DISTINCT l.source_type) AS distinct_source_types,
  count(DISTINCT l.engine) AS distinct_engines,
  (
    SELECT string_agg(DISTINCT a.audit_number::text, ',')
    FROM last20 l2 JOIN audits a ON a.id = l2.audit_id
  ) AS audits_in_those_rows,
  count(*) FILTER (WHERE l.gap_severity = 'critical') AS critical,
  count(*) FILTER (WHERE l.gap_severity = 'warning') AS warning,
  count(*) FILTER (WHERE l.gap_severity = 'opportunity') AS opportunity,
  count(*) FILTER (WHERE l.gap_severity = 'covered') AS covered,
  count(*) FILTER (WHERE l.gap_severity = 'unclassified') AS unclassified,
  count(*) FILTER (
    WHERE l.gap_severity = 'covered'
      AND NOT jsonb_path_exists(coalesce(l.top_domains, '[]'::jsonb), '$[*] ? (@.isBrand == true)')
  ) AS covered_but_brand_site_not_among_top_domains,
  count(*) FILTER (WHERE l.gap_severity = 'covered' AND l.citation_share > 20)
    AS covered_with_share_over_20pct,
  count(*) FILTER (WHERE l.source_type = 'au_directory') AS directory_rows,
  count(*) FILTER (WHERE l.source_type = 'au_directory' AND l.gap_severity = 'covered')
    AS directory_rows_marked_covered,
  (
    SELECT count(*) FROM csi
    WHERE csi.calculated_at = (SELECT min(calculated_at) FROM last20)
  ) - count(*) FILTER (WHERE l.calculated_at = (SELECT min(calculated_at) FROM last20))
    AS tied_at_cutoff
FROM last20 l;

-- 7. Directory profiles the owner has confirmed. The audit page's "none
-- were your profile" can only ever say "including your own profile" for a
-- directory with status 'listed' and a profile URL
-- (lib/directories/citation-counts.ts:228-236).
WITH b AS (
  SELECT b.id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  count(*) AS listing_rows,
  count(*) FILTER (WHERE l.status = 'listed') AS listed,
  count(*) FILTER (WHERE l.status = 'listed' AND coalesce(btrim(l.profile_url), '') <> '')
    AS listed_with_profile_url,
  count(*) FILTER (WHERE l.status = 'not_listed') AS not_listed,
  count(*) FILTER (WHERE l.status = 'unsure') AS unsure
FROM brand_directory_listings l
JOIN b ON l.brand_id = b.id;

-- 8. "Immutable evidence snapshots": what's stored for this brand, and what
-- protects it. longest_stored_chars <= 500 means each snapshot holds the
-- first 500 characters of the answer (citations.response_snippet), not the
-- whole answer.
WITH b AS (
  SELECT b.id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  count(*) AS snapshots,
  count(DISTINCT es.audit_id) AS audits,
  count(*) FILTER (WHERE es.audit_id IS NULL) AS without_audit,
  max(length(es.raw_response)) AS longest_stored_chars,
  min(es.captured_at) AT TIME ZONE 'Australia/Sydney' AS first_captured_sydney,
  max(es.captured_at) AT TIME ZONE 'Australia/Sydney' AS last_captured_sydney
FROM evidence_snapshots es
JOIN b ON es.brand_id = b.id;

-- 8b. The table's protections: row-level security policies by command
-- (an UPDATE or DELETE policy means rows can be changed or removed),
-- user triggers (a block-update/delete trigger would show here), and
-- whether the app's own role may UPDATE or DELETE (no row = no such role).
SELECT p.cmd, count(*) AS policies
FROM pg_policies p
WHERE p.schemaname = 'public' AND p.tablename = 'evidence_snapshots'
GROUP BY p.cmd
ORDER BY p.cmd;

SELECT count(*) AS user_triggers
FROM pg_trigger t
WHERE t.tgrelid = 'public.evidence_snapshots'::regclass AND NOT t.tgisinternal;

SELECT
  has_table_privilege(r.oid, 'public.evidence_snapshots', 'UPDATE') AS app_role_can_update,
  has_table_privilege(r.oid, 'public.evidence_snapshots', 'DELETE') AS app_role_can_delete
FROM pg_roles r
WHERE r.rolname = 'visibleau_app';

-- 9. The header's name: pdf-builder.tsx:116 prints agency_brand_assets.
-- agency_name, else "VisibleAU". It reads the brand's own row first and
-- uses the workspace-wide row only when the brand has none
-- (pdf-builder.tsx:150-181), so a brand row with no agency name hides a
-- workspace row that has one.
WITH b AS (
  SELECT b.id, b.organization_id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  CASE
    WHEN aba.brand_id = b.id THEN 'this brand'
    WHEN aba.brand_id IS NULL THEN 'workspace-wide'
    ELSE 'another brand'
  END AS scope,
  coalesce(btrim(aba.agency_name), '') <> '' AS has_agency_name,
  coalesce(btrim(aba.logo_url), '') <> '' AS has_logo,
  coalesce(btrim(aba.footer_text), '') <> '' AS has_footer_text,
  coalesce(btrim(aba.contact_line), '') <> '' AS has_contact_line
FROM b
JOIN agency_brand_assets aba ON aba.organization_id = b.organization_id
ORDER BY 1;

-- 9b. The report template the narrative used (the default one, else the
-- built-in list in generate-narrative-report.ts:16-27): its tone and which
-- sections it includes. render-report-pdf.ts:258 always passes
-- "professional" whatever the tone says, and adds "Source Type Gaps" and
-- "Evidence Archive" whether or not the template includes them.
WITH b AS (
  SELECT b.organization_id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  rt.id AS template_id,
  rt.is_default,
  rt.tone,
  s.ord AS section_order,
  s.section ->> 'type' AS section_type,
  s.section ->> 'include' AS included
FROM report_templates rt
JOIN b ON rt.organization_id = b.organization_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(rt.sections) = 'array' THEN rt.sections ELSE '[]'::jsonb END
) WITH ORDINALITY AS s(section, ord)
ORDER BY rt.is_default DESC, rt.id, s.ord;

-- 9c. Active delivery schedules in the workspace. generate-narrative-
-- report.ts:57-70 makes a weekly report for a brand when the workspace has
-- ANY active schedule, whichever brand that schedule is for.
WITH b AS (
  SELECT b.id, b.organization_id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  count(*) FILTER (WHERE s.is_active) AS active_schedules,
  count(*) FILTER (WHERE s.is_active AND s.brand_id = b.id) AS active_for_this_brand,
  count(*) FILTER (WHERE s.is_active AND s.brand_id IS NULL) AS active_workspace_wide
FROM b
LEFT JOIN report_delivery_schedules s ON s.organization_id = b.organization_id
GROUP BY b.id;

ROLLBACK;
