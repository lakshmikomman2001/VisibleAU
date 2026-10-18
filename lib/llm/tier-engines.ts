import type { Engine } from "./interface";

export const TIER_ENGINES: Record<string, readonly Engine[]> = {
  free: ["chatgpt", "perplexity"],
  starter: ["chatgpt", "claude", "gemini", "perplexity"],
  growth: ["chatgpt", "claude", "gemini", "perplexity"],
  agency: ["chatgpt", "claude", "gemini", "perplexity"],
  agency_pro: ["chatgpt", "claude", "gemini", "perplexity"],
  enterprise: ["chatgpt", "claude", "gemini", "perplexity"],
} as const;

export const RUNS_MIN = 1;
// Vunnara Build 1, Part F.1: kept only as the historical ceiling
// app/api/brands/[brandId]/evidence/route.ts over-fetches against --
// rows written before this fix may still be up to 5x replay-inflated,
// and that route needs enough raw rows to find DISPLAY_LIMIT distinct
// responses even from old data. It no longer bounds anything new.
export const RUNS_MAX = 5;
export const PROMPTS_PER_AUDIT = 10;

// Vunnara Build 1, Part F.1: the single constant -- one real LLM call
// per (engine, prompt), always. The old per-tier table (TIER_RUNS_PER_
// PROMPT, all values 5) plus a TIER_RUNS_<TIER> env override existed
// to tune a REPLAY count, but the LLM cache key is sha256(prompt +
// model) with no run index, so every run after the first was never an
// independent sample -- it replayed run 1's exact cached response
// (lib/llm/cache.ts). That inflated totalCalls, citations row counts,
// and usage/quota counters 5x for zero additional measurement. Removed
// entirely rather than left as a dead but re-enablable footgun.
export const RUNS_PER_PROMPT = 1;

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

/**
 * Vunnara Build 1, Part F.1: always RUNS_PER_PROMPT (1), regardless of
 * tier -- kept as a function (rather than inlining the constant at
 * every call site) only so run-audit-inline.ts and inngest/functions/
 * run-audit.ts keep reading "the number of runs" from one named call,
 * not a bare literal, if a real per-tier need ever comes back.
 */
export function runsForTier(_tier: string | null | undefined): number {
  return RUNS_PER_PROMPT;
}
