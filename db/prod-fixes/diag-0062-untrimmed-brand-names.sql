-- diag-0062-untrimmed-brand-names.sql (task #46, Part 2 read-only diagnosis)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only.
--
-- WHY: lib/audit/detect-mention.ts's regexDetect() builds
-- `\b(${escapedBrandName}|...)\b` directly from the stored brands.name --
-- a brand name with a leading/trailing space (e.g. " Omega Services")
-- makes the FIRST alternative require a literal space character
-- immediately adjacent to the name in the response text. That holds by
-- coincidence in ordinary prose (the natural word-separating space
-- satisfies it), but fails whenever the name is immediately adjacent to
-- punctuation with no space -- e.g. quote-wrapped ("Omega Services") or
-- Markdown-bold (**Omega Services**) mentions, both confirmed to return
-- false via a direct regex reproduction (see the Part 2 report). This
-- scan finds every brand whose stored name or domain could trigger the
-- same failure mode. Row-listing only (ids), no content, no counts
-- aggregated in a way that could leak which specific customer is
-- affected beyond what Sri already has the access to see directly.
--
-- Column meaning: `field` says which column is untrimmed; `id` is the
-- brand id (never joined to a human-readable name/domain string here,
-- so this file stays safe to paste into a shared channel if needed --
-- Sri can look up each id in the brands table himself).

SELECT 'name' AS field, id
FROM brands
WHERE name <> btrim(name)

UNION ALL

SELECT 'domain' AS field, id
FROM brands
WHERE domain <> btrim(domain)

ORDER BY field, id;
