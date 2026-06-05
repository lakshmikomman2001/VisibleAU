import type { Tier } from "@/db/schema/enums";
import type { Engine } from "./interface";

export const TIER_ENGINES: Record<Tier, readonly Engine[]> = {
  free: ["chatgpt", "perplexity"],
  starter: ["chatgpt", "claude", "gemini", "perplexity"],
  growth: ["chatgpt", "claude", "gemini", "perplexity"],
  agency: ["chatgpt", "claude", "gemini", "perplexity"],
  agency_pro: ["chatgpt", "claude", "gemini", "perplexity"],
  enterprise: ["chatgpt", "claude", "gemini", "perplexity"],
} as const;

export function enginesForTier(tier: Tier): readonly Engine[] {
  return TIER_ENGINES[tier] ?? TIER_ENGINES.free;
}
