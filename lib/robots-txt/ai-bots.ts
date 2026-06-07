import { AI_BOTS } from "@/db/seed/ai-bots/seed";

export type AiBot = (typeof AI_BOTS)[number];

export const TIER_1_MUST_ALLOW = AI_BOTS.filter((b) => b.tier === 1 && b.defaultAllow);

export function getBotsByTier(tier: 1 | 2 | 3) {
  return AI_BOTS.filter((b) => b.tier === tier);
}

export function getAllBots() {
  return AI_BOTS;
}
