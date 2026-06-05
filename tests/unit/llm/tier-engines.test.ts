import { describe, expect, it } from "vitest";
import { enginesForTier, TIER_ENGINES } from "@/lib/llm/tier-engines";

describe("TIER_ENGINES", () => {
  it("Free tier returns exactly ChatGPT + Perplexity (2 engines)", () => {
    expect(enginesForTier("free")).toEqual(["chatgpt", "perplexity"]);
    expect(enginesForTier("free")).toHaveLength(2);
  });
  it.each([
    "starter",
    "growth",
    "agency",
    "agency_pro",
    "enterprise",
  ] as const)("%s tier returns all 4 engines", (tier) => {
    expect(enginesForTier(tier)).toEqual(["chatgpt", "claude", "gemini", "perplexity"]);
    expect(enginesForTier(tier)).toHaveLength(4);
  });
  it("every Tier enum value has an entry", () => {
    const tiers = ["free", "starter", "growth", "agency", "agency_pro", "enterprise"] as const;
    for (const t of tiers) expect(TIER_ENGINES[t]).toBeDefined();
  });
  it("unknown tier falls back to free (2 engines)", () => {
    expect(enginesForTier("nonexistent" as never)).toEqual(["chatgpt", "perplexity"]);
  });
});
