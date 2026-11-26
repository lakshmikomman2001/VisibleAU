-- 0155-s02-run4-rollback.sql (26 Nov 2026, sprint S02 part 2): undoes run2's backfill. ONLY if run3 failed, or Sri
-- decides to go back.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Needs a role that bypasses RLS (as run2).
--
-- Deletes exactly what run2 inserted: the sets noted '0155 backfill: the stored question pack', their items, and the
-- library questions those items hold that no other set uses. If the S02 code was already pushed, audits, answers and
-- failures may point at them: those links are cleared first (they're NULL on every row from before S02), and with no
-- set a brand's audits go back to today's question logic (lib/audit/get-audit-prompts.ts falls back), so the app keeps
-- working. The tables and columns stay; section B drops them too, only if the push is reverted as well.

BEGIN;

CREATE TEMP TABLE s02_rollback_sets ON COMMIT DROP AS
SELECT id FROM brand_question_sets WHERE version = 1 AND note = '0155 backfill: the stored question pack';

CREATE TEMP TABLE s02_rollback_questions ON COMMIT DROP AS
SELECT DISTINCT i.question_id AS id
FROM brand_question_set_items i
WHERE i.set_id IN (SELECT id FROM s02_rollback_sets)
  AND NOT EXISTS (
    SELECT 1 FROM brand_question_set_items o
    WHERE o.question_id = i.question_id AND o.set_id NOT IN (SELECT id FROM s02_rollback_sets)
  );

-- What will go. Expected: the counts run3's check 3 showed (sets, questions), plus any links made since the push.
SELECT
  (SELECT count(*) FROM s02_rollback_sets) AS sets,
  (SELECT count(*) FROM s02_rollback_questions) AS questions,
  (SELECT count(*) FROM audits WHERE question_set_id IN (SELECT id FROM s02_rollback_sets)) AS audits_linked,
  (SELECT count(*) FROM citations WHERE question_id IN (SELECT id FROM s02_rollback_questions)) AS citations_linked,
  (SELECT count(*) FROM engine_call_failures WHERE question_id IN (SELECT id FROM s02_rollback_questions)) AS failures_linked;

UPDATE audits SET question_set_id = NULL WHERE question_set_id IN (SELECT id FROM s02_rollback_sets);
UPDATE citations SET question_id = NULL WHERE question_id IN (SELECT id FROM s02_rollback_questions);
UPDATE engine_call_failures SET question_id = NULL WHERE question_id IN (SELECT id FROM s02_rollback_questions);
DELETE FROM brand_question_set_items WHERE set_id IN (SELECT id FROM s02_rollback_sets);
DELETE FROM brand_question_sets WHERE id IN (SELECT id FROM s02_rollback_sets);
DELETE FROM brand_questions WHERE id IN (SELECT id FROM s02_rollback_questions);

-- Expected: 0, 0 (no backfill set or question left).
SELECT
  (SELECT count(*) FROM brand_question_sets WHERE note = '0155 backfill: the stored question pack') AS backfill_sets_left,
  (SELECT count(*) FROM brand_questions q WHERE q.id IN (SELECT id FROM s02_rollback_questions)) AS backfill_questions_left;

COMMIT;

-- B. ONLY if the S02 push is reverted too (the pushed code reads these): drop the schema. Uncomment and run.
-- BEGIN;
-- ALTER TABLE "engine_call_failures" DROP COLUMN IF EXISTS "question_id";
-- ALTER TABLE "citations" DROP COLUMN IF EXISTS "question_id";
-- ALTER TABLE "audits" DROP COLUMN IF EXISTS "question_set_id";
-- DROP TABLE IF EXISTS "brand_question_set_items";
-- DROP TABLE IF EXISTS "brand_question_sets";
-- DROP TABLE IF EXISTS "brand_questions";
-- COMMIT;
