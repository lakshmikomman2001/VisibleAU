import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations, evidenceSnapshots } from "@/db/schema";

/**
 * The sentence now lives in lib/trust/evidence-archive-copy.ts (17 Nov, part 3), so the Evidence Archive page
 * (a client component) can show it without this file's database imports. Re-exported here for the report PDF
 * and the tests that already import it from this module.
 */
export { EVIDENCE_ARCHIVE_SENTENCE, evidenceAnswerKey } from "./evidence-archive-copy";

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
 *
 * 17 Nov, part 3: score_at_capture is no longer copied. It came from
 * citations.sentiment_score, which no code writes (sentiment isn't
 * measured), and the page showed it as "Sentiment: +N%". The column stays
 * (no migration); new rows leave it null. Answers to questions that named
 * the business are kept too (the archive is every first-run answer, as
 * EVIDENCE_ARCHIVE_SENTENCE says); the Evidence Archive marks them by
 * matching each snapshot back to its citations row (evidenceAnswerKey).
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
    });
    snapshotCount++;
  }

  return { snapshotCount };
}
