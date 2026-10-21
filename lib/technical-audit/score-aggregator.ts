import { BRAND_ENTITY_MAX_SCORE } from "@/lib/brand-entity/score";
import type { CategoryRollup, TechnicalAuditDimensions } from "./types";

export function rollupTo5Categories(dims: TechnicalAuditDimensions): CategoryRollup {
  const techRaw = dims.scoreRobots + dims.scoreLlmsTxt + dims.scoreAiDiscovery + dims.scoreSignals;
  const contentRaw = dims.scoreContent + dims.scoreMeta;
  return {
    technical: techRaw,
    technicalPct: Math.round((techRaw / 48) * 100),
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
export const TECHNICAL_AUDIT_MAX_SCORE = 98;

export function computeTechnicalComposite(dims: TechnicalAuditDimensions): number {
  return Number(
    (
      dims.scoreRobots +
      dims.scoreLlmsTxt +
      dims.scoreSchema +
      dims.scoreMeta +
      dims.scoreContent +
      dims.scoreBrandEntity +
      dims.scoreSignals +
      dims.scoreAiDiscovery
    ).toFixed(2),
  );
}
