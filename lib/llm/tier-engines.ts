import type { Engine } from "./interface";

export const TIER_ENGINES: Record<string, readonly Engine[]> = {
  free: ["chatgpt", "perplexity"],
  starter: ["chatgpt", "claude", "gemini", "perplexity"],
  growth: ["chatgpt", "claude", "gemini", "perplexity"],
  agency: ["chatgpt", "claude", "gemini", "perplexity"],
  agency_pro: ["chatgpt", "claude", "gemini", "perplexity"],
  enterprise: ["chatgpt", "claude", "gemini", "perplexity"],
} as const;

export const TIER_RUNS_PER_PROMPT: Record<string, number> = {
  free: 1,
  starter: 3,
  growth: 5,
  agency: 5,
  agency_pro: 5,
  enterprise: 5,
};

export function enginesForTier(tier: string | null | undefined): readonly Engine[] {
  const key = String(tier ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const engines = TIER_ENGINES[key];
  if (!engines) {
    console.error(`enginesForTier: unknown tier "${tier}" → defaulting to free`);
    return TIER_ENGINES.free;
  }
  return engines;
}

export function runsForTier(tier: string | null | undefined): number {
  const key = String(tier ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return TIER_RUNS_PER_PROMPT[key] ?? 1;
}
