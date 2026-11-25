import { and, asc, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { db as DbForType } from "@/db/client";
import {
  actionItems,
  auditExports,
  audits,
  brandEntityScores,
  brands,
  citations,
  driftAlerts,
  engineCallFailures,
  technicalAudits,
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
 * - Deleted on the same cutoff, after the audits (S01B part 2): technical_audits rows with no audit -- an Enhanced
 *   report's refresh re-runs the brand's technical audit without one (LLD amendment 49) -- which nothing cascades to.
 * - Deleted on the same cutoff, by the date of each check (S01B part 5, LLD amendment 54, Sri, 25 Nov 2026): what
 *   the Australian Business Register returned. brand_entity_scores rows checked before the cutoff (the ABN, entity
 *   name and status with that check's Wikipedia and .au facts; lib/trust/entity-checker.ts updates the latest row's
 *   local_reg_* without changing checked_at, so a row's age is its oldest fact's), and brands.abn_suggestion once the
 *   search it holds is older (its checkedAt, or its suggestion's): set to NULL. brands.abn, the business's own entry,
 *   stays. A suggestion answered "Not mine" goes too, so brand settings can offer it again once its search is 12
 *   months old. Deleting a brand clears its suggestion at once (app/api/brands/[brandId]/route.ts).
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
  /**
   * S01B part 2 (LLD amendment 49): technical audits that belong to no audit -- an Enhanced report's refresh runs the
   * technical audit with no audit id -- past the same cutoff. Audit-linked ones go with their audit (ON DELETE CASCADE).
   */
  deletedUnlinkedTechnicalAudits: number;
  /** S01B part 5 (LLD amendment 54): brand_entity_scores rows (the ABR's answers) checked before the cutoff. */
  deletedEntityScores: number;
  /** S01B part 5 (LLD amendment 54): brands whose ABN suggestion (an ABR search) ran before the cutoff. */
  clearedAbnSuggestions: number;
  /** True when the batch cap stopped the run with any of the above still past the cutoff. */
  more: boolean;
}

/**
 * S01C part 5b (LLD amendment 65): what an ABN suggestion answered "Not mine" becomes once its search is older than
 * the retention period -- no date and no ABR data, only that the owner said no. Brand settings offers nothing while
 * it's there; changing the brand's name clears it (app/api/brands/[brandId]/route.ts).
 */
export const ABN_SUGGESTION_DISMISSED = { status: "dismissed" } as const;

/**
 * When an ABN suggestion's search ran, as stored (lib/brand-entity/abn-lookup.ts writes it with toISOString):
 * `checkedAt` for "none" and "failed", the suggestion's own `checkedAt` for "found".
 */
const suggestionCheckedAt = sql<
  string | null
>`coalesce(${brands.abnSuggestion}->>'checkedAt', ${brands.abnSuggestion}->'suggestion'->>'checkedAt')`;

/**
 * A suggestion whose search ran before `cutoff`. Compared as ISO 8601 UTC text (which sorts by time) in the C
 * collation, after a shape check, so a malformed value is kept rather than failing the weekly run with a cast error.
 */
function suggestionOlderThan(cutoff: Date) {
  return and(
    isNotNull(brands.abnSuggestion),
    sql`${suggestionCheckedAt} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'`,
    sql`${suggestionCheckedAt} COLLATE "C" < ${cutoff.toISOString()}`,
  );
}

/** Runs `batch` (one transaction of at most batchSize rows) until it handles fewer, or maxBatches have run. */
async function inBatches(
  maxBatches: number,
  batchSize: number,
  batch: () => Promise<number>,
): Promise<{ count: number; done: boolean }> {
  let count = 0;
  for (let i = 0; i < maxBatches; i++) {
    const handled = await batch();
    count += handled;
    if (handled < batchSize) return { count, done: true };
  }
  return { count, done: false };
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
    deletedUnlinkedTechnicalAudits: 0,
    deletedEntityScores: 0,
    clearedAbnSuggestions: 0,
    more: false,
  };

  let auditsDone = false;
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
    if (done) {
      auditsDone = true;
      break;
    }
  }

  // S01B part 2: a technical audit with no audit (an Enhanced report's refresh, LLD amendment 49) has no audit row to
  // cascade from, so it is deleted here on the same cutoff, in the same bounded, idempotent batches.
  const unlinked = and(isNull(technicalAudits.auditId), lt(technicalAudits.createdAt, cutoff));
  const unlinkedRun = await inBatches(maxBatches, batchSize, () =>
    db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: technicalAudits.id })
        .from(technicalAudits)
        .where(unlinked)
        .orderBy(asc(technicalAudits.createdAt))
        .limit(batchSize);
      if (expired.length === 0) return 0;
      const gone = await tx
        .delete(technicalAudits)
        .where(
          inArray(
            technicalAudits.id,
            expired.map((t) => t.id),
          ),
        )
        .returning({ id: technicalAudits.id });
      return gone.length;
    }),
  );
  totals.deletedUnlinkedTechnicalAudits = unlinkedRun.count;

  // S01B part 5 (LLD amendment 54): the ABR's answers, by the date of each check, in the same bounded batches.
  const oldEntityScore = lt(brandEntityScores.checkedAt, cutoff);
  const entityRun = await inBatches(maxBatches, batchSize, () =>
    db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: brandEntityScores.id })
        .from(brandEntityScores)
        .where(oldEntityScore)
        .orderBy(asc(brandEntityScores.checkedAt))
        .limit(batchSize);
      if (expired.length === 0) return 0;
      const gone = await tx
        .delete(brandEntityScores)
        .where(
          inArray(
            brandEntityScores.id,
            expired.map((e) => e.id),
          ),
        )
        .returning({ id: brandEntityScores.id });
      return gone.length;
    }),
  );
  totals.deletedEntityScores = entityRun.count;

  const oldSuggestion = suggestionOlderThan(cutoff);
  const suggestionRun = await inBatches(maxBatches, batchSize, () =>
    db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: brands.id })
        .from(brands)
        .where(oldSuggestion)
        .orderBy(asc(brands.id))
        .limit(batchSize);
      if (expired.length === 0) return 0;
      // S01C part 5b (LLD amendment 65): a suggestion answered "Not mine" leaves a dateless marker with no ABR data
      // (no ABN, entity, status or place), so brand settings doesn't offer it again; any other goes entirely. The
      // marker has no date, so this never selects it again.
      const cleared = await tx
        .update(brands)
        .set({
          abnSuggestion: sql`CASE WHEN ${brands.abnSuggestion}->>'answer' = 'dismissed'
            THEN ${JSON.stringify(ABN_SUGGESTION_DISMISSED)}::jsonb ELSE NULL END`,
        })
        .where(
          inArray(
            brands.id,
            expired.map((b) => b.id),
          ),
        )
        .returning({ id: brands.id });
      return cleared.length;
    }),
  );
  totals.clearedAbnSuggestions = suggestionRun.count;

  if (auditsDone && unlinkedRun.done && entityRun.done && suggestionRun.done) return totals;

  const counted = { c: sql<number>`count(*)::int` };
  const anyLeft = (rows: { c: number }[]) => Number(rows[0]?.c ?? 0) > 0;
  totals.more =
    anyLeft(await db.select(counted).from(audits).where(lt(audits.createdAt, cutoff))) ||
    anyLeft(await db.select(counted).from(technicalAudits).where(unlinked)) ||
    anyLeft(await db.select(counted).from(brandEntityScores).where(oldEntityScore)) ||
    anyLeft(await db.select(counted).from(brands).where(oldSuggestion));
  return totals;
}
