interface BrandEntityInput {
  abnVerified: boolean;
  wikipediaAuPresent: boolean;
  auTldPresent: boolean;
}

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part A3):
 * the directory signal (was 0/1/2 of 10, via scoreDirectoryTier over
 * auDirectoryCount) is removed from this score entirely, not just
 * hidden -- the checker that produced auDirectoryCount requested a
 * trade-CATEGORY page on hipages (never a real business-name lookup)
 * and both sites' own robots.txt/terms disallow the request anyway, so
 * every historical auDirectoryCount this score ever used is untrusted.
 * Renormalised to /8 (abnVerified 3 + wikipediaAuPresent 3 + auTldPresent
 * 2), not rescaled back up to /10 -- changing these three signals'
 * relative weights to fill the gap would make an OLD row's score (built
 * from the same abn/wikipedia/tld facts) silently different from a NEW
 * one's, for no real reason. Despite the brand_entity_scores.score_of_10
 * column's name, every score computed by this function from now on is
 * out of 8 -- every reader (app/(auth)/brands/[brandId]/brand-entity-
 * audit/page.tsx, app/api/brands/[brandId]/entity-score/route.ts) was
 * updated to match. Directory presence now comes only from the owner's
 * own confirmation (brand_directory_listings, Part C) or from counting
 * what AI answers actually cited (Part D) -- shown on their own
 * surfaces, never folded back into this score.
 */
export const BRAND_ENTITY_WEIGHTS = {
  abnVerified: 3,
  wikipediaAuPresent: 3,
  auTldPresent: 2,
} as const;

export const BRAND_ENTITY_MAX_SCORE = 8;

export function brandEntityScore(input: BrandEntityInput): number {
  let score = 0;
  if (input.abnVerified) score += BRAND_ENTITY_WEIGHTS.abnVerified;
  if (input.wikipediaAuPresent) score += BRAND_ENTITY_WEIGHTS.wikipediaAuPresent;
  if (input.auTldPresent) score += BRAND_ENTITY_WEIGHTS.auTldPresent;
  return Math.min(BRAND_ENTITY_MAX_SCORE, score);
}

/**
 * Sri, 21 Oct follow-up, item 5: the one shared read-time conversion
 * from a brand_entity_scores row's own raw facts to a 0-100 display
 * percentage -- replaces three independent copies (app/api/brands/
 * [brandId]/entity-score/route.ts, app/api/brand-entity/[brandId]/
 * route.ts, lib/trust/trust-scorer.ts) that each read the STORED
 * score_of_10 column and divided it by some denominator (one already
 * used BRAND_ENTITY_MAX_SCORE correctly; one used a hardcoded literal
 * 10; one didn't convert at all). Any of those is wrong for a row
 * computed before this hotfix: score_of_10 used to run up to 10 (the
 * same abnVerified/wikipediaAuPresent/auTldPresent weights, PLUS up to
 * 2 points from the now-deleted directory checker) -- dividing that
 * OLD-scale numerator by the NEW 8-point denominator silently inflates
 * every old row's displayed percentage. Recomputing from the row's own
 * abn/wikipedia/auTld booleans (never invalidated -- only the directory
 * signal ever was) gives every row, old or new, the SAME single
 * current answer, not two different numbers sharing one scale. */
export function recomputeEntityDisplayScore(row: {
  abnVerified: boolean;
  wikipediaAuPresent: boolean;
  auTldPresent: boolean | null;
}): number {
  const raw = brandEntityScore({ ...row, auTldPresent: row.auTldPresent ?? false });
  return Math.round((raw / BRAND_ENTITY_MAX_SCORE) * 100);
}
