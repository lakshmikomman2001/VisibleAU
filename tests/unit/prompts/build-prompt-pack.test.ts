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
  it("returns exactly 10 organic prompts plus branded extras on top, never more or fewer than 10 organic", () => {
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

    // Vunnara hotfix 2 (19 Oct, post-609e323), item 3: EXACTLY 10, not
    // "at least 10" -- the intentSignal-derived prompt (organic, no
    // brand name) now counts AGAINST this budget instead of riding
    // along for free on top of it (the bug: Omega's real pack had 12
    // organic, not 10).
    expect(organic.length).toBe(10);
    // good choice + alternatives + 1 vs + 1 popular = 4 branded extras
    expect(branded.length).toBeGreaterThanOrEqual(3);
    expect(pack.length).toBe(organic.length + branded.length);
  });

  // Vunnara hotfix 2 (19 Oct, post-609e323), item 3: a brand with
  // enough category templates AND 2 valid intentSignals to exceed 10
  // organic candidates combined -- the organic slice must still cap
  // at exactly PROMPTS_PER_AUDIT (10), proving the merge-then-slice
  // fix, not just that one signal happens to fit under the old,
  // uncapped behaviour.
  it("caps organic at exactly 10 even when category templates + intentSignals together exceed 10 candidates", () => {
    const classification: BrandClassification = {
      ...PLUMBER_CLASSIFICATION,
      intentSignals: ["24 hour plumber Bondi", "emergency plumber Bondi"],
    };
    const pack = buildPromptPack(
      classification,
      PLUMBER_BRAND.name,
      PLUMBER_BRAND.domain,
      { competitors: [], categories: ["trades_plumbing", "trades_electrical"] },
      "Bondi",
      10,
    );
    const organic = pack.filter((t) => !isBrandedPrompt(t, PLUMBER_BRAND));
    expect(organic.length).toBe(10);
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
    // Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 3: a natural
    // service phrase ("a plumber"), never the raw CATEGORY_LABELS
    // value ("Plumbing") mid-sentence -- see no-raw-category-label.test.ts
    // for the full sweep across every category.
    expect(pack).toContain("Is Bondi Plumbing a good choice for a plumber in Bondi?");
  });
});
