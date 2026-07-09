type BuyerStage = "awareness" | "consideration" | "decision";

const DECISION_PATTERNS = [
  /\bshould i\b/i,
  /\bhow do i (book|buy|order|sign up|get started|hire|engage)\b/i,
  /\bready to\b/i,
  /\bworth (it|the price|paying)\b/i,
  /\bswitch to\b/i,
];

const CONSIDERATION_PATTERNS = [
  /\bcompare\b/i,
  /\bvs\b/i,
  /\bversus\b/i,
  /\bcompar/i,
  /\bdifference between\b/i,
  /\bbetter than\b/i,
  /\bpros and cons\b/i,
  /\breview/i,
  /\bpricing\b/i,
  /\balternative/i,
];

export function classifyIntent(prompt: string): BuyerStage {
  if (DECISION_PATTERNS.some((p) => p.test(prompt))) return "decision";
  if (CONSIDERATION_PATTERNS.some((p) => p.test(prompt))) return "consideration";
  return "awareness";
}
