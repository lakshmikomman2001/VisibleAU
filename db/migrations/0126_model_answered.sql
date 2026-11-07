-- Migration 0126 (Vunnara, 7 Nov, Sri's decision 6): which model actually
-- answered. A provider can answer with a different model than the one asked
-- for (Perplexity's sonar-pro answered by sonar or "fast"; from 1 Dec 2026,
-- Google serves every gemini-2.5-flash call with gemini-3.5-flash-lite).
--
-- citations.llm_model_answered: the model the provider's response named
--   (OpenAI and Anthropic: response.model, often a dated snapshot of the
--   model asked for; Gemini: modelVersion; Perplexity: model).
--   citations.llm_model stays the model the app asked for -- on every
--   engine from now on; before this, Perplexity's row held the answered one.
--   lib/llm/model-drift.ts decides when the two differ, for the audit page's
--   note, the PDF's method page and the owners/admins/[ops] alert.
-- llm_response_cache.model_answered: the same, for the cached content, so a
--   cache hit's citation row carries it too.
--
-- Nullable, no default, no backfill: NULL means the response named no model,
-- or the row was written before this migration (never guessed).

ALTER TABLE citations ADD COLUMN IF NOT EXISTS llm_model_answered text;
ALTER TABLE llm_response_cache ADD COLUMN IF NOT EXISTS model_answered text;
