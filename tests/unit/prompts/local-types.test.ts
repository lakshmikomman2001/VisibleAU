/**
 * 16 Nov, part 2 -- common local businesses have types of their own: a café (not a restaurant), a gym, a hair or
 * beauty salon, a local shop (not an e-commerce platform) and an accountant or bookkeeper (not accounting software).
 * Each asks local questions in its own words, is checked against the six local directories, and the classifier's
 * aliases land on it. And no type's questions borrow another's words: no plumber, restaurant or software where they
 * don't belong.
 */
import { describe, expect, it } from "vitest";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { getDirectoriesForBrand } from "@/lib/directories/registry";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import {
  CATEGORY_KEYS,
  CATEGORY_TEMPLATES,
  type CategoryKey,
  getTemplatesForCategory,
  resolveCategory,
} from "@/lib/prompts/templates";
import type { Audience, BrandClassification } from "@/lib/types/brand";

const NEW_TYPES = [
  "cafe",
  "fitness_gym",
  "beauty_salon",
  "retail_shop",
  "accounting_practice",
] as const;

/** Each local type's own words -- and so the words no other type may use. */
const OWN_WORDS: Array<{ types: readonly CategoryKey[]; words: RegExp }> = [
  {
    types: ["trades_plumbing", "trades_electrical", "trades_building", "trades_general"],
    words: /plumb|electric|builder|tradie|handyman|renovat/i,
  },
  {
    types: [
      "allied_health_dental",
      "allied_health_physio",
      "allied_health_mental",
      "allied_health_general",
    ],
    words: /dentist|dental|physio|psycholog|counsell|allied health/i,
  },
  { types: ["legal_services"], words: /lawyer|solicitor|conveyanc|\blegal\b/i },
  { types: ["real_estate_agency"], words: /real estate|property manag|selling agent/i },
  { types: ["hospitality_restaurant"], words: /restaurant|dinner/i },
  { types: ["cafe"], words: /caf[eé]|coffee|brunch/i },
  { types: ["fitness_gym"], words: /\bgyms?\b|fitness|personal trainer/i },
  { types: ["beauty_salon"], words: /salon|\bhair|\bnail|beauty|barber/i },
  { types: ["retail_shop"], words: /\bshops?\b|shop local|shopping/i },
  { types: ["accounting_practice"], words: /accountant|bookkeep|tax agent|tax return|\bBAS\b/i },
];
const SOFTWARE_WORDS = /software|platform|\bapps?\b|\btools?\b|SaaS/i;
const LOCAL_TYPES = [...OWN_WORDS.flatMap((g) => g.types), "general"] as readonly CategoryKey[];
const SOFTWARE_TYPES = CATEGORY_KEYS.filter((k) => !LOCAL_TYPES.includes(k));

function classification(category: string, service: string | undefined, audience: Audience) {
  const c: BrandClassification = {
    category,
    buyerType: audience === "businesses" ? "smb" : "consumer",
    audience,
    intentSignals: [],
    competitors: [],
    auRelevance: "au_present",
    confidence: 0.9,
    ...(service ? { service } : {}),
  };
  return c;
}

/** One sample business's everyday questions, as lib/audit/get-audit-prompts.ts builds them. */
function everyday(name: string, category: string, service: string | undefined, suburb: string) {
  const region = resolveRegionLabel({
    suburb,
    city: "Sydney",
    state: "NSW",
    primaryRegions: [],
    region: "au",
  });
  const pack = buildPromptPack(
    classification(category, service, "both"),
    name,
    "example.com.au",
    { competitors: [], categories: [category], audience: "both" },
    region,
    10,
    `seed-${name}`,
  );
  return { organic: pack.slice(0, -3), goodChoice: pack[pack.length - 3] };
}

const SAMPLES = [
  {
    name: "Harbour Bean",
    type: "cafe",
    service: "café",
    suburb: "Parramatta",
    own: /caf[eé]|coffee|brunch|breakfast/i,
  },
  {
    name: "Chatswood Strength Co",
    type: "fitness_gym",
    service: "gym",
    suburb: "Chatswood",
    own: /gym|fitness|trainer|strength/i,
  },
  {
    name: "Bondi Hair Studio",
    type: "beauty_salon",
    service: "hair salon",
    suburb: "Bondi",
    own: /hair salon/i,
  },
  {
    name: "Newtown Gift Co",
    type: "retail_shop",
    service: "gift shop",
    suburb: "Newtown",
    own: /gift shop|shop local/i,
  },
  {
    name: "Penrith Tax & Advisory",
    type: "accounting_practice",
    service: "accountant",
    suburb: "Penrith",
    own: /accountant|bookkeep|tax/i,
  },
  {
    name: "Parramatta Pooch Spa",
    type: "general",
    service: "dog groomer",
    suburb: "Parramatta",
    own: /dog groomer/i,
  },
] as const;

describe("a sample business of each new type asks local questions in its own words", () => {
  it.each(SAMPLES)("$name ($type, $suburb)", ({ name, type, service, suburb, own }) => {
    const { organic, goodChoice } = everyday(name, type, service, suburb);
    expect(organic.length).toBeGreaterThanOrEqual(10);
    const others = OWN_WORDS.filter((g) => !g.types.includes(type as CategoryKey));
    for (const q of organic) {
      expect(q, q).toContain(suburb);
      expect(q, q).toMatch(own);
      for (const g of others) expect(q, `${q} borrows ${g.types[0]}'s words`).not.toMatch(g.words);
      expect(q, q).not.toMatch(SOFTWARE_WORDS);
    }
    expect(goodChoice).toMatch(new RegExp(`^Is ${name} a good choice for an? \\S`));
  });

  it("a café is never a restaurant, and a restaurant never a café", () => {
    const cafe = everyday("Harbour Bean", "cafe", "café", "Parramatta").organic;
    const restaurant = everyday(
      "Harbour Table",
      "hospitality_restaurant",
      undefined,
      "Parramatta",
    ).organic;
    for (const q of cafe) expect(q, q).not.toMatch(/restaurant/i);
    for (const q of restaurant) expect(q, q).not.toMatch(/caf[eé]|brunch|coffee/i);
  });

  it("an accountant's households and business owners each get at least 10 questions of their own", () => {
    const households = getTemplatesForCategory("accounting_practice", "consumer", "households");
    const businesses = getTemplatesForCategory("accounting_practice", "smb", "businesses");
    expect(households.length).toBeGreaterThanOrEqual(10);
    expect(businesses.length).toBeGreaterThanOrEqual(10);
    expect(households.join(" ")).not.toMatch(/sole trader|BAS|payroll|company or trust/);
    expect(businesses.join(" ")).not.toMatch(/individual tax|family tax|rental property/);
  });
});

describe("the new types", () => {
  it("each has at least 10 local templates, every one naming {region}", () => {
    for (const type of NEW_TYPES) {
      const all = Object.values(CATEGORY_TEMPLATES[type] ?? {}).flat();
      expect(all.length, type).toBeGreaterThanOrEqual(10);
      for (const t of all) expect(t, `${type}: ${t}`).toContain("{region}");
    }
  });

  it("are where the classifier's words land: retail, accounting, gym, salon and café are local, not software", () => {
    expect(resolveCategory("retail")).toBe("retail_shop");
    expect(resolveCategory("accounting")).toBe("accounting_practice");
    expect(resolveCategory("bookkeeping")).toBe("accounting_practice");
    expect(resolveCategory("gym")).toBe("fitness_gym");
    expect(resolveCategory("salon")).toBe("beauty_salon");
    expect(resolveCategory("cafe")).toBe("cafe");
    expect(resolveCategory("café")).toBe("cafe");
    // Software keeps its own keys.
    expect(resolveCategory("accounting_software")).toBe("accounting_software");
    expect(resolveCategory("ecommerce")).toBe("ecommerce_platform");
  });

  it("are checked against the six local directories, never the tradie ones", () => {
    for (const type of NEW_TYPES) {
      const names = getDirectoriesForBrand("au", [type]).map((d) => d.name);
      expect(names, type).toHaveLength(6);
      for (const tradie of ["hipages", "ServiceSeeking", "Oneflare", "Airtasker"]) {
        expect(names, type).not.toContain(tradie);
      }
    }
  });
});

describe("guard: no type borrows another's words", () => {
  /** Every template of a type, rendered with a neutral place and its fallback service word. */
  function rendered(type: CategoryKey): string[] {
    return Object.values(CATEGORY_TEMPLATES[type] ?? {})
      .flat()
      .map((t) =>
        t.replace(/\{region\}/g, "Springfield").replace(/\{service\}/g, "local business"),
      );
  }

  it.each(LOCAL_TYPES)("%s: no other local type's words, and no software words", (type) => {
    const others = OWN_WORDS.filter((g) => !g.types.includes(type));
    for (const q of rendered(type)) {
      for (const g of others)
        expect(q, `${type}: "${q}" borrows ${g.types[0]}'s words`).not.toMatch(g.words);
      expect(q, `${type}: "${q}"`).not.toMatch(SOFTWARE_WORDS);
    }
  });

  // A software type may name the market it sells to ("What CRM do Australian real estate agencies use?", "online
  // store builders"), so it's held to the words only a local business is: a plumber, a café, a salon...
  const LOCAL_ONLY =
    /plumb|electrician|tradie|handyman|restaurant|caf[eé]|brunch|salon|\bgyms?\b|hairdress/i;
  it.each(SOFTWARE_TYPES)("%s: no plumber, restaurant or other local business's words", (type) => {
    for (const q of rendered(type)) expect(q, `${type}: "${q}"`).not.toMatch(LOCAL_ONLY);
  });
});
