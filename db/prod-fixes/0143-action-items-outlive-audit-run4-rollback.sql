-- 0143-action-items-outlive-audit-run4-rollback.sql (mock-gate and retention follow-ups, part 3): undoes run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: schema only. Sri-authorized only; NOT run
-- from Claude Code.
--
-- Only with the code from before this push deployed (never pushed, or reverted), and only while no item has lost
-- its audit: NOT NULL can't come back over a NULL. The guard below stops with an error if any has.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM action_items WHERE audit_id IS NULL) THEN
    RAISE EXCEPTION 'action_items has rows with no audit (kept after their audit was deleted): not rolling back';
  END IF;
END $$;

ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_audit_id_audits_id_fk;
ALTER TABLE action_items
  ADD CONSTRAINT action_items_audit_id_audits_id_fk FOREIGN KEY (audit_id) REFERENCES audits(id);

ALTER TABLE action_items ALTER COLUMN audit_id SET NOT NULL;

COMMIT;
