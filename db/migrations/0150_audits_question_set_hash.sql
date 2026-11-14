-- Migration 0150 (15 Nov 2026, part 2; Sri's review of audit #50): each audit stores which everyday questions it asked.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0150 run1 -> run3; run4 only to undo). Drizzle selects every
-- column of its schema, so the pushed code's reads of audits ask for question_set_hash; without the column every
-- audit read fails.
--
-- Hero Home Services' PDF joined #48 (25%, 11 everyday questions, generator v3, including the off-topic question
-- 0bd1221 removed) and #50 (33%, 10 everyday questions, generator v4) with one line, a rise that is really a
-- change of questions. audits.prompt_pack_version didn't catch it: it is stamped from the brand when the audit
-- row is created, and lib/audit/get-audit-prompts.ts regenerates a pack behind PROMPT_GENERATOR_VERSION only
-- later, when the audit runs, so #50 ran the v4 questions under #48's pack version.
--
-- question_set_hash is the SHA-256 (hex) of the audit's distinct everyday questions, sorted bytewise (COLLATE "C")
-- and joined with a newline: the prompts of its everyday answers (citations.is_branded_prompt IS NOT TRUE, as
-- lib/audit/organic-filter.ts counts them) and of its failed everyday calls (engine_call_failures). Two audits
-- with different hashes asked different everyday questions and are never compared (lib/audit/question-set.ts).
-- Both audit runners write it when they mark the audit complete, with the same expression as below.
--
-- Backfill: every complete audit, from its stored rows -- the same expression, so a backfilled hash and a newly
-- written one agree. An audit with no stored everyday row keeps NULL; comparisons then fall back to
-- prompt_pack_version, as before. Needs a role that bypasses RLS (citations and engine_call_failures force it);
-- run1 checks.
--
-- Nullable, no default: metadata-only on Postgres. RLS is unchanged; the app role already has SELECT/UPDATE on
-- audits (prod-fix 0052), and the column inherits it.
ALTER TABLE audits ADD COLUMN IF NOT EXISTS question_set_hash text;

UPDATE audits a
SET question_set_hash = (
  SELECT encode(sha256(convert_to(string_agg(q.prompt, E'\n' ORDER BY q.prompt COLLATE "C"), 'UTF8')), 'hex')
  FROM (
    SELECT c.prompt FROM citations c WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE
    UNION
    SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = a.id AND NOT f.is_branded_prompt
  ) q
)
WHERE a.status = 'complete' AND a.question_set_hash IS NULL;
