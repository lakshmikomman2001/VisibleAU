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
