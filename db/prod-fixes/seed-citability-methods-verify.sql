-- Verification for db/prod-fixes/seed-citability-methods-prod.sql.
-- Run against prod AFTER loading the seed. Nothing in this file writes
-- anything. NOT run from Claude Code.

-- 1. Row count. Expect 47.
SELECT count(*) FROM citability_methods;

-- 2. Research rows with a real citation_url. Expect 4 (all Aggarwal et al.,
--    arxiv.org/abs/2311.09735).
SELECT count(*) FROM citability_methods
WHERE source_type = 'research' AND citation_url IS NOT NULL;

-- 3. Every row's source_type is one of the two allowed values. Expect 0.
SELECT count(*) FROM citability_methods
WHERE source_type NOT IN ('research', 'vunnara_estimate');

-- 4. Every row has a valid impact_tier (none NULL, none out-of-range).
--    Expect 0.
SELECT count(*) FROM citability_methods
WHERE impact_tier IS NULL OR impact_tier NOT IN ('high', 'medium', 'low');

-- 5. Tier distribution, for a sanity glance against the reviewed proposal
--    (docs/ops/post-launch-db-hardening.md section 32).
SELECT impact_tier, count(*) FROM citability_methods GROUP BY impact_tier ORDER BY impact_tier;

-- 6. effect_size_pct is fully retired -- no row should carry the old
--    invented percentage. Expect 0.
SELECT count(*) FROM citability_methods WHERE effect_size_pct IS NOT NULL;

-- 7. Fabrication guard: confirms none of the previously-removed fabricated
--    strings (task NN/UUU) or the wrong arXiv id (task YYY) made it into
--    the loaded rows. Expect 0.
SELECT count(*) FROM citability_methods
WHERE source ILIKE '%SE Ranking%'
   OR effect_size_notes ILIKE '%4.9 vs 4.4%'
   OR effect_size_notes ILIKE '%5.0 vs 3.9%'
   OR citation_url ILIKE '%2404.11973%';

-- 8. Spot-check one research row and one estimate row.
SELECT method_key, source, citation_url, source_type, impact_tier, effect_size_pct
FROM citability_methods
WHERE method_key IN ('add-statistics-with-sources', 'wikipedia-presence');

-- Then reload https://vunnara.com.au/methods: 47 rows, a mix of
-- "Vunnara estimate" (muted) and "Research: ... ↗" (the 4 with real links,
-- all pointing at arxiv.org/abs/2311.09735), each with a High/Medium/Low
-- impact badge, no percentages anywhere, no fabricated text.
