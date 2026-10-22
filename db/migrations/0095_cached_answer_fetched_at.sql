-- Migration 0095 (Vunnara, 23 Oct, "The cached-answer age must be the
-- age of the content", item 2): audit #33 showed "cached answers from
-- 19 Oct 10:57 (up to 82h old)" even after the prior task's fix
-- (filtering out EXPIRED rows) -- because a row that's been refreshed
-- keeps its original created_at, so the display described the row's
-- first-ever creation, not when the content it's currently holding
-- was actually produced.
--
-- llm_response_cache.fetched_at: set on EVERY insert and EVERY
-- refresh (lib/llm/cache.ts's setCached()) -- always the real time
-- of the CURRENT content, distinct from created_at (frozen at first
-- insert).
--
-- citations.cached_from_at: a permanent, per-citation snapshot of
-- that same real fetch time, captured once when THIS citation reused
-- a cached answer (lib/llm/cache.ts's getCached() return value,
-- persisted at write time in inngest/functions/run-audit.ts and
-- lib/audit/run-audit-inline.ts). Chosen over re-querying llm_
-- response_cache at display time: a LATER, unrelated audit could
-- refresh the same cache row before anyone views this one's detail
-- page, which would make a live re-query describe the cache table in
-- general, not what this audit's citations actually used.
--
-- Both nullable, additive, no backfill: NULL for a live call (citations.
-- cached_from_at) or a row never cached before this column existed
-- (llm_response_cache.fetched_at) -- never invented from expires_at
-- minus an assumed TTL, because grounding mode isn't stored as its own
-- column (only baked into the one-way cache_key hash), so which TTL
-- (24h grounded vs 48h memory-only) a historical row used is a genuine
-- guess for any row citedUrls doesn't already prove was Perplexity
-- (always grounded). The app already treats NULL as "age unknown" --
-- no cached line shown -- which is the honest state for every existing
-- row either way.

BEGIN;

ALTER TABLE llm_response_cache
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

ALTER TABLE citations
  ADD COLUMN IF NOT EXISTS cached_from_at timestamptz;

COMMIT;
