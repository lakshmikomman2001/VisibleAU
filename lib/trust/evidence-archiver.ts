import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations, evidenceSnapshots } from "@/db/schema";
import { RESPONSE_SNIPPET_CHARS } from "@/lib/audit/response-snippet";

/**
 * DEMO-BLOCKER (1 Nov), part 5 point 8 -- what the evidence archive really
 * keeps, as the report PDF's method page states it. It used to say
 * "immutable evidence snapshots ... for compliance and audit purposes";
 * nothing makes them immutable (the table has UPDATE and DELETE policies,
 * no trigger or hash, and prod-fix 0040 deleted rows -- diag-0111). True
 * because captureEvidenceSnapshots below copies every run-1 answer's
 * engine, question and response_snippet (its first RESPONSE_SNIPPET_CHARS
 * characters) with a capture time.
 */
export const EVIDENCE_ARCHIVE_SENTENCE = `For each audit we keep the first ${RESPONSE_SNIPPET_CHARS} characters of every first-run answer, with its engine, question and capture time.`;

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
