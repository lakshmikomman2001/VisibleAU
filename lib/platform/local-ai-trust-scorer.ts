import { and, eq, sql, desc } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandEntityScores, citationSourceIntelligence } from "@/db/schema";

export interface LocalAiTrustResult {
  localAiTrustScore: number | null;
  breakdown: {
    gmb: number | null;
    directory: number | null;
    abn: number | null;
    nap: number | null;
    citation: number | null;
  };
  reason: string;
}

export async function computeLocalAiTrustScore(
  tx: DbClient,
  brandId: string,
  vertical: string,
): Promise<LocalAiTrustResult> {
  if (vertical === "saas") {
    return {
      localAiTrustScore: null,
      breakdown: { gmb: null, directory: null, abn: null, nap: null, citation: null },
      reason: "Local AI Trust Score is not applicable for SaaS brands.",
    };
  }

  const tableCheck = await tx.execute(
    sql`SELECT to_regclass('local_seo_results') AS exists`,
  );
  const tableExists = (tableCheck as unknown as { exists: string | null }[])[0]?.exists !== null;

  if (!tableExists) {
    return {
      localAiTrustScore: null,
      breakdown: { gmb: null, directory: null, abn: null, nap: null, citation: null },
      reason: "Coming soon — full local trust scoring activates with local SEO data (Sprint 8).",
    };
  }

  const localSeoRow = await tx.execute(
    sql`SELECT gmb_completeness, nap_consistency FROM local_seo_results
        WHERE brand_id = ${brandId} ORDER BY checked_at DESC LIMIT 1`,
  );
  const lsr = (localSeoRow as unknown as { gmb_completeness: string | null; nap_consistency: string | null }[])[0];

  const entityRows = await tx
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .orderBy(desc(brandEntityScores.checkedAt))
    .limit(1);
  const entity = entityRows[0];

  const csiRows = await tx
    .select()
    .from(citationSourceIntelligence)
    .where(
      and(
        eq(citationSourceIntelligence.brandId, brandId),
        eq(citationSourceIntelligence.sourceType, "au_directory"),
      ),
    );
  const totalAuDir = csiRows.length;
  const presentAuDir = csiRows.filter((r) => r.brandPresentInSource === true).length;

  const gmbScore = lsr?.gmb_completeness ? Number(lsr.gmb_completeness) : 0;
  const directoryCount = entity?.localDirectoryCount ?? 0;
  const abnVerified = entity?.abnVerified === true;
  const napScore = lsr?.nap_consistency ? Number(lsr.nap_consistency) : 0;
  const citationScore = totalAuDir > 0 ? (presentAuDir / totalAuDir) * 100 : 0;

  const gmb = gmbScore * 0.25;
  const directory = Math.min((directoryCount / 4) * 100, 100) * 0.25;
  const abn = (abnVerified ? 100 : 0) * 0.15;
  const nap = napScore * 0.20;
  const citation = citationScore * 0.15;

  const total = Math.round(gmb + directory + abn + nap + citation);

  return {
    localAiTrustScore: total,
    breakdown: { gmb, directory, abn, nap, citation },
    reason: `Local AI Trust Score: ${total}/100 — aggregates GMB completeness, directory presence, ABN verification, NAP consistency, and AU directory citations.`,
  };
}
