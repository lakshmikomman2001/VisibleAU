export interface LinkedinPresenceInput {
  companyPageUrl: string | null;
  companyPageExists: boolean;
  companyPageFollowers: number;
  companyPosts30d: number;
  companyArticlesCount: number;
  founderProfileUrl: string | null;
  founderProfileExists: boolean;
  founderFollowers: number;
  founderPosts30d: number;
  founderArticlesCount: number;
  founderArticles500plus: number;
  knowledgeSharingRatio: number;
  originalContentRatio: number;
  semanticRelevanceScore: number;
}

export interface LinkedinPresenceResult {
  presenceScore: number;
  gaps: string[];
}

export function scoreLinkedinPresence(
  input: LinkedinPresenceInput,
): LinkedinPresenceResult {
  const gaps: string[] = [];
  let score = 0;

  // Company page section (max 30)
  if (input.companyPageExists) {
    score += 15;
  } else {
    gaps.push("No LinkedIn company page found — create one to establish brand presence.");
  }

  if (input.companyPosts30d >= 4) {
    score += 10;
  } else {
    gaps.push(`Only ${input.companyPosts30d} company posts in the last 30 days — aim for at least 4.`);
  }

  if (input.companyArticlesCount >= 2) {
    score += 5;
  } else {
    gaps.push("Publish at least 2 company articles on LinkedIn for thought leadership signals.");
  }

  // Founder/practitioner section (max 40)
  if (input.founderProfileExists) {
    score += 10;
  } else {
    gaps.push("No founder/practitioner LinkedIn profile linked — add one for authority signals.");
  }

  if (input.founderFollowers >= 2000) {
    score += 10;
  } else {
    gaps.push(`Founder has ${input.founderFollowers} followers — target 2,000+ for citation authority.`);
  }

  if (input.founderPosts30d >= 5) {
    score += 10;
  } else {
    gaps.push(`Founder posted ${input.founderPosts30d} times in 30 days — aim for 5+ posts.`);
  }

  if (input.founderArticles500plus >= 2) {
    score += 10;
  } else {
    gaps.push("Publish at least 2 long-form articles (500+ words) for AI citation value.");
  }

  // Content quality section (max 30)
  if (input.knowledgeSharingRatio >= 0.54) {
    score += 15;
  } else {
    gaps.push(`Knowledge sharing ratio is ${(input.knowledgeSharingRatio * 100).toFixed(0)}% — target 54%+ original knowledge content.`);
  }

  if (input.originalContentRatio >= 0.95) {
    score += 10;
  } else {
    gaps.push(`Original content ratio is ${(input.originalContentRatio * 100).toFixed(0)}% — minimise reshared content (target 95%+ original).`);
  }

  if (input.semanticRelevanceScore >= 0.7) {
    score += 5;
  } else {
    gaps.push("Content semantic relevance is low — focus on topics directly related to your brand's expertise.");
  }

  return { presenceScore: score, gaps };
}
