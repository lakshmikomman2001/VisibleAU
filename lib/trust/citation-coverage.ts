import { count, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, citations } from "@/db/schema";

/**
 * Trust Intelligence honesty pass: the number of AI-engine citations ever
 * recorded for this brand, across all audits. Zero means there is no AI
 * coverage to assess at all -- "0 hallucination incidents" or "0 evidence
 * snapshots" is then indistinguishable from "0 of 0 checked" and must not
 * be presented as a measured clean/consistent result. Every Trust
 * Intelligence tile that derives from `citations` (hallucinations,
 * evidence, citation sources, the headline hallucination risk) uses this
 * single source so "how much AI coverage exists" can't drift between
 * them. See docs/ops/post-launch-db-hardening.md section 34.
 */
export async function getBrandCitationCount(tx: DbClient, brandId: string): Promise<number> {
  const [row] = await tx
    .select({ citationCount: count() })
    .from(citations)
    .innerJoin(audits, eq(citations.auditId, audits.id))
    .where(eq(audits.brandId, brandId));
  return Number(row?.citationCount ?? 0);
}
