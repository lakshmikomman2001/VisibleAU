-- Migration 0147 (14 Nov 2026): brands.classification_status accepts every value the app writes.
--
-- 0008_add_brand_classification.sql created the column with CHECK (classification_status IN ('pending',
-- 'processing','complete','failed')). Its same-numbered twin 0008_brief_luckman.sql runs after it in
-- filename order and adds the column without a CHECK (ADD COLUMN IF NOT EXISTS: skipped). Migration 0047
-- then added a fifth value, 'needs_confirmation' (db/schema/brands.ts), saying "no DDL needed" -- true of a
-- database without the CHECK, which production evidently is (its brands reach needs_confirmation), but a
-- database built from the migrations (visibleau_integration since 13 Nov; visibleau_e2e since its rebuild on
-- 14 Nov) rejects it: classifyAndStoreBrand's update fails with brands_classification_status_check.
--
-- Now every database has the same CHECK, with all five values. Idempotent: drops whatever CHECK of that name
-- exists, then adds the five-value one. Production: prod-fix 0147 run1 -> run3 (any time; no code depends on
-- it), run4 only to undo.
ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_classification_status_check;
ALTER TABLE brands
  ADD CONSTRAINT brands_classification_status_check
  CHECK (classification_status IN ('pending', 'processing', 'complete', 'failed', 'needs_confirmation'));
