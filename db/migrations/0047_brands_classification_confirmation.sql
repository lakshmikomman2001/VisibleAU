-- Migration 0047 (Vunnara Build 1, Part C): classification reliability
-- + confirmation columns on brands.
--
-- classification_error: the actual error classifyAndStoreBrand caught
-- (previously logged to console only and lost) -- drives the brand
-- page's "Classification failed" badge.
--
-- category_confirmed_at / audience / categories: the user's CONFIRMED
-- category/audience, which win over classification.category/
-- classification.audience (the LLM's guess) once set.
-- category_confirmed_at stays NULL until the user actually confirms,
-- independent of how confident the classifier itself was.
-- classification_status gains a 5th value, "needs_confirmation" --
-- `text` with an application-level enum (db/schema/brands.ts), not a
-- Postgres ENUM TYPE, so this needs no DDL of its own.
--
-- ALL NULLABLE / NO DEFAULT except categories (empty-array default) --
-- metadata-only on Postgres (no table rewrite), and live code between
-- apply and push never has to handle a NOT NULL column it doesn't know
-- about yet.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS classification_error text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS category_confirmed_at timestamptz;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}' NOT NULL;
