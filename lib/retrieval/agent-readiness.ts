/*
 * 17 Nov, part 3: an input nothing measured is null, and earns no points -- never a measured true, false or 0.
 * inngest/functions/score-agent-readiness.ts hard-coded eight of them (page load fast true, name consistent true,
 * Wikipedia false, directories from a column only a stub writes, review citations 0, expert quotes false,
 * citation rate 0, citation diversity 0): 6 free points and 22 points scored as measured zeros.
 */
export interface TechInputs {
  llmstxtPresent: boolean;
  llmstxtValid: boolean;
  robotsAllowsCrawlers: boolean | null;
  ssrPasses: boolean | null;
  aiDiscoveryEndpoints: boolean | null;
  pageLoadFast: boolean | null;
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
  orgSchemaPresent: boolean | null;
  localBusinessSchema: boolean | null;
  localRegInSchema: boolean | null;
  nameConsistent: boolean | null;
  serviceReadable: boolean | null;
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
  abnConfirmed: boolean | null;
  wikipediaAu: boolean | null;
  auDirectories: number | null;
  reviewCitations: number | null;
  expertQuotes: boolean | null;
}

export function computeVerifyScore(inputs: VerifyInputs): number {
  let score = 0;
  if (inputs.abnConfirmed) score += 5;
  if (inputs.wikipediaAu) score += 5;
  score += Math.min(inputs.auDirectories ?? 0, 4); // null: not measured, no points
  score += Math.min(inputs.reviewCitations ?? 0, 3); // null: not measured, no points
  if (inputs.expertQuotes) score += 3;
  return Math.min(score, 20);
}

export interface AuthorityInputs {
  topicalCoverage: number | null;
  citationRate: number | null;
  citationDiversity: number | null;
}

export function computeAuthorityScore(inputs: AuthorityInputs): number {
  // null: not measured, no points.
  const topicalPts =
    inputs.topicalCoverage === null ? 0 : Math.round((inputs.topicalCoverage / 100) * 8);
  const promptPts =
    inputs.citationRate === null ? 0 : Math.min(Math.round(inputs.citationRate * 6), 6);
  const diversityPts =
    inputs.citationDiversity === null ? 0 : Math.min(inputs.citationDiversity, 6);
  return Math.min(topicalPts + promptPts + diversityPts, 20);
}

export interface TaskInputs {
  bookingAccessible: boolean | null;
  pricingVisible: boolean | null;
  serviceAreaDefined: boolean | null;
  faqDirectAnswers: number | null;
}

export function computeTaskScore(inputs: TaskInputs): number {
  let score = 0;
  if (inputs.bookingAccessible) score += 5;
  if (inputs.pricingVisible) score += 5;
  if (inputs.serviceAreaDefined) score += 5;
  score += Math.min(inputs.faqDirectAnswers ?? 0, 5); // null: not measured, no points
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
