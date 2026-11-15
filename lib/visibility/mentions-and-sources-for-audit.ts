import { eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";
import { engineCoverageLabel } from "@/lib/audit/engine-failure";
import { isExcludedFromTrends, trendExclusionLabel } from "@/lib/audit/trend-exclusion";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { type MentionsAndSources, mentionsAndSources } from "@/lib/visibility/mentions-and-sources";
import { latestCompleteAudit } from "@/lib/visibility/share-of-voice";

/** 17 Nov, part 1: the server side of lib/visibility/mentions-and-sources.ts. */
/** The card for a brand's latest complete audit (latestCompleteAudit: the one the page's Share of Voice names). */
export async function mentionsAndSourcesForLatestAudit(
  tx: DbClient,
  brandId: string,
): Promise<MentionsAndSources> {
  const latest = await latestCompleteAudit(tx, brandId);
  if (!latest) return mentionsAndSources(null);
  const [audit] = await tx
    .select({
      engines: audits.engines,
      promptsCount: audits.promptsCount,
      metadata: audits.metadata,
      excludedFromTrendsReason: audits.excludedFromTrendsReason,
    })
    .from(audits)
    .where(eq(audits.id, latest.id));
  const resolved = (await resolveOrganicDimensions(tx, [latest.id])).get(latest.id);
  if (!audit || !resolved) return mentionsAndSources(null);
  return mentionsAndSources({
    auditNumber: latest.auditNumber,
    headline: resolved.headline,
    sampleCount: resolved.sampleCount,
    mentionedCount: resolved.mentionedCount,
    sourcedCount: resolved.sourcedCount,
    coverage: engineCoverageLabel(audit),
    excludedFromTrends: isExcludedFromTrends(audit)
      ? trendExclusionLabel(audit.excludedFromTrendsReason as string)
      : null,
  });
}
