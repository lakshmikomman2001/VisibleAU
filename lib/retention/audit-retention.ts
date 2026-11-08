import { and, asc, inArray, lt, or, sql } from "drizzle-orm";
import type { db as DbForType } from "@/db/client";
import {
  actionItems,
  auditExports,
  audits,
  citations,
  driftAlerts,
  engineCallFailures,
} from "@/db/schema";

/**
 * Mock-gate and retention follow-ups (Sri, 2 Nov), part 3: delete audits past the retention period with their
 * children, so the weekly job can't fail from about June 2027, when the first audits turn 12 months old.
 *
 * What goes with an audit, and what stays (FKs from migrations, checked on local visibleau_e2e, 9 Nov):
 * - Deleted, child first, in this order. Each has audit_id NOT NULL with no ON DELETE rule, so the audit delete
 *   failed while any of them remained:
 *   - action_items that are open or dismissed: suggestions nobody acted on, already replaced by newer audits'
 *     (lib/recommendations/persist.ts dismisses an old audit's open items);
 *   - drift_alerts on either side of the audit (current_audit_id or previous_audit_id): an alert compares two
 *     audits and means nothing without both;
 *   - engine_call_failures: the audit's failed calls;
 *   - audit_exports: records of the audit's exports, with no stored file;
 *   - citations: the questions and answers. ON DELETE CASCADE would take them anyway; deleting them here
 *     counts them.
 * - Deleted by the audits row's own ON DELETE CASCADE: audit_cost_snapshots, citation_source_intelligence,
 *   comparison_prompt_results, google_ai_mode_results, query_fan_out_results, share_of_voice_snapshots and
 *   technical_audits.
 * - Kept, with the reference set to NULL:
 *   - action_items that are in_progress or done: someone's own work, shown in the Action Center across audits.
 *     Migration 0143 makes audit_id nullable with ON DELETE SET NULL; this sets it explicitly.
 *   - remediation_tasks (audit_id, reaudit_id; recommendation_id and fan_out_gap_id through their parents) and
 *     the content_drafts under them: the workflow board, someone's own work.
 *   - generated_reports: PDF reports, kept until the workspace asks for deletion (residency-config).
 *   - evidence_snapshots: the evidence archive, the first 500 characters of each first-run answer, kept until
 *     the workspace asks for deletion (residency-config, privacy page).
 *   - hallucination_incidents (citation_id).
 *
 * Batches are bounded (batchSize audits per transaction, maxBatches per run) and idempotent: each batch picks
 * the oldest audits still past the cutoff, so a rerun after a failure carries on where the last commit left off.
 * Any error rolls back its batch and is thrown: the run fails, never "Completed" while skipping.
 */

export const AUDIT_RETENTION_BATCH_SIZE = 100;
export const AUDIT_RETENTION_MAX_BATCHES = 50;

export interface ExpiredAuditDeletion {
  batches: number;
  deletedAudits: number;
  deletedCitations: number;
  deletedEngineCallFailures: number;
  deletedDriftAlerts: number;
  deletedAuditExports: number;
  deletedActionItems: number;
  keptActionItems: number;
  /** True when the batch cap stopped the run with audits still past the cutoff: the next run continues. */
  more: boolean;
}

/** `db` is the job's serviceDb: retention covers every workspace's audits, so it can't run under one org's RLS. */
export async function deleteExpiredAudits(
  db: typeof DbForType,
  cutoff: Date,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<ExpiredAuditDeletion> {
  const batchSize = options.batchSize ?? AUDIT_RETENTION_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? AUDIT_RETENTION_MAX_BATCHES;
  const totals: ExpiredAuditDeletion = {
    batches: 0,
    deletedAudits: 0,
    deletedCitations: 0,
    deletedEngineCallFailures: 0,
    deletedDriftAlerts: 0,
    deletedAuditExports: 0,
    deletedActionItems: 0,
    keptActionItems: 0,
    more: false,
  };

  for (let batch = 0; batch < maxBatches; batch++) {
    const done = await db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: audits.id })
        .from(audits)
        .where(lt(audits.createdAt, cutoff))
        .orderBy(asc(audits.createdAt))
        .limit(batchSize);
      if (expired.length === 0) return true;
      const ids = expired.map((a) => a.id);

      const kept = await tx
        .update(actionItems)
        .set({ auditId: null, updatedAt: sql`now()` })
        .where(
          and(
            inArray(actionItems.auditId, ids),
            inArray(actionItems.status, ["in_progress", "done"]),
          ),
        )
        .returning({ id: actionItems.id });
      const deletedItems = await tx
        .delete(actionItems)
        .where(inArray(actionItems.auditId, ids))
        .returning({ id: actionItems.id });
      const deletedAlerts = await tx
        .delete(driftAlerts)
        .where(
          or(inArray(driftAlerts.currentAuditId, ids), inArray(driftAlerts.previousAuditId, ids)),
        )
        .returning({ id: driftAlerts.id });
      const deletedFailures = await tx
        .delete(engineCallFailures)
        .where(inArray(engineCallFailures.auditId, ids))
        .returning({ id: engineCallFailures.id });
      const deletedExports = await tx
        .delete(auditExports)
        .where(inArray(auditExports.auditId, ids))
        .returning({ id: auditExports.id });
      const deletedCitations = await tx
        .delete(citations)
        .where(inArray(citations.auditId, ids))
        .returning({ id: citations.id });
      const deletedAudits = await tx
        .delete(audits)
        .where(inArray(audits.id, ids))
        .returning({ id: audits.id });

      totals.batches++;
      totals.keptActionItems += kept.length;
      totals.deletedActionItems += deletedItems.length;
      totals.deletedDriftAlerts += deletedAlerts.length;
      totals.deletedEngineCallFailures += deletedFailures.length;
      totals.deletedAuditExports += deletedExports.length;
      totals.deletedCitations += deletedCitations.length;
      totals.deletedAudits += deletedAudits.length;
      return expired.length < batchSize;
    });
    if (done) return totals;
  }

  const [left] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(audits)
    .where(lt(audits.createdAt, cutoff));
  totals.more = Number(left?.c ?? 0) > 0;
  return totals;
}
