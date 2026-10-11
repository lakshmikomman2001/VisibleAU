-- READ-ONLY diagnostic for task #46 (post-17974b3/3416a26 follow-up):
-- "Gemini other: 5 citations, zero top domains" / "Claude other: 5
-- citations, only 3 domains despite the cap of 8" -- this lists the RAW
-- domain strings behind Bondi's latest audit's citedSources, per engine,
-- so we can see exactly what text-extraction produced before deciding
-- what extractCitations()/toRegistrableDomain() should reject.
--
-- Nothing in this file writes anything. NOT run from Claude Code -- Sri
-- runs this in the Neon SQL editor (dev or prod, either is fine, this is
-- purely informational).
--
-- The "looks_suspicious" column is a crude SQL-only heuristic (no real
-- TLD/PSL validation is possible inside SQL) -- it does NOT replace
-- actually running the domain through tldts (which is what
-- toRegistrableDomain/extractCitations do in TypeScript). It's only here
-- to help a human eye jump to the more likely junk rows faster; a "false"
-- here is not a guarantee the string is a real, resolvable domain.

WITH target_brand AS (
  SELECT id AS brand_id
  FROM brands
  WHERE domain = 'bondiplumbing.com.au'
),
latest_audit AS (
  SELECT a.id AS audit_id
  FROM audits a, target_brand tb
  WHERE a.brand_id = tb.brand_id
    AND a.status = 'complete'
  ORDER BY a.completed_at DESC
  LIMIT 1
),
organic_citations AS (
  SELECT c.engine, c.cited_sources
  FROM citations c, latest_audit la
  WHERE c.audit_id = la.audit_id
    AND c.run_number = 1
    AND c.is_branded_prompt IS NOT TRUE
),
cited_entries AS (
  SELECT
    oc.engine,
    entry ->> 'domain' AS domain,
    entry ->> 'url' AS url,
    entry ->> 'origin' AS origin
  FROM organic_citations oc
  CROSS JOIN LATERAL jsonb_array_elements(oc.cited_sources) AS entry
)
SELECT
  engine,
  domain,
  origin,
  count(*) AS occurrences,
  -- crude heuristic only -- see header comment above.
  (domain IS NULL OR domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
    AS looks_suspicious
FROM cited_entries
GROUP BY engine, domain, origin
ORDER BY engine, looks_suspicious DESC, occurrences DESC;
