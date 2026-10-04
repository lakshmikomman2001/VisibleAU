/**
 * ⚠️ GGG — AI Discovery is reframed as "emerging/recommended" (copy and
 * display only, per Sri's decision after task FFF Part C). This file
 * proves two things:
 *   1. The framing/provenance copy actually exists on the two pages.
 *   2. Scoring is byte-for-byte unchanged -- AI_DISCOVERY_WEIGHTS, the
 *      dimension's /6 max, and the composite /100 calculation are all
 *      untouched by this task.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_DISCOVERY_WEIGHTS } from "@/lib/ai-discovery/endpoints";
import { computeTechnicalComposite } from "@/lib/technical-audit/score-aggregator";
import type { TechnicalAuditDimensions } from "@/lib/technical-audit/types";

describe("⚠️ GGG — AI Discovery page: emerging framing + provenance tags present", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/ai-discovery/page.tsx", "utf8");

  it("shows the emerging-framing note under the header", () => {
    expect(src).toMatch(/emerging/i);
    expect(src).toMatch(/not a fix for a standards violation/i);
  });

  it("tags ai.txt as grounded in the IETF draft, the other three as Vunnara-recommended", () => {
    expect(src).toMatch(/Emerging standard · IETF draft/);
    const vunnaraTagCount = (src.match(/Vunnara-recommended format/g) ?? []).length;
    expect(vunnaraTagCount).toBe(3);
  });

  it("the score and every denominator are untouched by the framing change", () => {
    expect(src).toMatch(/\{score\}\/6/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiTxt/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiFaq/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiSummary/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiService/);
    expect(src).toMatch(/present \? ep\.weight : 0\}\/\{ep\.weight\}/);
  });
});

describe("⚠️ GGG — Technical Audit overview: 'emerging' label added, dimension untouched", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/technical-audit/page.tsx", "utf8");

  it("marks only the AI Discovery dimension as emerging", () => {
    expect(src).toMatch(/key:\s*"scoreAiDiscovery"[\s\S]{0,400}emerging:\s*true/);
    // No other dimension in DIM_META should carry this flag.
    expect((src.match(/emerging:\s*true/g) ?? []).length).toBe(1);
  });

  it("the AI Discovery entry's scoring fields (key/max) are unchanged", () => {
    expect(src).toMatch(/key:\s*"scoreAiDiscovery"[\s\S]{0,80}max:\s*6/);
  });
});

describe("⚠️ GGG — methodology page: honest entry added, no fabricated authority", () => {
  const src = readFileSync("app/(marketing)/methodology/page.tsx", "utf8");

  it("cites the real, verified IETF draft for ai.txt (confirmed live: specifies /.well-known/ai.txt)", () => {
    expect(src).toMatch(
      /https:\/\/datatracker\.ietf\.org\/doc\/html\/draft-car-ai-txt-wellknown-00/,
    );
  });

  it("does not cite Auriti-Labs as an authority", () => {
    expect(src).not.toMatch(/Auriti/i);
  });

  it("states the three JSON endpoints are Vunnara's own recommendation, not a standard", () => {
    expect(src).toMatch(/Vunnara-recommended/i);
    expect(src).toMatch(/not yet an industry standard/i);
  });
});

describe("⚠️ GGG — scoring is numerically unchanged (label-only change)", () => {
  it("AI_DISCOVERY_WEIGHTS is still 3/1/1/1", () => {
    expect(AI_DISCOVERY_WEIGHTS).toEqual({ aiTxt: 3, aiSummary: 1, aiFaq: 1, aiService: 1 });
  });

  it("computeTechnicalComposite still sums AI Discovery's full contribution into /100", () => {
    const dims: TechnicalAuditDimensions = {
      scoreRobots: 18,
      scoreLlmsTxt: 18,
      scoreSchema: 16,
      scoreMeta: 14,
      scoreContent: 12,
      scoreBrandEntity: 10,
      scoreSignals: 6,
      scoreAiDiscovery: 6,
    };
    expect(computeTechnicalComposite(dims)).toBe(100);

    // Bondi's real shape (task JJ/KK/EEE): AI Discovery contributes 0,
    // composite reflects exactly that -- no label-driven adjustment.
    const bondiShape: TechnicalAuditDimensions = {
      ...dims,
      scoreRobots: 18,
      scoreLlmsTxt: 9,
      scoreSchema: 0,
      scoreMeta: 6,
      scoreContent: 6,
      scoreBrandEntity: 2,
      scoreSignals: 0,
      scoreAiDiscovery: 0,
    };
    expect(computeTechnicalComposite(bondiShape)).toBe(41);
  });
});
