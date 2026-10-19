-- diag-0082-audit30-mentions-and-sources.sql (Vunnara, 19 Oct,
-- post-ecc805d, read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- Pinned to: audit_id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca'
--            brand_id = 'b8d7cb50-8722-4007-ae17-08a20e355956' (Omega Services)
--
-- WHY: detectBrandMention() (lib/audit/detect-mention.ts) is a NAME-ONLY
-- match (brand.name via lib/brands/normalize.ts's brandNamePattern),
-- falling back to a domain-stem match (entityDetect) -- it never reads
-- or considers location (suburb/city/state) at all. "Omega Services" is
-- a common business name, so a web-grounded answer that's actually
-- talking about a DIFFERENT Omega Services (another suburb, state, or
-- trade) would be counted as a mention identically to the real one.
-- This file surfaces the matched excerpt and cited sources for each of
-- the 6 mentions so a human can judge, case by case, whether it's
-- really this business -- it does not change the matching logic.

-- Result 1: one row per answer where brand_mentioned = true.
WITH mentioned AS (
  SELECT
    c.engine,
    c.prompt AS question_text,
    c.is_branded_prompt AS is_branded,
    c.position AS rank_position,
    c.response_text,
    c.response_snippet,
    c.cited_sources,
    c.created_at
  FROM citations c
  WHERE c.audit_id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca'
    AND c.brand_mentioned = true
)
SELECT
  engine,
  question_text,
  is_branded,
  rank_position,
  CASE
    WHEN response_text IS NOT NULL AND position('omega' IN lower(response_text)) > 0
      THEN substring(
        response_text
        FROM GREATEST(1, position('omega' IN lower(response_text)) - 200)
        FOR 400
      )
    WHEN response_snippet IS NOT NULL AND position('omega' IN lower(response_snippet)) > 0
      THEN substring(
        response_snippet
        FROM GREATEST(1, position('omega' IN lower(response_snippet)) - 200)
        FOR 400
      )
    ELSE NULL
  END AS excerpt_around_first_omega,
  -- true when the excerpt above came from the 500-char snippet because
  -- the full response_text wasn't stored (pre migration 0045) -- the
  -- excerpt may be truncated/incomplete in that case.
  (response_text IS NULL) AS excerpt_from_snippet_only,
  (
    SELECT jsonb_agg(elem->>'url')
    FROM jsonb_array_elements(cited_sources) elem
  ) AS cited_urls,
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(cited_sources) elem
    WHERE elem->>'url' ILIKE '%omegaservices.com.au%'
  ) AS cited_own_domain,
  created_at
FROM mentioned
ORDER BY engine, created_at;

-- Result 2: the full grid -- every organic (non-branded) question x
-- engine, mentioned yes/no, to read alongside Result 1.
SELECT
  c.prompt AS question_text,
  c.engine,
  c.brand_mentioned AS mentioned,
  c.position AS rank_position
FROM citations c
WHERE c.audit_id = '2cab2f88-304b-45c8-b195-1b02b4aa6dca'
  AND c.is_branded_prompt IS NOT TRUE
ORDER BY c.prompt, c.engine;
