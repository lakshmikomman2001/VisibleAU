-- diag-0070-brand-name-normalize.sql (Vunnara Build 1, Part A, read-only)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: extends diag-0062-untrimmed-brand-names.sql's predicate (plain
-- btrim) to also catch DOUBLED internal whitespace ("Omega  Services")
-- -- that passes diag-0062's btrim-only check but still isn't what
-- lib/brands/normalize.ts's normalizeBrandName (used by mention
-- detection and the branded-prompt rule going forward) normalises to.
-- Row-listing only (ids), no name/domain content, same safety posture
-- as diag-0062.
--
-- NOTE: deliberately does NOT reproduce normalizeBrandName's NFKC step
-- in SQL -- Postgres's NORMALIZE(text, form) function needs PG 16+, and
-- this repo has no confirmed prod Postgres version to rely on that for.
-- The proven bug (diag-0062, the Part 2 report) is whitespace-only;
-- NFKC is a defensive edge case in the TS function, not something any
-- real prod row has been shown to need. SQL predicate:
--   name <> btrim(regexp_replace(name, '\s+', ' ', 'g'))

SELECT id
FROM brands
WHERE name <> btrim(regexp_replace(name, '\s+', ' ', 'g'))
ORDER BY id;

-- Build 1 addendum, item 8e: there is no DB-level unique constraint on
-- brands.name (confirmed -- db/schema/brands.ts has none; only
-- brand_token is unique, unrelated), so 0071-run2-apply.sql's UPDATE
-- can never fail with a constraint error. But two SEPARATE brand rows
-- in the same org whose names only differ by the whitespace this fix
-- normalises away (" Omega Services" vs "Omega Services") would
-- become identical strings after normalization -- a real data-quality
-- question Sri should see before applying, even though nothing here
-- blocks the UPDATE itself.
--
-- Expected result: zero rows. Any row returned names an
-- (organization_id, normalized_name) pair shared by 2+ brands -- STOP
-- and check those brands by hand before running 0071-run2-apply.sql.
SELECT organization_id, btrim(regexp_replace(name, '\s+', ' ', 'g')) AS normalized_name,
  array_agg(id ORDER BY id) AS colliding_brand_ids, count(*) AS brand_count
FROM brands
GROUP BY organization_id, btrim(regexp_replace(name, '\s+', ' ', 'g'))
HAVING count(*) > 1
ORDER BY organization_id;
