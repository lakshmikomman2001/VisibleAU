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
    authorityPct: Math.round((dims.scoreBrandEntity / 10) * 100),
    schema: dims.scoreSchema,
    schemaPct: Math.round((dims.scoreSchema / 16) * 100),
    performance: null,
  };
}

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
