import { and, count, eq, isNull, or } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, citations } from "@/db/schema";

/**
 * Trust Intelligence honesty pass: the number of AI-engine citations ever
 * recorded for this brand, across all audits -- a raw row count that
 * includes every cache-replay row and every call regardless of brand
 * mention (it was built as an audit-progress-bar denominator, not a
 * coverage figure). Zero still reliably means there is no AI coverage at
 * all, which is why the overall-score and hallucination-risk gates below
 * keep using it for their citationCount === 0 check. But for a nonzero
 * count shown TO THE USER as "how much coverage exists", prefer
 * getBrandDistinctCitationCount instead -- see docs/ops/post-launch-db-hardening.md
 * sections 34 and 38.
 */
export async function getBrandCitationCount(tx: DbClient, brandId: string): Promise<number> {
  const [row] = await tx
    .select({ citationCount: count() })
    .from(citations)
    .innerJoin(audits, eq(citations.auditId, audits.id))
    .where(eq(audits.brandId, brandId));
  return Number(row?.citationCount ?? 0);
}

/**
 * Task #38: the persisted, aggregate-query equivalent of
 * lib/audit/organic-citations.ts's selectOrganicCitations()
 * distinctSampleCount -- the same "run_number === 1 AND not a branded
 * prompt" definition already used as the confidence-interval sample size
 * (#23), applied across every audit instead of just one. Unlike
 * getBrandCitationCount, this does not count replay rows (runs 2-5 of
 * each prompt are byte-identical cache replays, not independent
 * responses) or branded-prompt calls (guaranteed trivial mentions). Use
 * this wherever a surface shows "how much AI coverage exists" as a
 * number to the user -- getBrandCitationCount's raw total overstates
 * coverage by ~5x and was never meant to be read as a response count
 * (it was built as an audit-progress-bar denominator, see
 * docs/ops/post-launch-db-hardening.md section 38).
 */
export async function getBrandDistinctCitationCount(
  tx: DbClient,
  brandId: string,
): Promise<number> {
  const [row] = await tx
    .select({ citationCount: count() })
    .from(citations)
    .innerJoin(audits, eq(citations.auditId, audits.id))
    .where(
      and(
        eq(audits.brandId, brandId),
        eq(citations.runNumber, 1),
        or(isNull(citations.isBrandedPrompt), eq(citations.isBrandedPrompt, false)),
      ),
    );
  return Number(row?.citationCount ?? 0);
}
