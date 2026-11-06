-- diag-0122-engine-mention-detection.sql (Sri, 6 Nov): across Omega
-- Services' audits #37-#40, per engine -- the everyday answers, how many
-- have "omega" anywhere in their stored text, and how many the audit
-- marked brand_mentioned, verified and unverified. Then, for any gap,
-- what shape the text has where "omega" appears but no mention was
-- marked, and what the stored answers and sources look like per engine.
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECTs only, inside a READ ONLY
-- transaction that ends in ROLLBACK. Counts, lengths, flags, dates, audit
-- numbers, statuses and model ids only -- no answer text, question text,
-- URLs, domains or names in the output. Sri runs it; NOT run from Claude
-- Code against production. Run the whole file.
--
-- The brand: Omega Services in the Splice Marketing workspace, picked the
-- way diag-0111 picks it -- query 0 must return exactly ONE row. Audit
-- numbers belong to the workspace, not the brand (audits_org_audit_
-- number_idx), so query 1 lists the workspace's #37-#40 and says which
-- are this brand's; every later query counts this brand's only.
--
-- "Everyday answers": citations rows with is_branded_prompt IS NOT TRUE
-- and run_number = 1 -- the audit page's basis (lib/audit/organic-
-- filter.ts's ORGANIC_ONLY; lib/scoring/resolve-audit-dimensions.ts:170).
-- A call that failed has no citations row; query 1 counts those.
--
-- What each answer row holds (inngest/functions/run-audit.ts:290-347;
-- lib/audit/run-audit-inline.ts does the same):
--   response_text         the whole answer: the string the detector read.
--   brand_mentioned       detectBrandMention(answer, brand) found the
--                         brand's name (lib/brands/normalize.ts's
--                         brandNamePattern) or, failing that, its domain
--                         stem (lib/audit/detect-mention.ts's entityDetect).
--   mention_verification  only when a mention was found, verifyMention()
--                         (lib/audit/verify-mention.ts): 'verified_domain'
--                         when a stored source -- or, for Gemini, a
--                         grounding title, which isn't stored -- is the
--                         brand's own domain; else 'verified_location'
--                         when the brand's suburb or city is a whole word
--                         within 300 characters of the first match (the
--                         brand's location confirmed, not online-only);
--                         else 'unverified'. NULL when nothing was found.
--
-- Queries 4 and 5 rebuild the detector's regex from the brand row, the
-- same way brandNamePattern builds it. Their two sql_detector_disagrees
-- columns should both be 0; if not, this file's copy of the detector is
-- wrong, not the app's -- read the rest of query 4 with care.
--
-- Checks that should hold:
--   query 2: marked_verified + marked_unverified + marked_no_verification
--            = marked_brand_mentioned.
--   query 4: the three not_marked_* shapes add up to
--            omega_in_text_not_marked.

BEGIN TRANSACTION READ ONLY;

-- 0. The brand (expect exactly 1 row), and the fields detection and
-- verification read from it. name_words: the detector needs every word of
-- the stored name, in order, so a longer stored name ("... Pty Ltd")
-- would need the answer to say all of it. domain_starts_with_www: the
-- domain-stem check keeps "www" (detect-mention.ts:55), so it could then
-- only match "www omegaservices"-shaped text.
SELECT
  b.id AS brand_id,
  lower(regexp_replace(btrim(b.name), '\s+', ' ', 'g')) = 'omega services' AS name_is_omega_services,
  cardinality(regexp_split_to_array(btrim(b.name), '\s+')) AS name_words,
  b.domain ~* '^www\.' AS domain_starts_with_www,
  b.domain ~* '^https?://|/' AS domain_has_scheme_or_path,
  b.domain ILIKE '%omega%' AS domain_contains_omega,
  coalesce(btrim(b.suburb), '') <> '' AS has_suburb,
  coalesce(btrim(b.city), '') <> '' AS has_city,
  coalesce(btrim(b.state), '') <> '' AS has_state,
  b.location_mode,
  b.location_confirmed_at AT TIME ZONE 'Australia/Sydney' AS location_confirmed_sydney,
  b.updated_at AT TIME ZONE 'Australia/Sydney' AS brand_updated_sydney,
  b.deleted_at IS NOT NULL AS deleted
FROM brands b
JOIN organizations o ON o.id = b.organization_id
WHERE b.name ILIKE 'Omega Services%'
  AND o.name ILIKE 'Splice Marketing%';

-- 1. The workspace's audits #37-#40: whose they are, when they ran, and
-- how many everyday answers and failed everyday calls each engine had
-- (engine/error_class=count). A failed call keeps no answer text, so it
-- can't be scanned: e.g. Claude's 6th search in one answer (over
-- maxUses: 5) comes back as max_uses_exceeded, and anthropic-impl.ts
-- throws that whole answer away as a search_tool_error.
-- location_confirmed_before_audit: verifyMention's location check only
-- runs once the brand's location is confirmed (it reads the brand row as
-- the audit ran; brand_updated_sydney in query 0 says whether that row
-- has changed since).
WITH b AS (
  SELECT b.id, b.organization_id, b.location_confirmed_at FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  a.audit_number,
  a.brand_id = b.id AS this_brand,
  a.status,
  a.triggered_by,
  a.started_at AT TIME ZONE 'Australia/Sydney' AS started_sydney,
  a.completed_at AT TIME ZONE 'Australia/Sydney' AS completed_sydney,
  coalesce(b.location_confirmed_at < coalesce(a.started_at, a.created_at), false)
    AS location_confirmed_before_audit,
  a.engines,
  a.prompts_count,
  (
    SELECT string_agg(x.engine || '=' || x.n, ', ' ORDER BY x.engine)
    FROM (
      SELECT c.engine, count(*) AS n FROM citations c
      WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE AND c.run_number = 1
      GROUP BY c.engine
    ) x
  ) AS everyday_answers_by_engine,
  (
    SELECT string_agg(x.engine || '/' || x.error_class || '=' || x.n, ', ' ORDER BY x.engine, x.error_class)
    FROM (
      SELECT f.engine, f.error_class, count(*) AS n FROM engine_call_failures f
      WHERE f.audit_id = a.id AND f.is_branded_prompt IS NOT TRUE
      GROUP BY f.engine, f.error_class
    ) x
  ) AS everyday_failed_calls_by_engine
FROM audits a
JOIN b ON a.organization_id = b.organization_id
WHERE a.audit_number BETWEEN 37 AND 40
ORDER BY a.audit_number;

-- 2. WHAT YOU ASKED FOR: per engine, across this brand's #37-#40 (ALL =
-- every engine together).
--   text_contains_omega      response_text ILIKE '%omega%' -- any case,
--                            any word ("Omega-3", another "Omega ..."
--                            business and a URL all count).
--   marked_verified          brand_mentioned and verified_domain or
--                            verified_location -- the mentions the audit
--                            page counts.
--   marked_unverified        brand_mentioned and 'unverified' -- shown as
--                            "Possible mention, not confirmed as your
--                            business", not counted.
--   omega_in_text_not_marked the gap query 4 takes apart.
--   marked_no_verification   a mention with no verification recorded
--                            (rows from before 21 Oct); expect 0.
WITH b AS (
  SELECT b.id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
),
c AS (
  SELECT c.engine, c.brand_mentioned, c.mention_verification, c.response_text
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  JOIN b ON a.brand_id = b.id
  WHERE a.audit_number BETWEEN 37 AND 40
    AND c.is_branded_prompt IS NOT TRUE
    AND c.run_number = 1
)
SELECT
  coalesce(c.engine, 'ALL') AS engine,
  count(*) AS everyday_answers,
  count(*) FILTER (WHERE c.response_text ILIKE '%omega%') AS text_contains_omega,
  count(*) FILTER (WHERE c.brand_mentioned) AS marked_brand_mentioned,
  count(*) FILTER (
    WHERE c.brand_mentioned AND c.mention_verification IN ('verified_domain', 'verified_location')
  ) AS marked_verified,
  count(*) FILTER (WHERE c.brand_mentioned AND c.mention_verification = 'unverified') AS marked_unverified,
  count(*) FILTER (WHERE c.response_text ILIKE '%omega%' AND NOT c.brand_mentioned) AS omega_in_text_not_marked,
  count(*) FILTER (WHERE c.mention_verification = 'verified_domain') AS verified_by_domain,
  count(*) FILTER (WHERE c.mention_verification = 'verified_location') AS verified_by_location,
  count(*) FILTER (WHERE c.brand_mentioned AND c.mention_verification IS NULL) AS marked_no_verification,
  count(*) FILTER (WHERE c.response_text IS NULL) AS no_full_text_stored
FROM c
GROUP BY ROLLUP (c.engine)
ORDER BY (c.engine IS NULL), c.engine;

-- 3. The same counts per audit and engine (engine = 'ALL': the audit's
-- engines together).
WITH b AS (
  SELECT b.id FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
)
SELECT
  a.audit_number,
  coalesce(c.engine, 'ALL') AS engine,
  count(*) AS everyday_answers,
  count(*) FILTER (WHERE c.response_text ILIKE '%omega%') AS text_contains_omega,
  count(*) FILTER (WHERE c.brand_mentioned) AS marked_brand_mentioned,
  count(*) FILTER (
    WHERE c.brand_mentioned AND c.mention_verification IN ('verified_domain', 'verified_location')
  ) AS marked_verified,
  count(*) FILTER (WHERE c.brand_mentioned AND c.mention_verification = 'unverified') AS marked_unverified,
  count(*) FILTER (WHERE c.response_text ILIKE '%omega%' AND NOT c.brand_mentioned) AS omega_in_text_not_marked
FROM citations c
JOIN audits a ON a.id = c.audit_id
JOIN b ON a.brand_id = b.id
WHERE a.audit_number BETWEEN 37 AND 40
  AND c.is_branded_prompt IS NOT TRUE
  AND c.run_number = 1
GROUP BY GROUPING SETS ((a.audit_number, c.engine), (a.audit_number))
ORDER BY a.audit_number, (c.engine IS NULL), c.engine;

-- 4. Where "omega" is in the text but no mention was marked, by shape,
-- with this file's copy of the detector as a check, and why mentions
-- stayed unverified.
--   name_rx   brandNamePattern: the stored name's words (NFKC, trimmed,
--             "and" also matching "&"), with only whitespace (JS's \s,
--             spelled out), - en dash em dash & ' curly apostrophe or .
--             between them, an optional possessive, and no letter or digit
--             right before or after.
--   core_rx   the same words and separators without the before/after rule.
--   loose_rx  the same words with up to 12 of anything but a letter or
--             digit between them.
--   stem_rx   entityDetect: the domain minus its TLD, - and . read as
--             spaces, between word boundaries; skipped under 4 characters.
-- Shapes, for answers with "omega" in the text but not marked:
--   not_marked_name_glued       the whole name is there with allowed
--                               separators, but a letter or digit touches
--                               it, e.g. "NorwestOmega Services" -- what
--                               joining text blocks with nothing between
--                               them can produce.
--   not_marked_name_split       the name's words are there, but split by
--                               characters the detector doesn't allow
--                               between words, e.g. "**Omega** Services",
--                               "Omega_Services" or a zero-width space.
--   not_marked_other_omega      "omega" without this name next to it:
--                               another business, a shortened name, or an
--                               unrelated word.
-- Verification, for marked mentions (window = 300 characters either side
-- of the first name match, as verifyMention cuts it; JS counts an emoji
-- as 2 characters and Postgres as 1, so a window can differ slightly):
--   unverified_location_in_window          should be 0 when query 1 says
--                                          the location was confirmed
--                                          before the audit.
--   unverified_location_elsewhere          the suburb or city is in the
--                                          answer, but not near the first
--                                          match.
--   unverified_brand_domain_in_sources     should be 0.
--   verified_domain_not_in_stored_sources  verified by a source that
--                                          isn't stored: Gemini's grounding
--                                          titles.
WITH b AS (
  SELECT
    b.id, b.name, b.domain,
    nullif(btrim(b.suburb), '') AS suburb,
    nullif(btrim(b.city), '') AS city,
    lower(regexp_replace(regexp_replace(regexp_replace(btrim(b.domain),
      '^https?://', '', 'i'), '/.*$', ''), '^www\.', '', 'i')) AS bare_domain
  FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
),
sep AS (
  SELECT '[-\s' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8232)
    || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || chr(8211)
    || chr(8212) || '&''' || chr(8217) || '.]*' AS s
),
w AS (
  SELECT array_agg(
    CASE WHEN lower(t.word) = 'and' THEN '(?:and|&)'
      ELSE regexp_replace(t.word, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') END
    ORDER BY t.n
  ) AS words
  FROM b
  CROSS JOIN LATERAL unnest(regexp_split_to_array(
    regexp_replace(normalize(b.name, NFKC), '^\s+|\s+$', '', 'g'), '\s+'
  )) WITH ORDINALITY AS t(word, n)
),
st AS (
  SELECT regexp_replace(regexp_replace(b.domain, '\.(com\.au|com|net|org|io|co)$', '', 'i'),
    '[-.]', ' ', 'g') AS stem
  FROM b
),
rx AS (
  SELECT
    '(?<![A-Za-z0-9])' || array_to_string(w.words, sep.s)
      || '(?:[''' || chr(8217) || ']s?)?(?![A-Za-z0-9])' AS name_rx,
    array_to_string(w.words, sep.s) AS core_rx,
    array_to_string(w.words, '[^A-Za-z0-9]{0,12}') AS loose_rx,
    CASE WHEN length(st.stem) >= 4 THEN
      '\y' || replace(regexp_replace(regexp_replace(st.stem, '([.*+?^${}()|\[\]\\])', '\\\1', 'g'),
        '\s+', ' ', 'g'), ' ', '\s+') || '\y'
    END AS stem_rx,
    CASE WHEN b.suburb IS NOT NULL THEN
      '\y' || regexp_replace(b.suburb, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\y' END AS suburb_rx,
    CASE WHEN b.city IS NOT NULL THEN
      '\y' || regexp_replace(b.city, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\y' END AS city_rx
  FROM b, w, sep, st
),
c0 AS (
  SELECT
    c.engine,
    c.brand_mentioned,
    c.mention_verification,
    coalesce(c.response_text, '') AS t,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.cited_sources) = 'array' THEN c.cited_sources ELSE '[]'::jsonb END
      ) e
      WHERE lower(e ->> 'domain') = b.bare_domain
        OR lower(e ->> 'domain') LIKE '%.' || b.bare_domain
    ) AS brand_domain_in_sources
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  JOIN b ON a.brand_id = b.id
  WHERE a.audit_number BETWEEN 37 AND 40
    AND c.is_branded_prompt IS NOT TRUE
    AND c.run_number = 1
),
c1 AS (
  SELECT
    c0.*,
    c0.t ILIKE '%omega%' AS has_omega,
    c0.t ~* rx.name_rx AS name_match,
    coalesce(rx.stem_rx IS NOT NULL AND c0.t ~* rx.stem_rx, false) AS stem_match,
    c0.t ~* rx.core_rx AS core_match,
    c0.t ~* rx.loose_rx AS loose_match,
    coalesce(c0.t ~* rx.suburb_rx, false) OR coalesce(c0.t ~* rx.city_rx, false) AS location_anywhere,
    CASE WHEN c0.t ~* rx.name_rx
      THEN length((regexp_split_to_array(c0.t, rx.name_rx, 'i'))[1]) END AS first_match_at
  FROM c0
  CROSS JOIN rx
),
c AS (
  SELECT
    c1.*,
    CASE WHEN c1.first_match_at IS NOT NULL THEN
      coalesce(substr(c1.t, greatest(0, c1.first_match_at - 300) + 1,
        least(length(c1.t), c1.first_match_at + 300) - greatest(0, c1.first_match_at - 300)) ~* rx.suburb_rx, false)
      OR coalesce(substr(c1.t, greatest(0, c1.first_match_at - 300) + 1,
        least(length(c1.t), c1.first_match_at + 300) - greatest(0, c1.first_match_at - 300)) ~* rx.city_rx, false)
    END AS location_in_window
  FROM c1
  CROSS JOIN rx
)
SELECT
  coalesce(engine, 'ALL') AS engine,
  count(*) FILTER (WHERE has_omega AND NOT brand_mentioned) AS omega_in_text_not_marked,
  count(*) FILTER (WHERE has_omega AND NOT brand_mentioned AND core_match) AS not_marked_name_glued,
  count(*) FILTER (WHERE has_omega AND NOT brand_mentioned AND NOT core_match AND loose_match)
    AS not_marked_name_split,
  count(*) FILTER (WHERE has_omega AND NOT brand_mentioned AND NOT core_match AND NOT loose_match)
    AS not_marked_other_omega,
  count(*) FILTER (WHERE brand_mentioned AND NOT has_omega) AS marked_without_omega_in_text,
  count(*) FILTER (WHERE brand_mentioned AND NOT name_match AND stem_match) AS marked_by_domain_stem_only,
  count(*) FILTER (WHERE brand_mentioned AND NOT (name_match OR stem_match)) AS sql_detector_disagrees_marked,
  count(*) FILTER (WHERE NOT brand_mentioned AND (name_match OR stem_match)) AS sql_detector_disagrees_not_marked,
  count(*) FILTER (WHERE mention_verification = 'unverified' AND location_in_window)
    AS unverified_location_in_window,
  count(*) FILTER (WHERE mention_verification = 'unverified' AND location_anywhere
    AND location_in_window IS NOT TRUE) AS unverified_location_elsewhere,
  count(*) FILTER (WHERE mention_verification = 'unverified' AND brand_domain_in_sources)
    AS unverified_brand_domain_in_sources,
  count(*) FILTER (WHERE mention_verification = 'verified_domain' AND NOT brand_domain_in_sources)
    AS verified_domain_not_in_stored_sources
FROM c
GROUP BY ROLLUP (engine)
ORDER BY (engine IS NULL), engine;

-- 5. What the stored answers and their sources look like, per engine.
-- Sources (citations.cited_sources: {domain, url, origin} per entry, one
-- per domain, no titles -- lib/audit/extract-citations.ts's
-- mergeCitedSources):
--   Claude:     every result of every search it ran ('retrieved'), cited
--               or not, plus domains written in the answer ('recalled').
--   Gemini:     its grounding links are all Google redirect links on one
--               host, so at most one 'retrieved' entry survives, and it
--               never names a site; the real domains are in grounding
--               titles, which are used for verification but not stored.
--   brand_domain_in_sources_not_marked  the brand's own site was among
--                                       the sources, but the answer didn't
--                                       name the brand.
--   omega_in_sources_not_in_text        a source's domain or URL has
--                                       "omega", the answer text doesn't.
-- Answer shape (fingerprints, not proof):
--   glued_sentence           a lowercase letter, then . ! ? or :, then a
--                            capitalised word with no space ("search.Based")
--                            -- what Claude's text blocks look like once
--                            the AI SDK joins them with nothing between.
--   under_400_chars          short answers.
--   ends_with_search_promise the answer's last sentence says it will
--                            search, look, check or find: an answer stored
--                            before its findings. The AI SDK maps Claude's
--                            pause_turn to an ordinary finish and Gemini's
--                            RECITATION / SAFETY cut-offs to
--                            "content-filter"; neither adapter reads the
--                            finish reason, so both are stored as answers.
WITH b AS (
  SELECT
    b.id,
    lower(regexp_replace(regexp_replace(regexp_replace(btrim(b.domain),
      '^https?://', '', 'i'), '/.*$', ''), '^www\.', '', 'i')) AS bare_domain
  FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.name ILIKE 'Omega Services%' AND o.name ILIKE 'Splice Marketing%'
),
c AS (
  SELECT
    c.engine,
    c.brand_mentioned,
    c.is_cache_hit,
    c.llm_model,
    coalesce(c.response_text, '') AS t,
    CASE WHEN jsonb_typeof(c.cited_sources) = 'array' THEN c.cited_sources ELSE '[]'::jsonb END AS s,
    b.bare_domain
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  JOIN b ON a.brand_id = b.id
  WHERE a.audit_number BETWEEN 37 AND 40
    AND c.is_branded_prompt IS NOT TRUE
    AND c.run_number = 1
),
d AS (
  SELECT
    c.*,
    jsonb_array_length(c.s) AS sources,
    (SELECT count(*) FROM jsonb_array_elements(c.s) e WHERE e ->> 'origin' = 'retrieved') AS retrieved,
    (SELECT count(*) FROM jsonb_array_elements(c.s) e
      WHERE e ->> 'origin' = 'retrieved' AND lower(e ->> 'domain') = 'vertexaisearch.cloud.google.com')
      AS google_redirect,
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(c.s) e
      WHERE lower(e ->> 'domain') = c.bare_domain OR lower(e ->> 'domain') LIKE '%.' || c.bare_domain
    ) AS brand_domain_in_sources
  FROM c
)
SELECT
  coalesce(engine, 'ALL') AS engine,
  count(*) AS everyday_answers,
  string_agg(DISTINCT llm_model, ', ') AS models,
  count(*) FILTER (WHERE is_cache_hit) AS cache_hits,
  min(length(t)) AS chars_min,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY length(t))::int AS chars_median,
  max(length(t)) AS chars_max,
  count(*) FILTER (WHERE sources > 0) AS with_any_source,
  round(avg(retrieved), 1) AS avg_retrieved_sources,
  count(*) FILTER (WHERE retrieved > 0 AND google_redirect = retrieved) AS only_google_redirect_sources,
  count(*) FILTER (WHERE brand_domain_in_sources) AS brand_domain_in_sources,
  count(*) FILTER (WHERE brand_domain_in_sources AND NOT brand_mentioned) AS brand_domain_in_sources_not_marked,
  count(*) FILTER (WHERE t NOT ILIKE '%omega%' AND s::text ILIKE '%omega%') AS omega_in_sources_not_in_text,
  count(*) FILTER (WHERE t ~ '\*\*[^*\n]+\*\*') AS with_bold,
  count(*) FILTER (WHERE t ~ '\[[^]\n]+\]\(https?://') AS with_markdown_link,
  count(*) FILTER (WHERE t ~ '(^|\n)[ \t]*([0-9]+[.)]|[-*])[ \t]') AS with_list,
  count(*) FILTER (WHERE t ~ '[a-z][.!?:][A-Z][a-z]') AS glued_sentence,
  count(*) FILTER (WHERE length(t) < 400) AS under_400_chars,
  count(*) FILTER (
    WHERE t ~* ('(let me|i[''' || chr(8217) || ']ll|i will|i am going to) (search|look|check|find)'
      || '[^.!?]*[.!?:]?\s*$')
  ) AS ends_with_search_promise
FROM d
GROUP BY ROLLUP (engine)
ORDER BY (engine IS NULL), engine;

ROLLBACK;
