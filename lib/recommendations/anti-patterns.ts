const BLOCKED_KEYS = new Set([
  "add-more-keywords",
  "pay-for-ai-ads",
  "submit-to-ai-engines",
  "get-more-backlinks",
  "use-ai-to-write-content",
  "update-meta-tags-for-ai",
  "improve-seo-generic",
  "buy-reviews",
  "create-ai-generated-reviews",
  "add-schema-without-entity",
  "target-competitor-terms",
  "run-more-audits",
]);

const BLOCKED_PATTERNS =
  /\b(buy reviews|purchase reviews|keyword.?stuff|meta.?tag.*AI|submit.*AI.?engine|more backlink|AI.?generated review)\b/i;

export function applyAntiPatternFilter<T extends { recommendationKey: string; action: string }>(
  recs: T[],
): T[] {
  return recs.filter(
    (r) => !BLOCKED_KEYS.has(r.recommendationKey) && !BLOCKED_PATTERNS.test(r.action),
  );
}
