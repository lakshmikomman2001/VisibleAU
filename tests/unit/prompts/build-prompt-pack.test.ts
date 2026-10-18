/**
 * Vunnara Build 1, Part E — buildPromptPack's new contract: a 10-
 * question organic budget that branded extras never eat into, drawn
 * evenly across every confirmed category, deterministically (no
 * Math.random()), with audience-aware phrasing so a households brand
 * never sees business-owner wording.
 */
import { describe, expect, it } from "vitest";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import type { BrandClassification } from "@/lib/types/brand";

const PLUMBER_BRAND = { name: "Bondi Plumbing", domain: "bondiplumbing.com.au" };
const PLUMBER_CLASSIFICATION: BrandClassification = {
  category: "trades_plumbing",
  buyerType: "consumer",
  audience: "households",
  confidence: 0.9,
  auRelevance: "au_strong",
  competitors: [],
  intentSignals: ["24 hour plumber Bondi"],
};

describe("buildPromptPack — organic budget (Part E.3/E.4)", () => {
  it("returns exactly 10 organic prompts plus branded extras on top, never fewer than 10 organic", () => {
    const pack = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: ["Eastern Plumbing Co"], categories: [] },
      "Bondi",
      10,
    );
    const organic = pack.filter((t) => !isBrandedPrompt(t, PLUMBER_BRAND));
    const branded = pack.filter((t) => isBrandedPrompt(t, PLUMBER_BRAND));

    // The 10-category-template budget is a FLOOR, never displaced by
    // branded extras -- an intentSignal-derived prompt (organic, no
    // brand name) can ride along for free on top of it, so the real
    // organic count is >= 10, never < 10.
    expect(organic.length).toBeGreaterThanOrEqual(10);
    // good choice + alternatives + 1 vs + 1 popular = 4 branded extras
    expect(branded.length).toBeGreaterThanOrEqual(3);
    expect(pack.length).toBe(organic.length + branded.length);
  });

  it("is deterministic -- calling it twice with the same seed produces the exact same pack", () => {
    const a = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: [] },
      "Bondi",
      10,
      "brand-id-123",
    );
    const b = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: [] },
      "Bondi",
      10,
      "brand-id-123",
    );
    expect(a).toEqual(b);
  });

  it("a different seed (different brand) can produce a different organic ordering", () => {
    const a = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: [] },
      "Bondi",
      10,
      "brand-id-AAA",
    );
    const b = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: [] },
      "Bondi",
      10,
      "brand-id-BBB",
    );
    expect(a).not.toEqual(b);
  });

  it("households audience: no organic or branded prompt contains business-owner phrasing", () => {
    const pack = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: ["Eastern Plumbing Co"], categories: [] },
      "Bondi",
      10,
    );
    for (const text of pack) {
      expect(text).not.toMatch(/for Australian (small )?businesses/i);
    }
  });

  it("draws evenly across multiple confirmed categories (round-robin, not just classification.category)", () => {
    const pack = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: ["trades_plumbing", "trades_electrical"] },
      "Bondi",
      10,
    );
    const organic = pack.filter((t) => !isBrandedPrompt(t, PLUMBER_BRAND));
    const hasElectrical = organic.some((t) => /electrician|switchboard|sparkie|EV charger/i.test(t));
    const hasPlumbing = organic.some((t) => /plumber|drain|pipe|tap|toilet|hot water/i.test(t));
    expect(hasElectrical).toBe(true);
    expect(hasPlumbing).toBe(true);
  });

  // Vunnara hotfix (18 Oct, post-df27ef8): the live Omega Services bug
  // -- classification.category is "trades_general_services" (not a
  // real CATEGORY_KEYS entry, resolves to the generic "general" label)
  // but the owner confirmed Plumbing + Electrical + General. The one
  // branded "good choice" prompt must name a confirmed category, never
  // fall back to the stale classifier guess once something's confirmed.
  it("the branded 'good choice' prompt uses a confirmed category label, never classification.category, once confirmed", () => {
    const omegaClassification: BrandClassification = {
      ...PLUMBER_CLASSIFICATION,
      category: "trades_general_services",
      confidence: 0.62,
    };
    const pack = buildPromptPack(
      omegaClassification,
      "Omega Services",
      "omegaservices.com.au",
      { competitors: [], categories: ["trades_plumbing", "trades_electrical", "trades_general"] },
      "Norwest",
      10,
    );
    const goodChoice = pack.find((t) => t.includes("good choice"));
    expect(goodChoice).toBeDefined();
    expect(goodChoice).toMatch(/plumb|electric/i);
    expect(goodChoice).not.toMatch(/general services/i);
  });

  it("falls back to classification.category alone when no categories are confirmed yet", () => {
    const pack = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: [] },
      "Bondi",
      10,
    );
    const organic = pack.filter((t) => !isBrandedPrompt(t, PLUMBER_BRAND));
    expect(organic.every((t) => /plumber|drain|pipe|tap|toilet|hot water|plumbing/i.test(t))).toBe(
      true,
    );
  });

  it("includes the new 'good choice' branded extra template", () => {
    const pack = buildPromptPack(
      PLUMBER_CLASSIFICATION,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: [] },
      "Bondi",
      10,
    );
    expect(pack).toContain("Is Bondi Plumbing a good choice for Plumbing in Bondi?");
  });
});
