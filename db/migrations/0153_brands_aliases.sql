-- Migration 0153, brand aliases (22 Nov 2026, S00 part 4; LLD 7.7, 8.8.2, T2): the other names AI might write a
-- business under, and the name the add-brand wizard suggested from its website.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0153 run1 -> run3; run4 only to undo). The pushed code selects these
-- columns with every brand row (Drizzle reads every schema column): without them every brand page and audit fails.
--
-- - brands.aliases: up to 10 other names ("techcoreit", "TechCoreIT", a legal name), each 2-60 characters, unique as
--   written and never the brand's own name (checked by the API, lib/brands/aliases.ts; the CHECK below holds the
--   count). Mention detection and the branded-question rule read them with the name (lib/audit/detect-mention.ts,
--   lib/audit/flag-branded-prompts.ts). Existing brands get '{}', so nothing they detect or count changes.
-- - brands.name_suggestion: the name the wizard suggested from the site (og:site_name, the title's brand segment,
--   JSON-LD name; lib/brands/name-suggestion.ts) when the brand was added. Brand settings says "Suggested from your
--   website's name" only while the name still equals it. NULL for every existing brand.
--
-- Additive only: two columns with defaults, one CHECK. brands keeps its RLS and grants (prod-fix 0052 gives
-- visibleau_app DML on every column). Idempotent.
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "aliases" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "name_suggestion" TEXT;

DO $$ BEGIN
  ALTER TABLE "brands" ADD CONSTRAINT "brands_aliases_at_most_10" CHECK (cardinality("aliases") <= 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
