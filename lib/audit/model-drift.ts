import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { findModelDrift, type ModelDrift } from "@/lib/llm/model-drift";

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
