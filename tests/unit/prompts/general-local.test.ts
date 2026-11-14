/**
 * 16 Nov, part 1 -- the general type is a real local business type: its questions name the business's own service
 * (the classifier's words) and its suburb, never "Best General business options in Australia?"; it's checked against
 * the six local directories, never the tradie ones; and it's where any local business the classifier can't place
 * lands.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { completeMock, crawlSiteMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
  crawlSiteMock: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({ getLLMService: vi.fn(() => ({ complete: completeMock })) }));
vi.mock("@/lib/crawler", () => ({ crawlSite: crawlSiteMock }));

import { classifyBrand } from "@/lib/brands/classify-brand";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { sanitizeServicePhrase } from "@/lib/brands/service-phrase";
import { getDirectoriesForBrand } from "@/lib/directories/registry";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { categoryLabel, resolveCategory } from "@/lib/prompts/templates";
import type { BrandClassification } from "@/lib/types/brand";

const TRADIE_DIRECTORIES = ["hipages", "ServiceSeeking", "Oneflare", "Airtasker"];
const LOCAL_DIRECTORIES = [
  "Yellow Pages",
  "True Local",
  "Localsearch",
  "ProductReview",
  "Word of Mouth",
  "Google Business Profile",
];

function classification(service: string | undefined): BrandClassification {
  return {
    category: "general",
    buyerType: "consumer",
    audience: "households",
    intentSignals: [],
    competitors: [],
    auRelevance: "au_present",
    confidence: 0.6,
    ...(service ? { service } : {}),
  };
}

/** The everyday questions, as lib/audit/get-audit-prompts.ts builds them for a brand in `suburb`. */
function everyday(name: string, service: string | undefined, suburb: string, city: string | null) {
  const region = resolveRegionLabel({
    suburb,
    city,
    state: "NSW",
    primaryRegions: [],
    region: "au",
  });
  const pack = buildPromptPack(
    classification(service),
    name,
    "example.com.au",
    { competitors: [], categories: ["general"], audience: "households" },
    region,
    10,
    `seed-${name}`,
  );
  return { region, organic: pack.slice(0, -3), branded: pack.slice(-3) };
}

describe("the general type's questions name the service and the suburb", () => {
  it.each([
    ["Parramatta Pooch Spa", "dog groomer", "Parramatta", "Sydney"],
    ["Newtown Cycles", "bike shop", "Newtown", "Sydney"],
    ["Norwest Paws", "dog groomer", "Norwest", null],
  ])("%s (%s, %s): every everyday question names both, and none is national", (name, service, suburb, city) => {
    const { region, organic, branded } = everyday(name, service, suburb, city);
    expect(organic.length).toBeGreaterThanOrEqual(10);
    for (const q of organic) {
      expect(q.toLowerCase(), q).toContain(service);
      expect(q, q).toContain(suburb);
      expect(q, q).not.toMatch(/General business|in Australia\b|Australian/);
    }
    // An uncurated suburb keeps its state: "Norwest, NSW".
    if (!city) expect(region).toBe(`${suburb}, NSW`);
    expect(branded[0]).toBe(`Is ${name} a good choice for a ${service} in ${region}?`);
  });

  it("a question that opens with the service starts with a capital", () => {
    const { organic } = everyday("Parramatta Pooch Spa", "dog groomer", "Parramatta", "Sydney");
    for (const q of organic) expect(q.charAt(0), q).toBe(q.charAt(0).toUpperCase());
  });

  it("without the classifier's words it asks about a local business there, never a national category", () => {
    const { organic, branded } = everyday(
      "Parramatta Pooch Spa",
      undefined,
      "Parramatta",
      "Sydney",
    );
    expect(organic.length).toBeGreaterThanOrEqual(10);
    for (const q of organic) expect(q, q).toMatch(/local business.*Parramatta/i);
    expect(branded[0]).toBe(
      "Is Parramatta Pooch Spa a good choice for a local business in Parramatta?",
    );
  });

  it("the service's own place name is taken out, so the suburb appears once", () => {
    const { organic } = everyday(
      "Parramatta Pooch Spa",
      "parramatta dog groomer",
      "Parramatta",
      "Sydney",
    );
    for (const q of organic) expect(q.match(/Parramatta/g), q).toHaveLength(1);
  });
});

describe("the general type is local", () => {
  it("its directories are the six local ones, never hipages, ServiceSeeking, Oneflare or Airtasker", () => {
    const names = getDirectoriesForBrand("au", ["general"]).map((d) => d.name);
    expect(names.sort()).toEqual([...LOCAL_DIRECTORIES].sort());
    for (const tradie of TRADIE_DIRECTORIES) expect(names).not.toContain(tradie);
    // The trades keep theirs.
    expect(getDirectoriesForBrand("au", ["trades_plumbing"]).map((d) => d.name)).toContain(
      "hipages",
    );
  });

  it("is where an unplaceable local business lands, labelled Local business", () => {
    expect(resolveCategory("dog_grooming")).toBe("general");
    expect(resolveCategory("bicycle_repairs")).toBe("general");
    expect(categoryLabel("general")).toBe("Local business");
  });
});

describe("the classifier's service words", () => {
  afterEach(() => {
    completeMock.mockReset();
    crawlSiteMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("are asked for and kept when they're a short plain phrase", async () => {
    vi.stubEnv("LLM_MODE", "real"); // the real path, not mock mode's canned classification
    crawlSiteMock.mockResolvedValue({
      pages: [{ title: "Pooch Spa", html: "<h1>Dog grooming</h1>", excerpt: "" }],
    });
    completeMock.mockResolvedValue({
      response: JSON.stringify({
        category: "general",
        buyerType: "consumer",
        audience: "households",
        service: "Dog groomer",
        intentSignals: ["dog grooming"],
        competitors: [],
        auRelevance: "au_founded",
        confidence: 0.8,
      }),
    });
    const result = await classifyBrand("Parramatta Pooch Spa", "poochspa.com.au");
    expect(result.service).toBe("dog groomer");
    expect(String(completeMock.mock.calls[0][0].prompt)).toContain('"service"');
  });

  it("are dropped when they aren't (a slogan, digits, a URL), and the questions fall back to the type's word", () => {
    expect(sanitizeServicePhrase("a dog groomer.")).toBe("dog groomer");
    expect(sanitizeServicePhrase("café")).toBe("café");
    expect(
      sanitizeServicePhrase("premium pet grooming and daycare services for busy Sydney families"),
    ).toBeUndefined();
    expect(sanitizeServicePhrase("24/7 locksmith")).toBeUndefined();
    expect(sanitizeServicePhrase("https://example.com")).toBeUndefined();
    expect(sanitizeServicePhrase(42)).toBeUndefined();
  });
});
