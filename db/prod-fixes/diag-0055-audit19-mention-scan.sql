-- diag-0055-audit19-mention-scan.sql (task #46, Phase 1 of "insufficient data")
--
-- PRODUCTION branch. READ-ONLY. Run the whole file as one statement,
-- pasted into the Neon SQL editor. NOT run from Claude Code -- there is
-- no prod access (or even network egress to Neon) from that
-- environment, confirmed by two separate connection failures earlier in
-- this task. Resolves Bondi Plumbing by its brand id
-- (54b58fce-98f9-4749-ae25-9e541c0f874a -- pinned, not a name lookup:
-- brands.name is not unique) and picks its latest and previous
-- COMPLETED audits by completed_at -- no audit id is hardcoded.
--
-- WHAT THIS CHECKS: Audit #19 (16 Oct) showed 0% brand-mention rate on
-- all 4 engines. This settles whether that's genuine (the brand really
-- never comes up) or a detection miss (detectBrandMention's strict
-- full-name/domain-stem match -- lib/audit/detect-mention.ts -- failed
-- to catch a real mention written in some other form, e.g. "a local
-- Bondi-based plumber"). Per engine, per audit: the organic
-- (is_branded_prompt IS NOT TRUE), run_number = 1 (true independent
-- samples, not cache replays -- see lib/audit/organic-citations.ts's
-- own comment on why run_number=1 is the real sample) response count;
-- the STORED brand_mentioned count (what the app currently believes);
-- and a RAW TEXT SCAN count over response_snippet matching either the
-- brand name ("bondi\s*plumbing", case-insensitive, space/whitespace
-- tolerant) or the brand's own domain stem (the registrable domain with
-- its TLD and any leading "www." stripped -- same shape as
-- detect-mention.ts's entityDetect()). A raw-scan count HIGHER than the
-- stored brand_mentioned count for the same engine/audit is evidence of
-- a detection miss, not a genuine zero.
--
-- CAVEAT (read before trusting a "no difference found" result):
-- citations.response_snippet is truncated to 500 characters at write
-- time (lib/audit/run-audit-inline.ts / inngest/functions/run-audit.ts
-- both do `result.response.slice(0, 500)`) -- this scan only ever sees
-- each response's first 500 characters, never the full text. A mention
-- appearing later in a long response is invisible to this query and
-- would still read as "no raw-scan match" here even though it is one.
-- Treat a raw-scan count equal to the stored count as "no evidence of a
-- miss found in the stored snippet", not proof there is none.
--
-- Up to 3 short (<=160 char) excerpts around the raw-scan match are
-- included, per engine, for the LATEST audit only, and ONLY for rows
-- where the raw scan matched but brand_mentioned is false -- i.e.
-- candidate missed mentions worth eyeballing by hand.

WITH target_brand AS (
  SELECT id, name, domain
  FROM brands
  WHERE id = '54b58fce-98f9-4749-ae25-9e541c0f874a'
),
brand_stem AS (
  SELECT
    regexp_replace(
      regexp_replace(lower(domain), '^www\.', ''),
      '\.(com\.au|com|net|org|io|co)$', ''
    ) AS stem_raw
  FROM target_brand
),
ranked_audits AS (
  SELECT
    a.id AS audit_id,
    a.audit_number,
    a.completed_at,
    ROW_NUMBER() OVER (ORDER BY a.completed_at DESC) AS rn
  FROM audits a
  JOIN target_brand b ON b.id = a.brand_id
  WHERE a.status = 'complete'
),
selected_audits AS (
  SELECT
    audit_id,
    audit_number,
    completed_at,
    CASE WHEN rn = 1 THEN 'latest' ELSE 'previous' END AS audit_label
  FROM ranked_audits
  WHERE rn IN (1, 2)
),
scanned AS (
  SELECT
    sa.audit_label,
    sa.audit_number,
    sa.completed_at,
    c.engine,
    c.brand_mentioned,
    c.response_snippet,
    (
      c.response_snippet ~* 'bondi\s*plumbing'
      OR (
        length(bs.stem_raw) >= 4
        AND c.response_snippet ~* ('\b' || regexp_replace(bs.stem_raw, '[-.]', ' ', 'g') || '\b')
      )
    ) AS raw_scan_match
  FROM selected_audits sa
  JOIN citations c ON c.audit_id = sa.audit_id
  CROSS JOIN brand_stem bs
  WHERE c.is_branded_prompt IS NOT TRUE
    AND c.run_number = 1
)
SELECT
  s.audit_label,
  s.audit_number,
  s.completed_at,
  s.engine,
  COUNT(*) AS organic_run1_responses,
  COUNT(*) FILTER (WHERE s.brand_mentioned) AS stored_brand_mentioned_count,
  COUNT(*) FILTER (WHERE s.raw_scan_match) AS raw_text_scan_match_count,
  CASE
    WHEN s.audit_label = 'latest' THEN (
      SELECT array_agg(left(s2.response_snippet, 160))
      FROM (
        SELECT response_snippet
        FROM scanned s2
        WHERE s2.audit_label = s.audit_label
          AND s2.engine = s.engine
          AND s2.raw_scan_match
          AND NOT s2.brand_mentioned
        LIMIT 3
      ) s2
    )
    ELSE NULL
  END AS candidate_missed_mention_excerpts
FROM scanned s
GROUP BY s.audit_label, s.audit_number, s.completed_at, s.engine
ORDER BY CASE s.audit_label WHEN 'latest' THEN 0 ELSE 1 END, s.engine;
