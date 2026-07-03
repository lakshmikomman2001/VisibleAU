-- VisibleAU — Add WITH CHECK to content_drafts, remediation_tasks, workflow_runs, subscriptions
-- Idempotent: safe to re-run (DROP IF EXISTS → CREATE)
--
-- Fixes a write-path hole: these policies had USING (read isolation) but no
-- WITH CHECK (write isolation). Without WITH CHECK, a cross-org INSERT or
-- UPDATE-to-move-org could bypass tenant isolation on the write path.
--
-- subscriptions also had RLS entirely disabled — now enabled + FORCE.

BEGIN;

-- 1. content_drafts — add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "content_drafts_org_isolation" ON content_drafts;
CREATE POLICY "content_drafts_org_isolation" ON content_drafts
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 2. remediation_tasks — add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "remediation_tasks_org_isolation" ON remediation_tasks;
CREATE POLICY "remediation_tasks_org_isolation" ON remediation_tasks
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 3. workflow_runs — add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "workflow_runs_org_isolation" ON workflow_runs;
CREATE POLICY "workflow_runs_org_isolation" ON workflow_runs
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- 4. subscriptions — enable RLS + FORCE + create policy with both clauses
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_org_isolation" ON subscriptions;
CREATE POLICY "subscriptions_org_isolation" ON subscriptions
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

COMMIT;
