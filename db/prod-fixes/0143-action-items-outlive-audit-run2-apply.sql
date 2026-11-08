-- 0143-action-items-outlive-audit-run2-apply.sql (mock-gate and retention follow-ups, part 3): action_items.audit_id
-- becomes nullable, with ON DELETE SET NULL. Mirrors db/migrations/0143_action_items_outlive_audit.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: schema only -- drops NOT NULL on one
-- column and re-creates its foreign key with ON DELETE SET NULL. No row changes. Run after run1, BEFORE the push.
-- Sri-authorized only; NOT run from Claude Code. Undone by run4.
--
-- Zero downtime: the code deployed now always writes an audit_id and never deletes audits with items (the job
-- deletes nothing before about June 2027), so a nullable column changes nothing it does. Idempotent.
BEGIN;

ALTER TABLE action_items ALTER COLUMN audit_id DROP NOT NULL;

ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_audit_id_audits_id_fk;
ALTER TABLE action_items
  ADD CONSTRAINT action_items_audit_id_audits_id_fk
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE SET NULL;

COMMIT;
