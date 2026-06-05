const CONFIDENCE_LEVELS: Record<string, "confirmed" | "likely" | "hypothesis"> = {
  "wikipedia-article": "confirmed",
  "au-local-citations": "confirmed",
  "stale-content": "confirmed",
  "faq-content": "likely",
  "expert-quotes": "likely",
  "cited-statistics": "likely",
  "reddit-absence": "likely",
  "press-mentions": "likely",
  "comparison-article": "hypothesis",
  "medium-presence": "hypothesis",
  "linkedin-presence": "hypothesis",
};

export function classifyConfidence(key: string): "confirmed" | "likely" | "hypothesis" {
  return CONFIDENCE_LEVELS[key] ?? "hypothesis";
}
