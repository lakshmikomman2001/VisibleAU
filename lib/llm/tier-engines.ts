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
export const RUNS_MAX = 5;
export const PROMPTS_PER_AUDIT = 10;

export const TIER_RUNS_PER_PROMPT: Record<string, number> = {
  free: 5,
  starter: 5,
  growth: 5,
  agency: 5,
  agency_pro: 5,
  enterprise: 5,
};

function envRunsFor(tier: string): number | undefined {
  const envKey = `TIER_RUNS_${tier.toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.error(`${envKey}="${raw}" is not a valid number — ignoring`);
    return undefined;
  }
  return n;
}

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
  const fromEnv = envRunsFor(key);
  const base = fromEnv ?? TIER_RUNS_PER_PROMPT[key] ?? 5;
  return Math.max(RUNS_MIN, Math.min(RUNS_MAX, Math.round(base)));
}
