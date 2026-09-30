-- Migration 0033: add citations.is_branded_prompt
--
-- Task AA: Share of Voice counted every citation, including ones from
-- prompts that named the brand directly (e.g. "Is {brand} reputable?",
-- "{brand} vs {competitors}") -- 13 of 124 templates in the au-tradies
-- vertical pack do this. Those guarantee a trivial brand mention and
-- inflated Bondi Plumbing's SoV to 33.7%, ahead of real directories.
--
-- citations.prompt stores the already-EXPANDED prompt text (the {brand}
-- placeholder substituted with the real name) with no link back to which
-- vertical_pack_prompts.id / template produced it -- so branded-ness can't
-- be reconstructed after the fact from existing rows. This column is set at
-- write time (lib/audit/run-audit-inline.ts, inngest/functions/run-audit.ts),
-- right where the template is still in hand, from
-- lib/verticals/expand-prompt.ts's isBrandedPromptTemplate.
--
-- Nullable, not backfilled: rows written before this column existed stay
-- NULL and are treated as "not branded" (unfiltered) by the SoV calculation
-- -- they carry the same inflation as before until the brand's next
-- audit.complete run produces citations with this set correctly.

BEGIN;

ALTER TABLE citations
  ADD COLUMN IF NOT EXISTS is_branded_prompt boolean;

COMMIT;
