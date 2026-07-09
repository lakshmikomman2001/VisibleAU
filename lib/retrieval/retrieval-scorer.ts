export interface RetrievalScoreSummary {
  agentReadinessTotal: number;
  techScore: number;
  entityClarityScore: number;
  verifyScore: number;
  authorityScore: number;
  taskScore: number;
  localAiTrustScore: number | null;
  crawlerVisitCount: number;
  contentAuditCount: number;
  llmstxtDepthScore: number | null;
  citationProbabilityAvg: number | null;
}

export function aggregateRetrievalScore(params: {
  agentReadiness: {
    techScore: number;
    entityClarityScore: number;
    verifyScore: number;
    authorityScore: number;
    taskScore: number;
    totalScore: number;
    localAiTrustScore: number | null;
  } | null;
  crawlerVisitCount: number;
  contentAuditCount: number;
  llmstxtDepthScore: number | null;
  citationProbabilities: number[];
}): RetrievalScoreSummary {
  const ar = params.agentReadiness;
  const citAvg =
    params.citationProbabilities.length > 0
      ? params.citationProbabilities.reduce((a, b) => a + b, 0) / params.citationProbabilities.length
      : null;

  return {
    agentReadinessTotal: ar?.totalScore ?? 0,
    techScore: ar?.techScore ?? 0,
    entityClarityScore: ar?.entityClarityScore ?? 0,
    verifyScore: ar?.verifyScore ?? 0,
    authorityScore: ar?.authorityScore ?? 0,
    taskScore: ar?.taskScore ?? 0,
    localAiTrustScore: ar?.localAiTrustScore ?? null,
    crawlerVisitCount: params.crawlerVisitCount,
    contentAuditCount: params.contentAuditCount,
    llmstxtDepthScore: params.llmstxtDepthScore,
    citationProbabilityAvg: citAvg,
  };
}
