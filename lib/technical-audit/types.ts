export interface TechnicalAuditDimensions {
  scoreRobots: number;
  scoreLlmsTxt: number;
  scoreSchema: number;
  scoreMeta: number;
  scoreContent: number;
  scoreBrandEntity: number;
  scoreSignals: number;
  scoreAiDiscovery: number;
}

export interface CategoryRollup {
  technical: number;
  technicalPct: number;
  content: number;
  contentPct: number;
  authority: number;
  authorityPct: number;
  schema: number;
  schemaPct: number;
  performance: null;
}

export interface DimensionResult<T = unknown> {
  score: number;
  findings: T;
}
