import { runAuditInline } from "./run-audit-inline";
import { runTechnicalAuditInline } from "./run-technical-audit-inline";

/**
 * Leftovers task, part 2 (17 Nov): an audit that isn't started by hand -- a schedule (inngest/functions/audit-
 * schedules-cron.ts), an agency's bulk re-audit, a workflow run, a task's validation re-audit -- runs what an audit
 * started in the app runs (app/api/audits/route.ts): the audit itself, which ends with audit.complete and so every
 * follow-up (lib/audit/run-audit-inline.ts), and the technical audit of the site beside it (robots.txt, llms.txt,
 * schema, meta tags, the entity checks; it sends technical-audit/complete, which refreshes agent readiness, the
 * entity score and the entity home). The technical audit never throws; a failure there is logged and leaves the
 * audit alone.
 */
export async function runBackgroundAudit(auditId: string, brandId: string): Promise<void> {
  await Promise.all([runAuditInline(auditId), runTechnicalAuditInline(auditId, brandId)]);
}
