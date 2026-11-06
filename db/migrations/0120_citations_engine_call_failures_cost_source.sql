-- Migration 0120 (Vunnara, 6 Nov, "Record costs from what each provider
-- actually reports", item 1): where each recorded call cost came from.
--
-- citations.llm_cost_source and engine_call_failures.cost_source:
--   'provider_reported' -- the provider's own figure for the call
--     (Perplexity's usage.cost.total_cost, lib/llm/perplexity-impl.ts),
--     recorded as it is, with no table rate or request fee on top;
--   'price_table' -- tokens and fees at lib/audit/compute-cost.ts's rates
--     (every other engine, and a Perplexity response without usage.cost).
--   Over a retried call's billed attempts the source is 'provider_reported'
--   only when every billed attempt's was (lib/llm/with-retry.ts).
--
-- Nullable, no default, no backfill: NULL means nothing was billed (a cache
-- hit) or the row was written before this migration -- every one of those
-- costs came from the price table, but that was never recorded per row.

ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_cost_source text;
DO $$ BEGIN
  ALTER TABLE citations
    ADD CONSTRAINT citations_llm_cost_source_check
    CHECK (llm_cost_source IN ('provider_reported', 'price_table'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE engine_call_failures ADD COLUMN IF NOT EXISTS cost_source text;
DO $$ BEGIN
  ALTER TABLE engine_call_failures
    ADD CONSTRAINT engine_call_failures_cost_source_check
    CHECK (cost_source IN ('provider_reported', 'price_table'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
