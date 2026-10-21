import { describe, expect, it } from "vitest";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import {
  DIRECTORY_REGISTRY,
  findDirectoryByDomain,
  getDirectoriesForBrand,
  getDirectoriesForMarket,
  marketCodeForRegion,
} from "@/lib/directories/registry";

describe("DIRECTORY_REGISTRY -- shape", () => {
  it("every entry's categories are real CATEGORY_KEYS, not guessed strings", () => {
    for (const entries of Object.values(DIRECTORY_REGISTRY)) {
      for (const entry of entries) {
        for (const cat of entry.categories) {
          expect(CATEGORY_KEYS as readonly string[]).toContain(cat);
        }
      }
    }
  });

  it("every entry has at least one domain and a non-empty key/name", () => {
    for (const entries of Object.values(DIRECTORY_REGISTRY)) {
      for (const entry of entries) {
        expect(entry.domains.length).toBeGreaterThan(0);
        expect(entry.key.length).toBeGreaterThan(0);
        expect(entry.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("every key is unique across the whole registry (not just within one market)", () => {
    const keys = Object.values(DIRECTORY_REGISTRY)
      .flat()
      .map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("AU directories are enabled; US directories are present but disabled", () => {
    expect(DIRECTORY_REGISTRY.AU_EN.every((d) => d.enabled)).toBe(true);
    expect(DIRECTORY_REGISTRY.US_EN.length).toBeGreaterThan(0);
    expect(DIRECTORY_REGISTRY.US_EN.every((d) => d.enabled === false)).toBe(true);
  });

  it("names every AU directory the task asked for", () => {
    const keys = DIRECTORY_REGISTRY.AU_EN.map((d) => d.key);
    expect(keys).toEqual([
      "hipages",
      "serviceseeking",
      "oneflare",
      "airtasker",
      "yellow_pages_au",
      "true_local",
      "localsearch",
      "product_review",
      "word_of_mouth",
      "google_business_profile",
    ]);
  });

  it("names every US directory the task asked for", () => {
    const keys = DIRECTORY_REGISTRY.US_EN.map((d) => d.key);
    expect(keys).toEqual(["yelp", "angi", "thumbtack", "homeadvisor", "bbb", "nextdoor", "houzz"]);
  });
});

describe("getDirectoriesForMarket", () => {
  it("defaults to enabled-only", () => {
    expect(getDirectoriesForMarket("US_EN")).toEqual([]);
    expect(getDirectoriesForMarket("AU_EN").length).toBe(DIRECTORY_REGISTRY.AU_EN.length);
  });

  it("enabledOnly: false returns every directory for the market, including disabled ones", () => {
    expect(getDirectoriesForMarket("US_EN", { enabledOnly: false }).length).toBe(
      DIRECTORY_REGISTRY.US_EN.length,
    );
  });

  it("an unknown market returns an empty array, never throws", () => {
    // @ts-expect-error -- deliberately an invalid MarketCode
    expect(getDirectoriesForMarket("NZ_EN")).toEqual([]);
  });
});

describe("DirectoryEntry.profileUrlPattern", () => {
  it("hipages: the verified real shape (diag-0082's own cited competitor URL) matches", () => {
    const hipages = DIRECTORY_REGISTRY.AU_EN.find((d) => d.key === "hipages")!;
    expect(hipages.profileUrlPattern.test("https://hipages.com.au/connect/norwestelectricalgroup")).toBe(
      true,
    );
    expect(hipages.profileUrlPattern.test("http://www.hipages.com.au/connect/some-business")).toBe(true);
  });

  it("hipages: a category/find page is NOT a valid profile link -- that's the exact bug Part A removed", () => {
    const hipages = DIRECTORY_REGISTRY.AU_EN.find((d) => d.key === "hipages")!;
    expect(hipages.profileUrlPattern.test("https://hipages.com.au/find/plumbers")).toBe(false);
  });

  it("hipages: a link to a different domain entirely never matches, even with /connect/ in the path", () => {
    const hipages = DIRECTORY_REGISTRY.AU_EN.find((d) => d.key === "hipages")!;
    expect(hipages.profileUrlPattern.test("https://evil.example.com/connect/hipages.com.au")).toBe(false);
  });

  it("every other AU directory's generic pattern accepts a plausible profile URL and rejects a bare homepage", () => {
    for (const entry of DIRECTORY_REGISTRY.AU_EN) {
      if (entry.key === "hipages") continue;
      const domain = entry.domains[0];
      expect(entry.profileUrlPattern.test(`https://${domain}/some-business-profile`)).toBe(true);
      expect(entry.profileUrlPattern.test(`https://${domain}`)).toBe(false);
      expect(entry.profileUrlPattern.test(`https://${domain}/`)).toBe(false);
    }
  });

  it("no directory's pattern matches a link to an unrelated host", () => {
    for (const entries of Object.values(DIRECTORY_REGISTRY)) {
      for (const entry of entries) {
        expect(entry.profileUrlPattern.test("https://totally-unrelated-site.example.com/profile")).toBe(
          false,
        );
      }
    }
  });
});

describe("marketCodeForRegion", () => {
  it("us -> US_EN, every other region -> AU_EN (this product is AU-first)", () => {
    expect(marketCodeForRegion("us")).toBe("US_EN");
    expect(marketCodeForRegion("au")).toBe("AU_EN");
    expect(marketCodeForRegion("nz")).toBe("AU_EN");
    expect(marketCodeForRegion("uk")).toBe("AU_EN");
  });
});

describe("getDirectoriesForBrand", () => {
  it("a trades_general brand in AU sees both the trade marketplaces and the general local directories", () => {
    const result = getDirectoriesForBrand("au", ["trades_general"]);
    const keys = result.map((d) => d.key);
    expect(keys).toContain("hipages");
    expect(keys).toContain("yellow_pages_au");
  });

  it("a SaaS category sees none of the AU local-business directories", () => {
    const result = getDirectoriesForBrand("au", ["crm_software"]);
    expect(result).toEqual([]);
  });

  it("a brand with no confirmed categories yet sees every enabled directory for its market, not zero", () => {
    const result = getDirectoriesForBrand("au", []);
    expect(result.length).toBe(getDirectoriesForMarket("AU_EN").length);
  });

  it("a US-region brand sees nothing today (every US directory is disabled)", () => {
    expect(getDirectoriesForBrand("us", ["trades_general"])).toEqual([]);
  });

  it("legal_services gets the general local directories, but never the trade marketplaces", () => {
    const result = getDirectoriesForBrand("au", ["legal_services"]);
    const keys = result.map((d) => d.key);
    expect(keys).toContain("yellow_pages_au");
    expect(keys).not.toContain("hipages");
    expect(keys).not.toContain("airtasker");
  });
});

describe("findDirectoryByDomain", () => {
  it("matches the bare domain", () => {
    expect(findDirectoryByDomain("hipages.com.au")?.key).toBe("hipages");
  });

  it("matches a subdomain of the registered domain", () => {
    expect(findDirectoryByDomain("www.hipages.com.au")?.key).toBe("hipages");
    expect(findDirectoryByDomain("blog.serviceseeking.com.au")?.key).toBe("serviceseeking");
  });

  it("Word of Mouth matches either of its two real domains", () => {
    expect(findDirectoryByDomain("wordofmouth.com.au")?.key).toBe("word_of_mouth");
    expect(findDirectoryByDomain("womo.com.au")?.key).toBe("word_of_mouth");
  });

  it("finds a disabled (US) directory too -- this lookup isn't gated by enabled, callers decide that", () => {
    expect(findDirectoryByDomain("yelp.com")?.key).toBe("yelp");
  });

  it("an unrelated domain returns null, never a false match", () => {
    expect(findDirectoryByDomain("example.com")).toBeNull();
    // Not a suffix match on a shorter, unrelated string.
    expect(findDirectoryByDomain("nothipages.com.au")).toBeNull();
  });
});
