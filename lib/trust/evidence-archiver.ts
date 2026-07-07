import type { DbClient } from "@/db/client";
import { citations, evidenceSnapshots } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface ArchiveResult {
  snapshotCount: number;
}

export async function captureEvidenceSnapshots(
  tx: DbClient,
  auditId: string,
  brandId: string,
  organizationId: string,
): Promise<ArchiveResult> {
  const auditCitations = await tx
    .select()
    .from(citations)
    .where(eq(citations.auditId, auditId));

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
