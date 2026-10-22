-- Migration 0093 (Vunnara, 22 Oct, "audits time out on Vercel", item
-- 2): each (engine, prompt) provider call now writes its citation or
-- failure row INSIDE the same Inngest step as the call itself, with a
-- deterministic step id ("call:<engine>:<promptIndex>"). If the
-- Vercel request running that step is killed after the call (and its
-- write) already happened but before Inngest's own response reached
-- it, Inngest replays the whole step -- without a real key, that
-- replay would insert a SECOND citation or failure row for the exact
-- same call.
--
-- prompt_index (this call's position in the audit's own prompt
-- array, not the prompt's text) is the natural key component that
-- makes (audit_id, engine, prompt_index) unique per real call.
-- Nullable, no backfill -- same reasoning as every other additive
-- column in this ledger (0045, 0091, ...): a legacy row (written
-- before this column existed, by the old two-steps-per-call shape)
-- is NULL, and Postgres never treats two NULLs as equal in a unique
-- index, so historical rows can never collide with the new
-- constraint -- they were never at risk of this specific duplication
-- anyway (the old per-step budget bug this follow-up fixes is what
-- creates the risk, and it only applies going forward).
ALTER TABLE citations ADD COLUMN IF NOT EXISTS prompt_index integer;
ALTER TABLE engine_call_failures ADD COLUMN IF NOT EXISTS prompt_index integer;

CREATE UNIQUE INDEX IF NOT EXISTS citations_audit_engine_prompt_idx_unique_idx
  ON citations (audit_id, engine, prompt_index);

CREATE UNIQUE INDEX IF NOT EXISTS engine_call_failures_audit_engine_prompt_idx_unique_idx
  ON engine_call_failures (audit_id, engine, prompt_index);
