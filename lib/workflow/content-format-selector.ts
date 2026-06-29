const FORMAT_MAP: Record<string, string> = {
  listicle: "listicle",
  how_to_guide: "how_to_guide",
  comparison_article: "comparison_article",
  faq_block: "faq_block",
  expert_article: "expert_article",
  case_study: "case_study",
  product_page: "comparison_article",
};

const KEY_FORMAT_OVERRIDES: Record<string, string> = {
  "press-release": "press_release",
  "linkedin-presence": "linkedin_article",
  "linkedin-post": "linkedin_article",
};

export function selectContentFormat(
  detectedFormat: string | null,
  recommendationKey: string | null,
): { format: string; reason: string } {
  if (recommendationKey && KEY_FORMAT_OVERRIDES[recommendationKey]) {
    return {
      format: KEY_FORMAT_OVERRIDES[recommendationKey],
      reason: `Format determined by recommendation type: ${recommendationKey}`,
    };
  }

  if (detectedFormat && FORMAT_MAP[detectedFormat]) {
    return {
      format: FORMAT_MAP[detectedFormat],
      reason: `Matched detected content format: ${detectedFormat}`,
    };
  }

  return {
    format: "expert_article",
    reason: "Default format — no specific format detected",
  };
}
