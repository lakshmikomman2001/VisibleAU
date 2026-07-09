export interface TechInputs {
  llmstxtPresent: boolean;
  llmstxtValid: boolean;
  robotsAllowsCrawlers: boolean;
  ssrPasses: boolean;
  aiDiscoveryEndpoints: boolean;
  pageLoadFast: boolean;
  mcpEndpointPresent: boolean;
  mcpEndpointValid: boolean;
  mcpToolsCount: number;
}

export function computeTechScore(inputs: TechInputs): number {
  let score = 0;
  if (inputs.llmstxtPresent) score += 3;
  if (inputs.llmstxtValid) score += 3;
  if (inputs.robotsAllowsCrawlers) score += 3;
  if (inputs.ssrPasses) score += 3;
  if (inputs.aiDiscoveryEndpoints) score += 2;
  if (inputs.pageLoadFast) score += 2;
  if (inputs.mcpEndpointPresent) score += 2;
  if (inputs.mcpEndpointValid) score += 2;
  return Math.min(score, 20);
}

export interface EntityClarityInputs {
  orgSchemaPresent: boolean;
  localBusinessSchema: boolean;
  localRegInSchema: boolean;
  nameConsistent: boolean;
  serviceReadable: boolean;
}

export function computeEntityClarityScore(inputs: EntityClarityInputs): number {
  let score = 0;
  if (inputs.orgSchemaPresent) score += 5;
  if (inputs.localBusinessSchema) score += 4;
  if (inputs.localRegInSchema) score += 4;
  if (inputs.nameConsistent) score += 4;
  if (inputs.serviceReadable) score += 3;
  return Math.min(score, 20);
}

export interface VerifyInputs {
  abnConfirmed: boolean;
  wikipediaAu: boolean;
  auDirectories: number;
  reviewCitations: number;
  expertQuotes: boolean;
}

export function computeVerifyScore(inputs: VerifyInputs): number {
  let score = 0;
  if (inputs.abnConfirmed) score += 5;
  if (inputs.wikipediaAu) score += 5;
  score += Math.min(inputs.auDirectories, 4);
  score += Math.min(inputs.reviewCitations, 3);
  if (inputs.expertQuotes) score += 3;
  return Math.min(score, 20);
}

export interface AuthorityInputs {
  topicalCoverage: number;
  citationRate: number;
  citationDiversity: number;
}

export function computeAuthorityScore(inputs: AuthorityInputs): number {
  const topicalPts = Math.round((inputs.topicalCoverage / 100) * 8);
  const promptPts = Math.min(Math.round(inputs.citationRate * 6), 6);
  const diversityPts = Math.min(inputs.citationDiversity, 6);
  return Math.min(topicalPts + promptPts + diversityPts, 20);
}

export interface TaskInputs {
  bookingAccessible: boolean;
  pricingVisible: boolean;
  serviceAreaDefined: boolean;
  faqDirectAnswers: number;
}

export function computeTaskScore(inputs: TaskInputs): number {
  let score = 0;
  if (inputs.bookingAccessible) score += 5;
  if (inputs.pricingVisible) score += 5;
  if (inputs.serviceAreaDefined) score += 5;
  score += Math.min(inputs.faqDirectAnswers, 5);
  return Math.min(score, 20);
}

export function computeTotalScore(
  techScore: number,
  entityClarityScore: number,
  verifyScore: number,
  authorityScore: number,
  taskScore: number,
): number {
  return techScore + entityClarityScore + verifyScore + authorityScore + taskScore;
}
