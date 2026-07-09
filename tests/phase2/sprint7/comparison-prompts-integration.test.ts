import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { enginesForTier, TIER_ENGINES } from "@/lib/llm/tier-engines";

const src = readFileSync(
  resolve(__dirname, "../../../inngest/functions/run-comparison-prompts.ts"),
  "utf-8",
);

describe("run-comparison-prompts integration (source analysis)", () => {
  it("triggers on audit.complete (dot form, not slash)", () => {
    expect(src).toContain('"audit.complete"');
    expect(src).not.toContain('"audit/complete"');
  });

  it("reads brand.competitors and returns early when empty", () => {
    expect(src).toContain("brand.competitors");
    expect(src).toContain("competitors.length === 0");
    expect(src).toContain("no_competitors");
  });

  it("reads subscriptions.tier (not organizations.tier)", () => {
    expect(src).toContain("subscriptions.tier");
    expect(src).not.toContain("organizations.tier");
  });

  it("uses enginesForTier to resolve engine list", () => {
    expect(src).toContain("enginesForTier");
  });

  it("inserts brand_won as nullable (no NOT NULL coercion)", () => {
    expect(src).toContain("brandWon: result.brandWon");
    expect(src).not.toContain("brandWon: result.brandWon!");
    expect(src).not.toContain("brandWon: result.brandWon ?? false");
  });

  it("uses stable step names for retry idempotency", () => {
    expect(src).toMatch(/step\.run\(`compare-\$\{competitorDomain\}-\$\{engine\}`/);
    expect(src).toMatch(/step\.run\(`persist-\$\{competitorDomain\}-\$\{engine\}`/);
  });

  it("has concurrency limit of 3", () => {
    expect(src).toMatch(/concurrency:\s*\{\s*limit:\s*3\s*\}/);
  });
});

describe("TIER_ENGINES mapping (behavioral)", () => {
  it("free tier → 2 engines (chatgpt, perplexity)", () => {
    const engines = enginesForTier("free");
    expect(engines).toHaveLength(2);
    expect(engines).toContain("chatgpt");
    expect(engines).toContain("perplexity");
  });

  it("growth tier → 4 engines (chatgpt, claude, gemini, perplexity)", () => {
    const engines = enginesForTier("growth");
    expect(engines).toHaveLength(4);
    expect(engines).toContain("chatgpt");
    expect(engines).toContain("claude");
    expect(engines).toContain("gemini");
    expect(engines).toContain("perplexity");
  });

  it("starter tier → same 4 engines as growth", () => {
    const engines = enginesForTier("starter");
    expect(engines).toHaveLength(4);
    expect([...engines].sort()).toEqual([...enginesForTier("growth")].sort());
  });

  it("unknown tier defaults to free (2 engines)", () => {
    const engines = enginesForTier("nonexistent");
    expect(engines).toHaveLength(2);
    expect(engines).toEqual(TIER_ENGINES.free);
  });
});
