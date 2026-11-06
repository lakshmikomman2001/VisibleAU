import type { DbClient } from "@/db/client";
import { countCompetitorMentions } from "@/lib/audit/competitor-mentions";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import type { DimensionResult } from "@/lib/scoring/dimension-result";
import { NO_AUDIT_YET, NOT_ENOUGH_ANSWERS } from "@/lib/scoring/visibility-display";
import { formatSharePercent, SOV_SMALL_SAMPLE_BELOW, type SovLine } from "./share-of-voice-display";

/**
 * Overview (7 Nov), item 3: Share of Voice on the same answer set as the Visibility headline -- each
 * brand's latest complete audit, everyday questions only, first run only -- and counted the way the
 * audit page's competitor card and the PDF's "Competitors (share of voice)" section count:
 *
 *   share = the brand's verified mentions / (those + every configured competitor's mentions)
 *
 * The brand's count is the headline's own k (lib/scoring/resolve-audit-dimensions.ts, verified only);
 * each competitor's is lib/audit/competitor-mentions.ts's, the same detector over the same answers.
 *
 * Before this the Overview read the share_of_voice_snapshots rows the audit.complete job writes: the
 * brand's answers including unverified name matches, against every OTHER SITE those answers cited
 * (directories included), for whichever brand Postgres returned first.
 */

export interface SovAudit {
  id: string;
  auditNumber: number;
  completedAt: Date | null;
  methodologyVersion: number | null;
}

export interface SovBrand {
  id: string;
  name: string;
  competitors: readonly string[];
  /** The brand's latest complete audit, or null when it has none. */
  latest: SovAudit | null;
}

export type SovState =
  | "no_audit"
  | "not_enough_answers"
  | "no_competitors"
  | "no_mentions"
  | "measured";

export interface BrandShareOfVoice {
  brandId: string;
  brandName: string;
  state: SovState;
  audit: SovAudit | null;
  /** Everyday answers that named the brand, verified: the Visibility headline's k. */
  brandMentions: number;
  /** brandMentions plus each configured competitor's mentions in the same answers. */
  totalMentions: number;
  /** brandMentions / totalMentions * 100, only when measured. */
  sharePct: number | null;
  smallSample: boolean;
}

/**
 * `resolved` is resolveOrganicDimensions' result for the brands' latest audits (the caller has it
 * already for the headline). One competitor-text query per brand that has competitors and a scored
 * latest audit; none for the rest.
 */
export async function shareOfVoiceForBrands(
  tx: DbClient,
  brands: readonly SovBrand[],
  resolved: ReadonlyMap<string, { headline: DimensionResult; mentionedCount: number }>,
): Promise<BrandShareOfVoice[]> {
  return Promise.all(
    brands.map(async (brand): Promise<BrandShareOfVoice> => {
      const base = {
        brandId: brand.id,
        brandName: brand.name,
        audit: brand.latest,
        brandMentions: 0,
        totalMentions: 0,
        sharePct: null,
        smallSample: false,
      };
      if (!brand.latest) return { ...base, state: "no_audit" };
      const result = resolved.get(brand.latest.id);
      if (result?.headline.status !== "scored") {
        return { ...base, state: "not_enough_answers" };
      }
      if (brand.competitors.length === 0) {
        return { ...base, brandMentions: result.mentionedCount, state: "no_competitors" };
      }
      const competitorCounts = await countCompetitorMentions(tx, brand.latest, brand.competitors);
      const brandMentions = result.mentionedCount;
      const totalMentions = competitorCounts.reduce((sum, c) => sum + c.mentions, brandMentions);
      if (totalMentions === 0) return { ...base, state: "no_mentions" };
      return {
        ...base,
        state: "measured",
        brandMentions,
        totalMentions,
        sharePct: (brandMentions / totalMentions) * 100,
        smallSample: totalMentions < SOV_SMALL_SAMPLE_BELOW,
      };
    }),
  );
}

const STATE_DETAIL: Record<Exclude<SovState, "measured">, string> = {
  no_mentions: "No mentions of you or your competitors",
  no_competitors: "No competitors set",
  not_enough_answers: NOT_ENOUGH_ANSWERS,
  no_audit: NO_AUDIT_YET,
};

export function sovLine(sov: BrandShareOfVoice, organizationId: string): SovLine {
  const audit = sov.audit
    ? `Audit #${sov.audit.auditNumber}` +
      (sov.audit.completedAt
        ? `, ${formatInOrgTimezone(sov.audit.completedAt, organizationId, "d MMM")}`
        : "")
    : null;
  return {
    brandId: sov.brandId,
    brandName: sov.brandName,
    share: sov.sharePct === null ? null : formatSharePercent(sov.sharePct),
    detail:
      sov.state === "measured"
        ? `${sov.brandMentions} of ${sov.totalMentions} mentions`
        : STATE_DETAIL[sov.state],
    audit,
    smallSample: sov.smallSample,
  };
}
