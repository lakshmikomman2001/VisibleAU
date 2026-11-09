import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandEntityScores, citationSourceIntelligence } from "@/db/schema";
import { measured, NOT_MEASURED } from "@/lib/scoring/measured";

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
  /** The parts the score came from, and the parts not measured yet (9 Nov: never counted as 0). */
  measuredParts: string[];
  notMeasuredParts: string[];
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
      measuredParts: [],
      notMeasuredParts: [],
    };
  }

  const tableCheck = await tx.execute(sql`SELECT to_regclass('local_seo_results') AS exists`);
  const tableExists = (tableCheck as unknown as { exists: string | null }[])[0]?.exists !== null;

  const NULL_RESULT: LocalAiTrustResult = {
    localAiTrustScore: null,
    breakdown: { gmb: null, directory: null, abn: null, nap: null, citation: null },
    reason: "Local trust scoring activates once local directory data is available.",
    measuredParts: [],
    notMeasuredParts: Object.values(LOCAL_TRUST_PARTS).map((p) => p.label),
  };

  if (!tableExists) {
    return NULL_RESULT;
  }

  const localSeoRow = await tx.execute(
    sql`SELECT gmb_completeness, nap_consistency FROM local_seo_results
        WHERE brand_id = ${brandId} ORDER BY checked_at DESC LIMIT 1`,
  );
  const lsr = (
    localSeoRow as unknown as { gmb_completeness: string | null; nap_consistency: string | null }[]
  )[0];

  if (!lsr) {
    return NULL_RESULT;
  }

  const entityRows = await tx
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .orderBy(desc(brandEntityScores.checkedAt))
    .limit(1);
  const entity = entityRows[0];

  // Task #41: excludes the new rolling aggregate row (auditId: null,
  // csi_unique_aggregate) buildCitationSourceIntelligence now also
  // writes -- this score counts per-audit au_directory rows, and without
  // this filter the aggregate row would double up alongside whichever
  // per-audit row it was built from.
  const csiRows = await tx
    .select()
    .from(citationSourceIntelligence)
    .where(
      and(
        eq(citationSourceIntelligence.brandId, brandId),
        eq(citationSourceIntelligence.sourceType, "au_directory"),
        isNotNull(citationSourceIntelligence.auditId),
      ),
    );
  const totalAuDir = csiRows.length;
  const presentAuDir = csiRows.filter((r) => r.brandPresentInSource === true).length;

  // Regression follow-ups (9 Nov), part 6: a part nobody measured is not measured -- never a 0 (it was: no GMB or
  // NAP figure, no entity check and no AU-directory citations each counted as 0, so the score fell). Each part
  // is 0-100 when measured (lib/scoring/measured.ts); the score is over the measured parts' weights alone, and
  // says which they were.
  const parts: Record<LocalTrustPart, ReturnType<typeof measured>> = {
    gmb: measured(lsr.gmb_completeness),
    directory: entity
      ? { measured: true, value: Math.min(((entity.localDirectoryCount ?? 0) / 4) * 100, 100) }
      : { measured: false },
    abn: entity
      ? { measured: true, value: entity.abnVerified === true ? 100 : 0 }
      : { measured: false },
    nap: measured(lsr.nap_consistency),
    citation:
      totalAuDir > 0
        ? { measured: true, value: (presentAuDir / totalAuDir) * 100 }
        : { measured: false },
  };
  return localTrustFromParts(parts);
}

type LocalTrustPart = keyof LocalAiTrustResult["breakdown"];

/** Each part's weight in the full score, and how a reason names it. */
const LOCAL_TRUST_PARTS: Record<LocalTrustPart, { weight: number; label: string }> = {
  gmb: { weight: 0.25, label: "GMB completeness" },
  directory: { weight: 0.25, label: "directory presence" },
  abn: { weight: 0.15, label: "ABN verification" },
  nap: { weight: 0.2, label: "NAP consistency" },
  citation: { weight: 0.15, label: "AU directory citations" },
};

/**
 * The score from the parts that were measured: each measured part's weighted value, over the measured parts'
 * weights. `notMeasured` names the rest; none measured is no score at all.
 */
export function localTrustFromParts(
  parts: Record<LocalTrustPart, ReturnType<typeof measured>>,
): LocalAiTrustResult {
  const keys = Object.keys(LOCAL_TRUST_PARTS) as LocalTrustPart[];
  const breakdown = Object.fromEntries(
    keys.map((k) => {
      const p = parts[k];
      return [k, p.measured ? p.value * LOCAL_TRUST_PARTS[k].weight : null];
    }),
  ) as LocalAiTrustResult["breakdown"];
  const measuredKeys = keys.filter((k) => parts[k].measured);
  const measuredParts = measuredKeys.map((k) => LOCAL_TRUST_PARTS[k].label);
  const notMeasuredParts = keys
    .filter((k) => !parts[k].measured)
    .map((k) => LOCAL_TRUST_PARTS[k].label);
  if (measuredKeys.length === 0) {
    return {
      localAiTrustScore: null,
      breakdown,
      reason: `Local AI Trust Score: ${NOT_MEASURED} -- none of its parts has been checked.`,
      measuredParts,
      notMeasuredParts,
    };
  }
  const weight = measuredKeys.reduce((sum, k) => sum + LOCAL_TRUST_PARTS[k].weight, 0);
  const total = Math.round(measuredKeys.reduce((sum, k) => sum + (breakdown[k] ?? 0), 0) / weight);
  return {
    localAiTrustScore: total,
    breakdown,
    reason:
      notMeasuredParts.length === 0
        ? `Local AI Trust Score: ${total}/100 -- from ${measuredParts.join(", ")}.`
        : `Local AI Trust Score: ${total}/100 from ${measuredParts.join(", ")} only; ${NOT_MEASURED.toLowerCase()}: ${notMeasuredParts.join(", ")}.`,
    measuredParts,
    notMeasuredParts,
  };
}
