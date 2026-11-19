import { AI_DISCOVERY_MAX_BEFORE_19_NOV, aiDiscoveryMaxFor } from "@/lib/ai-discovery/endpoints";
import { BRAND_ENTITY_MAX_SCORE } from "@/lib/brand-entity/score";
import type { CategoryRollup, TechnicalAuditDimensions } from "./types";

/**
 * `aiDiscoveryMax`: what the audit's AI Discovery was out of (aiDiscoveryMaxFor: 3 from 19 Nov, 6 before), so the
 * Technical category's percentage is of its own maximum (45, or 48 before).
 */
export function rollupTo5Categories(
  dims: TechnicalAuditDimensions,
  aiDiscoveryMax: number = AI_DISCOVERY_MAX_BEFORE_19_NOV,
): CategoryRollup {
  const techRaw = dims.scoreRobots + dims.scoreLlmsTxt + dims.scoreAiDiscovery + dims.scoreSignals;
  const contentRaw = dims.scoreContent + dims.scoreMeta;
  const technicalMax = 48 - (AI_DISCOVERY_MAX_BEFORE_19_NOV - aiDiscoveryMax);
  return {
    technical: techRaw,
    technicalPct: Math.round((techRaw / technicalMax) * 100),
    content: contentRaw,
    contentPct: Math.round((contentRaw / 26) * 100),
    authority: dims.scoreBrandEntity,
    // Vunnara (21 Oct, "directory listings... never scraping", Part A3):
    // brandEntityScore's own max dropped from 10 to 8 (the directory
    // signal was removed, not rescaled) -- this percentage is this ONE
    // category's own 0-100%, so it must divide by the SAME max the
    // score itself now uses, not a stale literal 10.
    //
    // Sri, 21 Oct follow-up, item 5 -- KNOWN, BOUNDED RESIDUAL GAP:
    // dims.scoreBrandEntity here is read from a STORED technical_audits
    // row (app/(auth)/brands/[brandId]/technical-audit/page.tsx), a
    // per-audit-run snapshot, not a single "latest" row -- unlike
    // brand_entity_scores (fixed this follow-up via
    // recomputeEntityDisplayScore, which re-derives from the row's own
    // still-valid abn/wikipedia/auTld facts), a historical
    // technical_audits row never stored those three facts separately,
    // only their already-summed total -- there is no way to recompute
    // this ONE field from real per-row data without a new migration,
    // which is out of this follow-up's scope. A row from before this
    // hotfix COULD have scored up to 10 raw points (the same 3 facts
    // PLUS up to 2 from the now-deleted directory checker); dividing
    // that old-scale numerator by the new 8-point max would overstate
    // its percentage. In practice the checker almost always returned
    // "not_listed" (0 points) -- see lib/brand-entity/au-directory-
    // aggregate.ts's own retired doc comment -- so the raw numerator
    // for the overwhelming majority of historical rows is IDENTICAL
    // under both the old and new weighting, and this division is
    // already the correct, current answer for them. The residual risk
    // is narrow: only a historical row where that checker happened to
    // score nonzero (a coincidence, never a real listing match) will
    // show an inflated authorityPct here.
    authorityPct: Math.round((dims.scoreBrandEntity / BRAND_ENTITY_MAX_SCORE) * 100),
    schema: dims.scoreSchema,
    schemaPct: Math.round((dims.scoreSchema / 16) * 100),
    performance: null,
  };
}

// Vunnara (21 Oct, Part A3): the true achievable max here dropped from
// 100 to 98 -- scoreBrandEntity's own max dropped 10 -> 8, and this
// raw-point sum is deliberately NOT rescaled to paper over that (Bondi's
// real historical composite, kk-bondi-regression.test.ts /
// ai-discovery-framing.test.ts, must stay byte-identical: the same raw
// brandEntity points it always earned flow through unchanged). Every
// reader that displays this as "X of 100" needs updating to "of 98" --
// see app/(auth)/brands/[brandId]/technical-audit/page.tsx.
// 19 Nov (Sri's review): 95 for a new audit -- the three /ai/ files no longer earn up to 3 (lib/ai-discovery/
// endpoints.ts). An audit's own maximum is compositeMaxFor below; this is the most a new one can score.
export const TECHNICAL_AUDIT_MAX_SCORE = 95;

/**
 * 17 Nov, part 3: when the maximum dropped from 100 to 98 (b828203, 21 Oct 2026 11:37 Sydney). A row from
 * before then could score up to 100 (Brand & Entity was out of 10), so a change between it and a later row
 * compares two different scales.
 */
export const MAX_98_FROM = new Date("2026-10-21T00:37:14Z");

export function compositeMaxAt(createdAt: Date | string): 98 | 100 {
  return new Date(createdAt).getTime() < MAX_98_FROM.getTime() ? 100 : 98;
}

/**
 * 19 Nov: what an audit's composite is out of -- 100 before 21 Oct, 98 while the /ai/ files counted, 95 since
 * (TECHNICAL_AUDIT_MAX_SCORE), read from the audit's own AI Discovery findings (lib/ai-discovery/endpoints.ts
 * aiDiscoveryMaxFor) rather than a deploy date nobody knows in advance.
 */
export function compositeMaxFor(
  createdAt: Date | string,
  aiDiscovery: { optionalFilesScored?: boolean } | null | undefined,
): number {
  const base = compositeMaxAt(createdAt);
  return base - (AI_DISCOVERY_MAX_BEFORE_19_NOV - aiDiscoveryMaxFor(aiDiscovery));
}

/**
 * The change in the composite from the previous technical audit, only when the two can be compared: both
 * measured, both on the same maximum, and both crawls reached the site. Otherwise null (no "vs last" at all).
 */
export function comparableCompositeDelta(
  latest: {
    composite: number | null;
    createdAt: Date | string;
    siteReached: boolean;
    max?: number;
  },
  previous: {
    composite: number | null;
    createdAt: Date | string;
    siteReached: boolean;
    max?: number;
  } | null,
): number | null {
  if (!previous) return null;
  if (latest.composite === null || previous.composite === null) return null;
  if (!latest.siteReached || !previous.siteReached) return null;
  // 19 Nov: each side's own maximum (compositeMaxFor) when the caller knows it: a 98-point audit isn't compared with
  // a 95-point one.
  const latestMax = latest.max ?? compositeMaxAt(latest.createdAt);
  const previousMax = previous.max ?? compositeMaxAt(previous.createdAt);
  if (latestMax !== previousMax) return null;
  return latest.composite - previous.composite;
}

/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 5 -- the checks the site-readiness score adds up, in the
 * order it always added them: robots.txt, llms.txt, schema, meta tags, content, brand entity, signals and
 * AI discovery. The Health Check says "35 of 98 points across 8 checks" from this list, so the count can't
 * drift from the sum.
 */
export const TECHNICAL_AUDIT_CHECKS = [
  "scoreRobots",
  "scoreLlmsTxt",
  "scoreSchema",
  "scoreMeta",
  "scoreContent",
  "scoreBrandEntity",
  "scoreSignals",
  "scoreAiDiscovery",
] as const satisfies ReadonlyArray<keyof TechnicalAuditDimensions>;

export function computeTechnicalComposite(dims: TechnicalAuditDimensions): number {
  // Left to right from 0, as the sum always ran: 0 + x is x exactly, so stored composites don't move.
  return Number(TECHNICAL_AUDIT_CHECKS.reduce((sum, key) => sum + dims[key], 0).toFixed(2));
}
