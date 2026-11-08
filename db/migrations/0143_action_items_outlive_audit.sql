-- Migration 0143 (Vunnara, 9 Nov; mock-gate and retention follow-ups, part 3): an action item someone is working
-- on, or has done, outlives the audit that suggested it.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0143 run1 -> run3; run4 only to undo).
--
-- The weekly retention job (inngest/functions/audit-data-retention.ts) deletes audits 12 months old with their
-- children (lib/retention/audit-retention.ts). action_items.audit_id was NOT NULL with no ON DELETE rule, so the
-- first audit to reach 12 months (about June 2027) would have failed the whole run. The job now deletes an old
-- audit's open and dismissed items (suggestions nobody acted on, already replaced by newer audits), and keeps
-- in_progress and done items -- someone's own work, shown in the Action Center across audits -- with audit_id
-- set to NULL. That needs the column nullable; ON DELETE SET NULL makes any other audit delete do the same.
--
-- The unique index (audit_id, recommendation_key) is unchanged: NULLs are distinct in it, so kept items never
-- collide. Nothing else changes, and no row changes when this runs.
--
-- Idempotent.

ALTER TABLE action_items ALTER COLUMN audit_id DROP NOT NULL;

ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_audit_id_audits_id_fk;
ALTER TABLE action_items
  ADD CONSTRAINT action_items_audit_id_audits_id_fk
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE SET NULL;
