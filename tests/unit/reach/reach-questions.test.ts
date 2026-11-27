/**
 * S04 part 3 (LLD 8.4.2, 8.4.3; amendment 66): places and questions per reach, on invented businesses.
 * - NumbaTek IT, shaped like the IT-services client of audit #52 (managed IT services for businesses, Sydney NSW;
 *   amendment 66: an invented business): State questions name "NSW",
 *   Country questions "Australia" or "Australian", Worldwide questions no place; each passes the generator's checks and
 *   P03's (validateQuestion, with the reach's place words); never more than asked for.
 * - A Hobart business: Tasmania is written "Tasmania" in questions and on its label, never "TAS".
 * - The US stub has no country or states: only Local and Worldwide.
 * - Labels: "Local · Sydney", "NSW", "Tasmania", "Australia", "Worldwide".
 * - The market's Google location codes equal the cached DataForSEO list's.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AU_MARKET } from "@/lib/markets/au";
import { US_MARKET } from "@/lib/markets/us";
import { validateGeneratedQuestion } from "@/lib/prompts/validate-question";
import { questionTextKey } from "@/lib/questions/text-key";
import { validateQuestion } from "@/lib/questions/validate";
import { type BeyondLocal, brandReachQuestions, type ReachBrand } from "@/lib/reach/generate";
import {
  availableReaches,
  type BrandPlaceFields,
  placeForReach,
  reachLabel,
  reachPlaceWords,
} from "@/lib/reach/places";

const NUMBATEK: ReachBrand & BrandPlaceFields = {
  name: "NumbaTek IT",
  domain: "numbatekit.example.com.au",
  aliases: [],
  classification: {
    category: "general",
    service: "managed it services",
    buyerType: "smb",
    confidence: 0.9,
    intentSignals: [],
    competitors: [],
    auRelevance: "au_present",
  },
  categories: ["general"],
  audience: "businesses",
  suburb: "Mount Druitt",
  city: "Sydney",
  state: "NSW",
  postcode: null,
  region: "au",
  primaryRegions: ["NSW:Mount Druitt"],
};

const HOBART: ReachBrand & BrandPlaceFields = {
  ...NUMBATEK,
  name: "Quoll Plumbing",
  domain: "quollplumbing.example.com.au",
  classification: null,
  categories: ["trades_plumbing"],
  audience: "households",
  suburb: "Sandy Bay",
  city: "Hobart",
  state: "TAS",
  primaryRegions: ["TAS:Sandy Bay"],
};

function questions(
  brand: ReachBrand & BrandPlaceFields,
  reach: BeyondLocal,
  count = 10,
  market = AU_MARKET,
) {
  const place = placeForReach(reach, brand, market);
  if (!place) return [];
  return brandReachQuestions(brand, { reach, market, place, count });
}

function passesP03(brand: ReachBrand & BrandPlaceFields, reach: BeyondLocal, text: string) {
  const place = placeForReach(reach, brand, AU_MARKET) ?? {};
  const words = reachPlaceWords(reach, place, AU_MARKET);
  return validateQuestion(text, {
    brand: { name: brand.name, domain: brand.domain, aliases: brand.aliases },
    existingKeys: new Set(),
    brandedInSet: 0,
    maxBranded: 5,
    reach,
    places: words,
    fixPlace: words[0] ?? null,
    competitors: [],
  });
}

describe("NumbaTek IT (Sydney, NSW): questions per reach", () => {
  it("State names NSW (never the full name), in the business's own service words", () => {
    const q = questions(NUMBATEK, "state");
    expect(q.length).toBeGreaterThanOrEqual(8);
    for (const text of q) {
      expect(text).toMatch(/\bNSW\b/);
      expect(text).not.toMatch(/New South Wales|Sydney/);
      expect(text).toContain("managed IT services");
    }
    // A business audience reads the businesses' questions first.
    expect(q[0]).toBe("Can you recommend managed IT services for small businesses in NSW?");
  });

  it("Country names Australia or Australian; Worldwide names no place", () => {
    for (const text of questions(NUMBATEK, "country")) expect(text).toMatch(/\bAustralian?\b/);
    const worldwide = questions(NUMBATEK, "global");
    expect(worldwide.length).toBeGreaterThanOrEqual(8);
    for (const text of worldwide)
      expect(text).not.toMatch(/\b(Australia|Australian|NSW|Sydney|Mount Druitt)\b/);
  });

  it("every question passes the generator's checks and P03's, once each, and never more than asked", () => {
    for (const reach of ["state", "country", "global"] as const) {
      const q = questions(NUMBATEK, reach);
      expect(new Set(q.map(questionTextKey)).size).toBe(q.length);
      const place = placeForReach(reach, NUMBATEK, AU_MARKET) ?? {};
      const words = reachPlaceWords(reach, place, AU_MARKET);
      for (const text of q) {
        // A state or the country named in the words ("in NSW", "in Australia") is held to the check's location rule;
        // the adjective form ("for Australian small businesses") is its documented exception.
        const tokens = text.split(/[^\p{L}\p{N}]+/u);
        // words[0] is the state as questions write it, or the country's name (never the adjective).
        const named = reach !== "global" && tokens.includes(words[0]) ? words[0] : undefined;
        expect(validateGeneratedQuestion(text, named ?? "", named !== undefined).valid, text).toBe(
          true,
        );
        if (reach !== "global")
          expect(
            tokens.some((t) => words.includes(t)),
            text,
          ).toBe(true);
        const p03 = passesP03(NUMBATEK, reach, text);
        expect(p03.ok, `${text}: ${JSON.stringify(p03.checks)}`).toBe(true);
        expect(
          p03.checks.some((c) => c.id === "place"),
          text,
        ).toBe(false);
        expect(p03.kind).toBe("everyday");
      }
      expect(questions(NUMBATEK, reach, 3)).toEqual(q.slice(0, 3));
    }
  });
});

describe("a Hobart business: Tasmania", () => {
  it('is "Tasmania" in questions and on the label, never "TAS"', () => {
    const q = questions(HOBART, "state");
    expect(q.length).toBeGreaterThan(0);
    for (const text of q) {
      expect(text).toContain("Tasmania");
      expect(text).not.toMatch(/\bTAS\b/);
    }
    // A households business, its service with its article.
    expect(q[0]).toBe("Can you recommend a plumber in Tasmania?");
    expect(reachLabel("state", { state: "TAS" }, AU_MARKET)).toBe("Tasmania");
  });
});

describe("places and labels", () => {
  it("each reach's place and label", () => {
    expect(placeForReach("local", NUMBATEK, AU_MARKET)).toEqual({
      suburb: "Mount Druitt",
      city: "Sydney",
      state: "NSW",
    });
    expect(placeForReach("state", NUMBATEK, AU_MARKET)).toEqual({ state: "NSW" });
    expect(placeForReach("country", NUMBATEK, AU_MARKET)).toEqual({ country: "AU" });
    expect(placeForReach("global", NUMBATEK, AU_MARKET)).toEqual({});
    expect(reachLabel("local", { city: "Sydney", suburb: "Mount Druitt" }, AU_MARKET)).toBe(
      "Local · Sydney",
    );
    expect(reachLabel("local", { suburb: "Yennora" }, AU_MARKET)).toBe("Local · Yennora");
    expect(reachLabel("state", { state: "NSW" }, AU_MARKET)).toBe("NSW");
    expect(reachLabel("country", { country: "AU" }, AU_MARKET)).toBe("Australia");
    expect(reachLabel("global", {}, AU_MARKET)).toBe("Worldwide");
  });

  it("a brand with no state has no State reach; the US stub offers only Local and Worldwide", () => {
    expect(availableReaches({ ...NUMBATEK, state: null }, AU_MARKET)).toEqual([
      "local",
      "country",
      "global",
    ]);
    expect(availableReaches(NUMBATEK, US_MARKET)).toEqual(["local", "global"]);
    expect(questions(NUMBATEK, "state", 10, US_MARKET)).toEqual([]);
    expect(questions(NUMBATEK, "country", 10, US_MARKET)).toEqual([]);
  });

  it("the market's Google locations equal the cached DataForSEO list", () => {
    const cached = JSON.parse(
      readFileSync("lib/google-surfaces/data/dataforseo-au-locations.json", "utf8"),
    ) as { states: Record<string, number>; country: number };
    expect(AU_MARKET.country?.googleLocation.code).toBe(cached.country);
    expect(
      Object.fromEntries(AU_MARKET.states.map((s) => [s.code, s.googleLocation?.code])),
    ).toEqual(cached.states);
    expect(AU_MARKET.states.map((s) => s.capital)).toEqual([
      "Sydney",
      "Melbourne",
      "Brisbane",
      "Perth",
      "Adelaide",
      "Hobart",
      "Canberra",
      "Darwin",
    ]);
  });
});
