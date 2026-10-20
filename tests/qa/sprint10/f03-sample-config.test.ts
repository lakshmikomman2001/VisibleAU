import { describe, expect, it } from "vitest";
import { SAMPLE_AUDIT_CONFIG } from "@/lib/sample-audit/config";

/**
 * Vunnara (sample-audit follow-up, 20 Oct) -- this file used to define
 * its OWN local, hardcoded copy of SAMPLE_AUDIT_CONFIG's shape (engines:
 * ["chatgpt"], promptsCount: 5, ...) instead of importing the real
 * module. That meant this test could never fail no matter how far the
 * real lib/sample-audit/config.ts drifted from reality -- which is
 * exactly what happened: engines/promptsCount/runsPerPrompt/
 * totalCallsExpected were declared but never actually wired into
 * execution (lib/sample-audit/run.ts never passed them to
 * runAuditInline), so the real sample ran the free tier's defaults (2
 * engines x the global 10-prompt count) while this "passing" test kept
 * asserting a 1-engine/5-prompt shape nothing ran. Now imports and
 * asserts against the real, now-load-bearing module.
 */
describe("F03: Sample audit config (HB2, PRD §7 Principle #6)", () => {
  it('F03-01: engines = ["chatgpt", "perplexity"] — exactly 2 engines, same as the free tier', () => {
    expect(SAMPLE_AUDIT_CONFIG.engines).toEqual(["chatgpt", "perplexity"]);
    expect(SAMPLE_AUDIT_CONFIG.engines.length).toBe(2);
  });

  it("F03-02: promptsCount = 6", () => {
    expect(SAMPLE_AUDIT_CONFIG.promptsCount).toBe(6);
  });

  it("F03-03: runsPerPrompt = 1 (no Wilson CI for sample)", () => {
    expect(SAMPLE_AUDIT_CONFIG.runsPerPrompt).toBe(1);
  });

  it("F03-04: totalCallsExpected = 12 (2 engines x 6 prompts x 1 run)", () => {
    expect(SAMPLE_AUDIT_CONFIG.totalCallsExpected).toBe(
      SAMPLE_AUDIT_CONFIG.engines.length *
        SAMPLE_AUDIT_CONFIG.promptsCount *
        SAMPLE_AUDIT_CONFIG.runsPerPrompt,
    );
    expect(SAMPLE_AUDIT_CONFIG.totalCallsExpected).toBe(12);
  });

  it("F03-05: estimatedCostAud = 0.70 AUD", () => {
    expect(SAMPLE_AUDIT_CONFIG.estimatedCostAud).toBe(0.7);
  });

  it("F03-06: estimatedCostAud ≤ SAMPLE_AUDIT_COST_CAP_AUD env var", () => {
    const cap = parseFloat(process.env.SAMPLE_AUDIT_COST_CAP_AUD ?? "1.00");
    expect(SAMPLE_AUDIT_CONFIG.estimatedCostAud).toBeLessThanOrEqual(cap);
  });

  it("F03-07: cost in USD is comfortably under US$1", () => {
    const fx = parseFloat(process.env.FX_AUD_USD ?? "0.66");
    const costUsd = SAMPLE_AUDIT_CONFIG.estimatedCostAud * fx;
    expect(costUsd).toBeLessThan(1);
  });

  it("F03-08: estimatedDurationSec = 30 seconds (typical, full parallelism -- wall time tracks the slowest call, not the sum)", () => {
    expect(SAMPLE_AUDIT_CONFIG.estimatedDurationSec).toBe(30);
  });

  it("F03-09: engines are exactly chatgpt + perplexity (not claude/gemini -- never introduce a third engine here without a deliberate decision)", () => {
    expect(SAMPLE_AUDIT_CONFIG.engines.includes("chatgpt")).toBe(true);
    expect(SAMPLE_AUDIT_CONFIG.engines.includes("perplexity")).toBe(true);
    expect((SAMPLE_AUDIT_CONFIG.engines as readonly string[]).includes("claude")).toBe(false);
    expect((SAMPLE_AUDIT_CONFIG.engines as readonly string[]).includes("gemini")).toBe(false);
  });

  // Vunnara (sample-audit follow-up, 20 Oct), item 2: the whole reason
  // this follow-up exists -- the sample must plan for enough answers to
  // clear MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10) even with up to 2
  // engine failures.
  it("F03-10: totalCallsExpected is at least MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE + 2 (room for 2 failures)", async () => {
    const { MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE } = await import("@/lib/scoring/dimension-result");
    expect(SAMPLE_AUDIT_CONFIG.totalCallsExpected).toBeGreaterThanOrEqual(
      MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE + 2,
    );
  });
});
