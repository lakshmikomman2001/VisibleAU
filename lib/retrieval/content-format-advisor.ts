export type ContentFormat =
  | "listicle"
  | "how_to_guide"
  | "comparison_article"
  | "faq_block"
  | "expert_article"
  | "case_study"
  | "product_page"
  | "other";

export type Engine = "chatgpt" | "gemini" | "perplexity" | "all_local";

export const FORMAT_BY_ENGINE: Record<Engine, ContentFormat[]> = {
  chatgpt: ["listicle", "expert_article"],
  gemini: ["how_to_guide"],
  perplexity: ["listicle", "faq_block"],
  all_local: ["listicle"],
};

export interface FormatRecommendation {
  recommended: ContentFormat;
  reason: string;
}

export function recommendFormat(
  engine: Engine,
  _queryType: string,
  existingFormatMix: Record<string, number>,
): FormatRecommendation {
  const preferred = FORMAT_BY_ENGINE[engine] ?? ["listicle"];

  const listicleCount = existingFormatMix["listicle"] ?? 0;
  const howToCount = existingFormatMix["how_to_guide"] ?? 0;

  if (listicleCount > 0 && howToCount === 0 && listicleCount >= 3) {
    return {
      recommended: "how_to_guide",
      reason: `For every 3 listicle pages, recommend 1 how-to guide. You have ${listicleCount} listicles and ${howToCount} how-to guides.`,
    };
  }

  if (listicleCount >= 3 && howToCount > 0 && listicleCount / howToCount > 3) {
    return {
      recommended: "how_to_guide",
      reason: `Listicle-to-how-to ratio is ${listicleCount}:${howToCount}. Recommend balancing with a how-to guide.`,
    };
  }

  return {
    recommended: preferred[0],
    reason: `${engine} favours ${preferred.join(" and ")} formats for citation.`,
  };
}
