export const DIMENSION_WEIGHTS = {
  frequency: 0.25,
  position: 0.25,
  sentiment: 0.2,
  context: 0.15,
  accuracy: 0.15,
} as const;

export const CONTEXT_SCORE_MAP = {
  recommended: 100,
  listed: 50,
  mentioned: 25,
  commodified: 25,
  // Brand was not mentioned at all — distinct from "commodified" (mentioned,
  // but as a generic/substitutable option). Never conflate the two: commodified
  // still means the brand WAS named. Scores 0, same as an empty citation set.
  absent: 0,
} as const;

export const SENTIMENT_SCORE_MAP = {
  positive: 100,
  neutral: 50,
  negative: 0,
} as const;
