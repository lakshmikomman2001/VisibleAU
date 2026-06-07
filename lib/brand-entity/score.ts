interface BrandEntityInput {
  abnVerified: boolean;
  wikipediaAuPresent: boolean;
  auTldPresent: boolean;
  auDirectoryCount: number;
}

export function brandEntityScore(input: BrandEntityInput): number {
  let score = 0;
  if (input.abnVerified) score += 3;
  if (input.wikipediaAuPresent) score += 3;
  if (input.auTldPresent) score += 2;
  if (input.auDirectoryCount >= 2) score += 2;
  else if (input.auDirectoryCount >= 1) score += 1;
  return Math.min(10, score);
}
