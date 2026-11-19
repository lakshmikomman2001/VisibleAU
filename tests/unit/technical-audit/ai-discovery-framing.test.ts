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

  it("task HHH: the bold 'emerging' has an explicit space before 'AI-discovery', not a JSX whitespace-collapse gap", () => {
    // A plain source-text check for "emerging" (above) can't catch this --
    // the source already contained a literal space character; the bug was
    // JSX collapsing it away at render time ("emergingAI-discovery"). The
    // fix forces the space with an explicit {" "} expression, which this
    // asserts directly rather than trusting JSX whitespace rules again.
    // 6 Nov: Biome now keeps the sentence on one line, where a plain space
    // after </strong> is kept by JSX (only a line break collapses); it
    // writes {" "} itself whenever it breaks the line there. Either form.
    expect(src).toMatch(/<strong>emerging<\/strong>(\{" "\}|[ ](?=\S))/);
  });

  // 19 Nov (Sri's review): ai.txt's draft is an individual Internet-Draft, "not endorsed by the IETF", so it isn't
  // tagged a standard; the three /ai/ files are Vunnara's own format and optional.
  it("tags ai.txt as a proposal (an individual Internet-Draft), the other three as Vunnara's own, optional", () => {
    expect(src).toMatch(/Proposal · individual Internet-Draft/);
    expect(src).not.toMatch(/Emerging standard/);
    const vunnaraTagCount = (src.match(/Vunnara's own format · optional/g) ?? []).length;
    expect(vunnaraTagCount).toBe(3);
  });

  it("the score is out of this audit's own maximum, and every row's points come from the scorer", () => {
    expect(src).toMatch(/const max = aiDiscoveryMaxFor\(findings\);/);
    expect(src).toMatch(/`\$\{score\}\/\$\{max\}`/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiTxt/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiFaq/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiSummary/);
    expect(src).toMatch(/AI_DISCOVERY_WEIGHTS\.aiService/);
    expect(src).toMatch(/present \? ep\.weight : 0\}\/\{ep\.weight\}/);
    // An optional file (weight 0) says it isn't scored, never "0/0".
    expect(src).toMatch(/checked && ep\.weight === 0/);
    expect(src).toMatch(/not scored/);
  });
});

describe("⚠️ GGG — Technical Audit overview: 'emerging' label added, dimension untouched", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/technical-audit/page.tsx", "utf8");

  it("marks only the AI Discovery dimension as emerging", () => {
    expect(src).toMatch(/key:\s*"scoreAiDiscovery"[\s\S]{0,400}emerging:\s*true/);
    // No other dimension in DIM_META should carry this flag.
    expect((src.match(/emerging:\s*true/g) ?? []).length).toBe(1);
  });

  it("the AI Discovery entry's max is an older audit's 6; each audit's own comes from aiDiscoveryMaxFor", () => {
    expect(src).toMatch(/key:\s*"scoreAiDiscovery"[\s\S]{0,80}max:\s*6/);
    expect(src).toMatch(/dim\.key === "scoreAiDiscovery" \? aiDiscoveryMax : dim\.max/);
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

  it("states the three JSON endpoints are Vunnara's own format, optional, read by no AI engine we know of", () => {
    expect(src).toMatch(/Vunnara's own format/);
    expect(src).toMatch(/OPTIONAL_AI_FILES_LABEL/);
    expect(src).toMatch(/they don't count toward any score/);
  });
});

describe("⚠️ GGG — scoring: ai.txt's 3 points; the /ai/ files 0 from 19 Nov", () => {
  it("AI_DISCOVERY_WEIGHTS is 3/0/0/0 (Sri, 19 Nov: their absence must not lower any score)", () => {
    expect(AI_DISCOVERY_WEIGHTS).toEqual({ aiTxt: 3, aiSummary: 0, aiFaq: 0, aiService: 0 });
  });

  it("computeTechnicalComposite still sums AI Discovery's full contribution, now into /98", () => {
    // Vunnara (21 Oct, "directory listings... never scraping", Part A3):
    // scoreBrandEntity's own max dropped 10 -> 8 (the directory signal
    // removed entirely, not rescaled -- see lib/brand-entity/score.ts),
    // so the real achievable composite max is now 98, not 100. This is
    // the one fixture that actually changes; Bondi's real historical
    // shape below (scoreBrandEntity: 2, well under either max) does not.
    const dims: TechnicalAuditDimensions = {
      scoreRobots: 18,
      scoreLlmsTxt: 18,
      scoreSchema: 16,
      scoreMeta: 14,
      scoreContent: 12,
      scoreBrandEntity: 8,
      scoreSignals: 6,
      scoreAiDiscovery: 6,
    };
    expect(computeTechnicalComposite(dims)).toBe(98);

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
