import { AI_BOTS, type BotRole } from "@/db/seed/ai-bots/seed";

export type AiBot = (typeof AI_BOTS)[number];

/**
 * 20 Nov (part 2): grouped by what each is for (db/seed/ai-bots/seed.ts). There's no "must allow" tier any more: it
 * was the training crawlers and Google-Extended, and only the search crawlers count toward the robots.txt score.
 */
export function getBotsByRole(role: BotRole): AiBot[] {
  return AI_BOTS.filter((b) => b.role === role);
}

export function getAllBots(): readonly AiBot[] {
  return AI_BOTS;
}
