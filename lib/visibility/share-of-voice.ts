import { and, desc, eq, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";
import { countCompetitorMentions } from "@/lib/audit/competitor-mentions";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import type { DimensionResult } from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { NO_AUDIT_YET, NOT_ENOUGH_ANSWERS } from "@/lib/scoring/visibility-display";
import {
  formatSharePercent,
  SOV_SMALL_SAMPLE_BELOW,
  type SovEngine,
  type SovLine,
  type SovPayload,
  type SovShare,
} from "./share-of-voice-display";

/**
 * The one Share of Voice counter (Overview, 7 Nov; one definition everywhere, 7 Nov). The Overview, the
 * Visibility page's card, the audit page's competitor card, the PDF's competitors section and the wins
 * feed all read it; nothing else computes a share (tests/unit/visibility/one-share-of-voice.test.ts).
 *
 * It counts on the same answer set as the Visibility headline -- the audit's everyday questions, first
 * run only -- and the same way the audit page and the PDF always counted competitors:
 *
 *   share = a business's mentions / (the brand's mentions + every configured competitor's mentions)
 *
 * The brand's count is the headline's own k (lib/scoring/resolve-audit-dimensions.ts, verified only);
 * each competitor's is lib/audit/competitor-mentions.ts's, the same detector over the same answers.
 *
 * It replaced two other definitions: share_of_voice_snapshots (written on audit.complete by the retired
 * lib/visibility/sov-calculator.ts: the brand's answers, unverified included, against every OTHER SITE
 * those answers cited), which the Visibility page and the wins feed read; and the PDF's per-business
 * "k of n answers", which was a mention rate labelled share of voice.
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
  /** Each competitor's website (brands.competitor_websites): only these can be verified. */
  competitorWebsites: Readonly<Record<string, string>>;
  /** The audit to count, normally the brand's latest complete one; null when it has none. */
  latest: SovAudit | null;
}

export type SovState =
  | "no_audit"
  | "not_enough_answers"
  | "no_competitors"
  | "no_verifiable_competitors"
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
  /** Each verifiable competitor, with its verified mentions and share (empty with no audit). */
  competitors: SovShare[];
  /** Competitors with no website set: they can't be verified, so they're left out, and named. */
  unverifiable: string[];
  /** The same counts per engine that answered, sorted by engine name. */
  perEngine: SovEngine[];
}

/** What the counter needs from resolveOrganicDimensions for each audit. */
export interface ResolvedForSov {
  headline: DimensionResult;
  mentionedCount: number;
  perEngine: ReadonlyArray<{ engine: string; mentionedCount: number }>;
}

/** The one place a share is computed: mentions as a percentage of all the mentions in the same answers. */
function shareOf(mentions: number, total: number): number | null {
  return total > 0 ? (mentions / total) * 100 : null;
}

/**
 * `resolved` is resolveOrganicDimensions' result for the brands' audits (callers have it already for the
 * headline). One competitor-text query per brand that has competitors and a scored audit; none for the rest.
 */
export async function shareOfVoiceForBrands(
  tx: DbClient,
  brands: readonly SovBrand[],
  resolved: ReadonlyMap<string, ResolvedForSov>,
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
        competitors: [],
        perEngine: [],
        // Fair competitor counting (7 Nov): a competitor is verified the way the brand is -- by its
        // own site among the answer's cited sources -- so one with no website can't be, and is left
        // out of every share rather than counted on a bare name match.
        unverifiable: brand.competitors.filter((name) => !brand.competitorWebsites[name]),
      };
      if (!brand.latest) return { ...base, state: "no_audit" };
      const result = resolved.get(brand.latest.id);
      const brandMentions = result?.mentionedCount ?? 0;
      const verifiable = brand.competitors.flatMap((name) => {
        const website = brand.competitorWebsites[name];
        return website ? [{ name, website }] : [];
      });
      // The counts are facts whatever the sample (the audit page lists them); a share is only
      // worked out when the headline itself has enough answers to be shown.
      const counts =
        verifiable.length > 0 ? await countCompetitorMentions(tx, brand.latest, verifiable) : [];
      const totalMentions = counts.reduce((sum, c) => sum + c.mentions, brandMentions);
      if (result?.headline.status !== "scored") {
        return {
          ...base,
          state: "not_enough_answers",
          brandMentions,
          totalMentions,
          competitors: counts.map((c) => ({ name: c.name, mentions: c.mentions, sharePct: null })),
        };
      }
      if (brand.competitors.length === 0) {
        return { ...base, brandMentions, state: "no_competitors" };
      }
      if (verifiable.length === 0) {
        return { ...base, brandMentions, state: "no_verifiable_competitors" };
      }

      const perEngine = [...result.perEngine]
        .sort((a, b) => a.engine.localeCompare(b.engine))
        .map((e): SovEngine => {
          const competitors = counts.map((c) => ({
            name: c.name,
            mentions: c.perEngine[e.engine] ?? 0,
          }));
          const total = competitors.reduce((sum, c) => sum + c.mentions, e.mentionedCount);
          return {
            engine: e.engine,
            brandMentions: e.mentionedCount,
            brandSharePct: shareOf(e.mentionedCount, total),
            totalMentions: total,
            competitors: competitors.map((c) => ({ ...c, sharePct: shareOf(c.mentions, total) })),
          };
        });
      return {
        ...base,
        state: totalMentions === 0 ? "no_mentions" : "measured",
        brandMentions,
        totalMentions,
        sharePct: shareOf(brandMentions, totalMentions),
        smallSample: totalMentions > 0 && totalMentions < SOV_SMALL_SAMPLE_BELOW,
        competitors: counts.map((c) => ({
          name: c.name,
          mentions: c.mentions,
          sharePct: shareOf(c.mentions, totalMentions),
        })),
        perEngine,
      };
    }),
  );
}

/** One brand's Share of Voice in one audit (or none), resolving the headline's counts itself. */
export async function shareOfVoiceForAudit(
  tx: DbClient,
  brand: {
    id: string;
    name: string;
    competitors: readonly string[];
    competitorWebsites: Readonly<Record<string, string>>;
  },
  audit: SovAudit | null,
): Promise<BrandShareOfVoice> {
  const resolved = audit ? await resolveOrganicDimensions(tx, [audit.id]) : new Map();
  const [sov] = await shareOfVoiceForBrands(tx, [{ ...brand, latest: audit }], resolved);
  return sov;
}

/** A brand's latest complete audit: the one Share of Voice is counted on. */
export async function latestCompleteAudit(tx: DbClient, brandId: string): Promise<SovAudit | null> {
  const [audit] = await tx
    .select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      completedAt: audits.completedAt,
      methodologyVersion: audits.methodologyVersion,
    })
    .from(audits)
    .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
    .orderBy(sql`${audits.completedAt} DESC NULLS LAST`, desc(audits.auditNumber))
    .limit(1);
  return audit ?? null;
}

const STATE_DETAIL: Record<Exclude<SovState, "measured" | "no_verifiable_competitors">, string> = {
  no_mentions: "No verified mentions of you or your competitors",
  no_competitors: "No competitors set",
  not_enough_answers: NOT_ENOUGH_ANSWERS,
  no_audit: NO_AUDIT_YET,
};

/** "2 competitors can't be verified: add their websites in brand settings". */
export function unverifiableNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return names.length === 1
    ? "1 competitor can't be verified: add its website in brand settings"
    : `${names.length} competitors can't be verified: add their websites in brand settings`;
}

function lineDetail(sov: BrandShareOfVoice): string {
  if (sov.state === "measured")
    return `${sov.brandMentions} of ${sov.totalMentions} verified mentions`;
  if (sov.state === "no_verifiable_competitors") return unverifiableNote(sov.unverifiable) ?? "";
  return STATE_DETAIL[sov.state];
}

/** "Audit #36, 24 Oct" (Sydney date). */
export function sovAuditLabel(audit: SovAudit, organizationId: string): string {
  return (
    `Audit #${audit.auditNumber}` +
    (audit.completedAt
      ? `, ${formatInOrgTimezone(audit.completedAt, organizationId, "d MMM")}`
      : "")
  );
}

export function sovLine(sov: BrandShareOfVoice, organizationId: string): SovLine {
  return {
    brandId: sov.brandId,
    brandName: sov.brandName,
    share: sov.sharePct === null ? null : formatSharePercent(sov.sharePct),
    detail: lineDetail(sov),
    audit: sov.audit ? sovAuditLabel(sov.audit, organizationId) : null,
    smallSample: sov.smallSample,
    // Not with no audit (nothing to compare yet), nor when the detail already says it.
    note:
      sov.state === "no_audit" || sov.state === "no_verifiable_competitors"
        ? null
        : unverifiableNote(sov.unverifiable),
  };
}

/** The counts as JSON, for the Visibility page's card. */
export function sovPayload(sov: BrandShareOfVoice, organizationId: string): SovPayload {
  return {
    line: sovLine(sov, organizationId),
    measured: sov.state === "measured",
    brandName: sov.brandName,
    brandMentions: sov.brandMentions,
    totalMentions: sov.totalMentions,
    sharePct: sov.sharePct,
    smallSample: sov.smallSample,
    competitors: sov.competitors,
    unverifiable: sov.unverifiable,
    perEngine: sov.perEngine,
  };
}
