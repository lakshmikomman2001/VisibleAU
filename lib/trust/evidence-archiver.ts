import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations, evidenceSnapshots } from "@/db/schema";

export interface ArchiveResult {
  snapshotCount: number;
}

/**
 * Task #40: this used to copy EVERY citations row for the audit --
 * including all ~4 cache-replay rows per (engine, prompt) pair (task
 * SSS/#24: the LLM cache key is sha256(prompt + model) with no run
 * index, so runs 2-N of a given pair replay run 1's byte-identical
 * response, confirmed by content comparison in production) -- into
 * evidence_snapshots, which has no run_number column of its own. The
 * replay information was lost at insert, permanently 5x-inflating a
 * screen whose whole purpose is to substantiate trust. run_number = 1
 * is the one real/first call per (engine, prompt); citations.run_number
 * is present and populated on every row (db/schema/citations.ts,
 * lib/audit/run-audit-inline.ts's runOneCall). Filtering to it here
 * means future audits store exactly one snapshot per (engine, prompt),
 * not five. See docs/ops/post-launch-db-hardening.md section 40.
 */
export async function captureEvidenceSnapshots(
  tx: DbClient,
  auditId: string,
  brandId: string,
  organizationId: string,
): Promise<ArchiveResult> {
  const auditCitations = await tx
    .select()
    .from(citations)
    .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)));

  let snapshotCount = 0;

  for (const cit of auditCitations) {
    await tx.insert(evidenceSnapshots).values({
      brandId,
      organizationId,
      auditId,
      engine: cit.engine,
      prompt: cit.prompt,
      rawResponse: cit.responseSnippet ?? "",
      scoreAtCapture: cit.sentimentScore,
    });
    snapshotCount++;
  }

  return { snapshotCount };
}
