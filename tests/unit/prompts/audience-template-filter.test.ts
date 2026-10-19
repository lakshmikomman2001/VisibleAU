import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPromptPack, buildTaggedOrganicPrompts } from "@/lib/prompts/build-prompt-pack";
import {
  CATEGORY_KEYS,
  getTemplatesForCategory,
  TEMPLATE_AUDIENCE_OVERRIDES,
} from "@/lib/prompts/templates";
import type { Audience, BrandClassification } from "@/lib/types/brand";

/**
 * Vunnara hotfix 3 follow-up (post-e99602b): Omega's confirmed
 * audience is "households", but its pack included "Best plumbing
 * companies for commercial fitouts in Norwest, NSW?" -- a
 * businesses-buyer question. Root cause: CATEGORY_TEMPLATES' buckets
 * are keyed by BUYER TYPE (smb/consumer/...), never by households-vs-
 * businesses audience, and every trades/allied-health category only
 * defines an `smb` bucket -- bucketOrderForAudience's households-first
 * preference always fell through to it, mix of household and
 * business wording included. Fixed via TEMPLATE_AUDIENCE_OVERRIDES
 * (templates.ts), consulted by getTemplatesForCategory before the
 * quota draw.
 */

function makeClassification(category: string, buyerType = "smb"): BrandClassification {
  return {
    category,
    buyerType: buyerType as BrandClassification["buyerType"],
    confidence: 0.9,
    auRelevance: "au_present",
    competitors: [],
    intentSignals: [],
  };
}

describe("getTemplatesForCategory -- no business-tagged template reaches households, and the reverse", () => {
  for (const [category, overrides] of Object.entries(TEMPLATE_AUDIENCE_OVERRIDES)) {
    for (const [template, taggedAudience] of Object.entries(overrides ?? {})) {
      const opposite: Audience = taggedAudience === "households" ? "businesses" : "households";

      it(`${category}: "${template}" (tagged ${taggedAudience}) never reaches a ${opposite} brand`, () => {
        const templates = getTemplatesForCategory(category, "smb", opposite);
        expect(templates).not.toContain(template);
      });

      it(`${category}: "${template}" still reaches its own tagged audience (${taggedAudience})`, () => {
        const templates = getTemplatesForCategory(category, "smb", taggedAudience);
        expect(templates).toContain(template);
      });

      it(`${category}: "${template}" reaches a 'both' brand`, () => {
        const templates = getTemplatesForCategory(category, "smb", "both");
        expect(templates).toContain(template);
      });
    }
  }
});

describe("Omega's fixture -- 4/3/3, no commercial/fitout wording for its households audience", () => {
  const omegaClassification: BrandClassification = {
    category: "trades_general_services",
    buyerType: "smb",
    confidence: 0.62,
    auRelevance: "au_present",
    competitors: [],
    intentSignals: [],
  };
  const categories = ["trades_plumbing", "trades_electrical", "trades_general"];

  it("still allocates 4/3/3 once the commercial-fitouts template is excluded", () => {
    const tagged = buildTaggedOrganicPrompts(
      omegaClassification,
      categories,
      "households",
      "Norwest, NSW",
      10,
      "omega-services-real-brand-id",
    );
    const counts = { trades_plumbing: 0, trades_electrical: 0, trades_general: 0 };
    for (const t of tagged) counts[t.category as keyof typeof counts]++;
    expect(counts).toEqual({ trades_plumbing: 4, trades_electrical: 3, trades_general: 3 });
  });

  it("no question in Omega's households pack carries commercial/fitout wording", () => {
    const pack = buildPromptPack(
      omegaClassification,
      "Omega Services",
      "omegaservices.com.au",
      { competitors: [], categories, audience: "households" },
      "Norwest, NSW",
      10,
      "omega-services-real-brand-id",
    );
    for (const text of pack) {
      expect(text).not.toMatch(/commercial fitout/i);
    }
  });
});

describe("trades categories keep at least 4 valid household templates after filtering", () => {
  for (const category of ["trades_plumbing", "trades_electrical", "trades_building", "trades_general"]) {
    it(`${category}: at least 4 household-eligible templates remain`, () => {
      const templates = getTemplatesForCategory(category, "smb", "households");
      expect(templates.length).toBeGreaterThanOrEqual(4);
    });
  }
});

describe("buildPromptPack -- every category x audience either hits 10 organic, or logs the shortfall", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  const AUDIENCES: Audience[] = ["households", "businesses"];

  for (const category of CATEGORY_KEYS) {
    for (const audience of AUDIENCES) {
      it(`${category} @ ${audience}: 10 organic questions, or a logged shortfall`, () => {
        warnSpy.mockClear();
        const classification = makeClassification(category);
        const tagged = buildTaggedOrganicPrompts(
          classification,
          [category],
          audience,
          "Norwest, NSW",
          10,
          `audience-sweep-${category}-${audience}`,
        );
        const loggedShortfall = warnSpy.mock.calls.some((call: unknown[]) =>
          String(call[0]).includes("short of"),
        );
        expect(
          tagged.length >= 10 || loggedShortfall,
          `${category} @ ${audience}: ${tagged.length} organic questions and no shortfall logged`,
        ).toBe(true);
      });
    }
  }
});
