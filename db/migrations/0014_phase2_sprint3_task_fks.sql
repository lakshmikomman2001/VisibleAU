-- Phase 2 Sprint 3: Close forward-reference FKs on remediation_tasks (BD-01, LLD 7591/7600)
-- Sprint 2 created fan_out_gap_id / topical_gap_id as plain UUIDs;
-- now that query_fan_out_results and topical_coverage_gaps exist, add the FK constraints.
-- MI-01 guard: pg_constraint check (Postgres has no ADD CONSTRAINT IF NOT EXISTS).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_fan_out_gap'
  ) THEN
    ALTER TABLE remediation_tasks
      ADD CONSTRAINT fk_fan_out_gap FOREIGN KEY (fan_out_gap_id)
        REFERENCES query_fan_out_results(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_topical_gap'
  ) THEN
    ALTER TABLE remediation_tasks
      ADD CONSTRAINT fk_topical_gap FOREIGN KEY (topical_gap_id)
        REFERENCES topical_coverage_gaps(id) ON DELETE SET NULL;
  END IF;
END $$;
