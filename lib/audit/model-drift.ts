import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { findModelDrift, type ModelDrift } from "@/lib/llm/model-drift";
import { type AuditModelSet, modelSetOf } from "@/lib/llm/model-set";

/**
 * Sri's decision 6 (7 Nov) -- one audit's answers, run 1 (the audit's own answers, branded questions
 * included): which engines' providers answered with a different model than the one asked for
 * (lib/llm/model-drift.ts). Read by the audit page, the PDF report's data and the alert
 * (lib/audit/model-drift-alert.ts).
 */
export async function auditModelDrift(db: DbClient, auditId: string): Promise<ModelDrift[]> {
  const rows = await db
    .select({
      engine: citations.engine,
      llmModel: citations.llmModel,
      llmModelAnswered: citations.llmModelAnswered,
    })
    .from(citations)
    .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)));
  return findModelDrift(rows);
}

/** An audit's models (engine -> the models the app asked for) and any model drift, from its answers. */
export interface AuditModelsOf {
  models: AuditModelSet;
  drift: ModelDrift[];
}

/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 3 -- what decides whether two audits are compared, besides
 * their methodology: each audit's model set (lib/llm/model-set.ts) and model drift, from its run-1 answers, in
 * one query for any number of audits. Every id asked for has an entry; one with no answers has an empty set.
 * Read by the drift baseline (lib/drift/baseline.ts), the weekly trend, the wins feed, the PDF trend and the
 * brand page's sparkline.
 */
export async function auditModels(
  db: DbClient,
  auditIds: readonly string[],
): Promise<Map<string, AuditModelsOf>> {
  const ids = [...new Set(auditIds)];
  const result = new Map<string, AuditModelsOf>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      auditId: citations.auditId,
      engine: citations.engine,
      llmModel: citations.llmModel,
      llmModelAnswered: citations.llmModelAnswered,
    })
    .from(citations)
    .where(and(inArray(citations.auditId, ids), eq(citations.runNumber, 1)));
  const byAudit = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byAudit.get(row.auditId) ?? [];
    list.push(row);
    byAudit.set(row.auditId, list);
  }
  for (const id of ids) {
    const answers = byAudit.get(id) ?? [];
    result.set(id, { models: modelSetOf(answers), drift: findModelDrift(answers) });
  }
  return result;
}
