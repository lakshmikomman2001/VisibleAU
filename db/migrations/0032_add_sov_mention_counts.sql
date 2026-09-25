-- Migration 0032: add raw mention-count columns to share_of_voice_snapshots
--
-- Task X: Share of Voice was displayed as a Math.max() across a mixed grab-bag
-- of up to 20 snapshot rows spanning multiple audits AND multiple engines,
-- because share_of_voice_snapshots only stored the already-rounded
-- brand_share/competitor_share percentages -- each computed against its own
-- per-(audit, engine, prompt_category) denominator (total_mentions). Percentages
-- from different denominators can't be correctly combined by summing or
-- averaging them directly; only their underlying raw counts can be summed.
--
-- brand_mention_count / competitor_mention_count / total_mention_count let a
-- reader (the Visibility page's aggregator) correctly combine multiple engine
-- groups within ONE audit: sum counts per domain, sum the group totals, then
-- derive one coherent percentage -- instead of maxing pre-rounded percentages
-- across an unscoped history of rows.
--
-- Nullable, and NOT backfilled: total_prompts (a citation-row count) is a
-- different denominator than total_mentions (a mention count) and can't
-- reconstruct it for rows written before this column existed. Those legacy
-- rows keep their existing brand_share/competitor_share and are read
-- one-group-at-a-time by the aggregator until the next audit.complete run
-- populates the new columns going forward.
--
-- Not run through `drizzle-kit generate`: this repo's drizzle-kit journal is
-- known to be stale relative to the hand-maintained migration history (see
-- docs/ops/post-launch-db-hardening.md #1/#2) -- generate produced a
-- collision with the existing 0012_subscriptions_table.sql and a phantom
-- diff re-creating tables/columns that already exist. Hand-written instead,
-- matching the schema change already made in
-- db/schema/share-of-voice-snapshots.ts.

BEGIN;

ALTER TABLE share_of_voice_snapshots
  ADD COLUMN IF NOT EXISTS brand_mention_count integer,
  ADD COLUMN IF NOT EXISTS competitor_mention_count integer,
  ADD COLUMN IF NOT EXISTS total_mention_count integer;

COMMIT;
