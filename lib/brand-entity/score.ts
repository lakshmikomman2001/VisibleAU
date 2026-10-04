interface BrandEntityInput {
  abnVerified: boolean;
  wikipediaAuPresent: boolean;
  auTldPresent: boolean;
  auDirectoryCount: number;
}

// Task WW: the single source of truth for Brand & Entity weights -- the
// brand-entity-audit display page imports these (and scoreDirectoryTier)
// instead of re-implementing them, which is how the directory row drifted
// to a binary present/absent that couldn't express the real 3-tier rule.
export const BRAND_ENTITY_WEIGHTS = {
  abnVerified: 3,
  wikipediaAuPresent: 3,
  auTldPresent: 2,
  directoryMax: 2,
} as const;

/** The AU directory check is graduated, not boolean: 0 directories -> 0,
 * exactly 1 -> 1, 2 or more -> the full directoryMax. */
export function scoreDirectoryTier(auDirectoryCount: number): 0 | 1 | 2 {
  if (auDirectoryCount >= 2) return 2;
  if (auDirectoryCount >= 1) return 1;
  return 0;
}

export function brandEntityScore(input: BrandEntityInput): number {
  let score = 0;
  if (input.abnVerified) score += BRAND_ENTITY_WEIGHTS.abnVerified;
  if (input.wikipediaAuPresent) score += BRAND_ENTITY_WEIGHTS.wikipediaAuPresent;
  if (input.auTldPresent) score += BRAND_ENTITY_WEIGHTS.auTldPresent;
  score += scoreDirectoryTier(input.auDirectoryCount);
  return Math.min(10, score);
}
