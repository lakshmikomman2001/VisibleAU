/**
 * S00 part 5 (22 Nov; LLD 7.7, 8.8.3, appendix B, T6): the directory registry is the directory_registry table
 * (migration 0153, directory registry); lib/directories/registry.ts's DIRECTORY_REGISTRY_SEED is the rows the
 * migration writes, used until the table has been read (and in the browser). Here:
 * - the seed and the migration's rows are the same, row for row;
 * - the 17 directories the list had keep every field they had (names, domains, which brands see them, enabled,
 *   profile-link rules), so no existing card or count changes;
 * - appendix B's directories are there, each with its kind, shown only when cited;
 * - LinkedIn is its company pages only ("linkedin.com/company"), never a person's profile, and never by host alone;
 * - the table's rows replace the seed when read; an empty read never empties the registry;
 * - registry.ts stays safe for the browser (no database client), and with no database configured nothing is read.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  applyDirectoryRegistryRows,
  DIRECTORY_REGISTRY,
  DIRECTORY_REGISTRY_SEED,
  type DirectoryRegistryRow,
  findDirectoryByDomain,
  findDirectoryForSource,
  getDirectoriesForBrand,
  getDirectoriesForMarket,
  resetDirectoryRegistry,
} from "@/lib/directories/registry";
import { LOCAL_CATEGORY_KEYS } from "@/lib/prompts/templates";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

afterEach(() => resetDirectoryRegistry());

/** The migration's VALUES rows, parsed. */
function migrationRows(): DirectoryRegistryRow[] {
  const sql = read("db/migrations/0153_directory_registry.sql");
  const values = sql.slice(sql.indexOf("VALUES"), sql.indexOf("ON CONFLICT"));
  return [...values.matchAll(/\(([^()]*(?:\{[^}]*\}[^()]*)?)\)/g)].map(([, body]) => {
    const cells = [...body.matchAll(/'((?:[^']|'')*)'|NULL|true|false|\d+/g)].map((m) =>
      m[1] !== undefined ? m[1].replace(/''/g, "'") : m[0],
    );
    const [domainPattern, directoryKey, name, kind, market, appliesTo, hint, active, sortOrder] =
      cells;
    return {
      domainPattern,
      directoryKey,
      name,
      kind,
      market,
      appliesTo,
      profileUrlHint: hint === "NULL" ? null : hint,
      active: active === "true",
      sortOrder: Number(sortOrder),
    } as DirectoryRegistryRow;
  });
}

describe("the seed is the migration's rows", () => {
  it("row for row, in order", () => {
    expect(migrationRows()).toEqual([...DIRECTORY_REGISTRY_SEED]);
    expect(DIRECTORY_REGISTRY_SEED).toHaveLength(35);
  });
});

/** The list as it was before S00 part 5 (lib/directories/registry.ts at 70909f77). */
const TRADES = ["trades_plumbing", "trades_electrical", "trades_building", "trades_general"];
const BEFORE: Array<{
  key: string;
  name: string;
  domains: string[];
  sees: "trades" | "local";
  enabled: boolean;
}> = [
  { key: "hipages", name: "hipages", domains: ["hipages.com.au"], sees: "trades", enabled: true },
  {
    key: "serviceseeking",
    name: "ServiceSeeking",
    domains: ["serviceseeking.com.au"],
    sees: "trades",
    enabled: true,
  },
  {
    key: "oneflare",
    name: "Oneflare",
    domains: ["oneflare.com.au"],
    sees: "trades",
    enabled: true,
  },
  {
    key: "airtasker",
    name: "Airtasker",
    domains: ["airtasker.com"],
    sees: "trades",
    enabled: true,
  },
  {
    key: "yellow_pages_au",
    name: "Yellow Pages",
    domains: ["yellowpages.com.au"],
    sees: "local",
    enabled: true,
  },
  {
    key: "true_local",
    name: "True Local",
    domains: ["truelocal.com.au"],
    sees: "local",
    enabled: true,
  },
  {
    key: "localsearch",
    name: "Localsearch",
    domains: ["localsearch.com.au"],
    sees: "local",
    enabled: true,
  },
  {
    key: "product_review",
    name: "ProductReview",
    domains: ["productreview.com.au"],
    sees: "local",
    enabled: true,
  },
  {
    key: "word_of_mouth",
    name: "Word of Mouth",
    domains: ["wordofmouth.com.au", "womo.com.au"],
    sees: "local",
    enabled: true,
  },
  {
    key: "google_business_profile",
    name: "Google Business Profile",
    domains: ["google.com", "business.google.com", "g.page"],
    sees: "local",
    enabled: true,
  },
  { key: "yelp", name: "Yelp", domains: ["yelp.com"], sees: "local", enabled: false },
  { key: "angi", name: "Angi", domains: ["angi.com"], sees: "trades", enabled: false },
  {
    key: "thumbtack",
    name: "Thumbtack",
    domains: ["thumbtack.com"],
    sees: "trades",
    enabled: false,
  },
  {
    key: "homeadvisor",
    name: "HomeAdvisor",
    domains: ["homeadvisor.com"],
    sees: "trades",
    enabled: false,
  },
  {
    key: "bbb",
    name: "Better Business Bureau",
    domains: ["bbb.org"],
    sees: "local",
    enabled: false,
  },
  { key: "nextdoor", name: "Nextdoor", domains: ["nextdoor.com"], sees: "local", enabled: false },
  { key: "houzz", name: "Houzz", domains: ["houzz.com"], sees: "trades", enabled: false },
];

describe("the directories the list had are unchanged", () => {
  const all = [...DIRECTORY_REGISTRY.AU_EN, ...DIRECTORY_REGISTRY.US_EN];
  for (const before of BEFORE) {
    it(`${before.name}: name, domains, who sees it, enabled`, () => {
      const entry = all.find((d) => d.key === before.key);
      expect(entry).toBeDefined();
      expect(entry).toMatchObject({
        name: before.name,
        domains: before.domains,
        enabled: before.enabled,
      });
      expect([...(entry?.categories ?? [])]).toEqual(
        before.sees === "trades" ? TRADES : [...LOCAL_CATEGORY_KEYS],
      );
      expect(entry?.pathPrefix).toBeNull();
    });
  }

  it("the profile-link rules: hipages /connect/{slug}, Google host-only, every other host + a path", () => {
    const byKey = (k: string) => all.find((d) => d.key === k);
    expect(
      byKey("hipages")?.profileUrlPattern.test(
        "https://hipages.com.au/connect/norwestelectricalgroup",
      ),
    ).toBe(true);
    expect(
      byKey("hipages")?.profileUrlPattern.test("https://hipages.com.au/find/electricians"),
    ).toBe(false);
    expect(byKey("google_business_profile")?.profileUrlPattern.test("https://g.page/r/abc")).toBe(
      true,
    );
    expect(
      byKey("word_of_mouth")?.profileUrlPattern.test("https://wordofmouth.com.au/reviews/x"),
    ).toBe(true);
    expect(byKey("word_of_mouth")?.profileUrlPattern.test("https://womo.com.au/reviews/x")).toBe(
      false,
    );
  });

  it("a brand's relevant directories (its card, its counts) are exactly the ten as before", () => {
    expect(getDirectoriesForBrand("au", ["trades_electrical"]).map((d) => d.key)).toEqual([
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
    expect(getDirectoriesForBrand("au", ["crm_software"])).toEqual([]);
  });
});

describe("appendix B's directories, each with its kind, shown only when cited", () => {
  const added: Array<[string, string, string]> = [
    ["local_business_guide", "Local Business Guide", "general"],
    ["directso", "Directso", "general"],
    ["whereis", "Whereis", "maps"],
    ["cylex", "Cylex", "general"],
    ["nextdoor_au", "Nextdoor", "social"],
    ["birdeye", "Birdeye", "reviews"],
    ["linkedin", "LinkedIn", "professional"],
    ["hotfrog", "Hotfrog", "general"],
    ["startlocal", "StartLocal", "general"],
    ["aussieweb", "AussieWeb", "general"],
    ["yelp_au", "Yelp", "reviews"],
    ["healthengine", "HealthEngine", "health"],
    ["hotdoc", "HotDoc", "health"],
  ];
  it.each(added)("%s", (key, name, kind) => {
    const entry = getDirectoriesForMarket("AU_EN").find((d) => d.key === key);
    expect(entry).toMatchObject({ name, kind, relevance: "cited", enabled: true, market: "AU_EN" });
    expect(entry?.categories).toEqual([]);
  });

  it("the existing ones have their kinds too", () => {
    const kinds = Object.fromEntries(getDirectoriesForMarket("AU_EN").map((d) => [d.key, d.kind]));
    expect(kinds).toMatchObject({
      hipages: "trades",
      yellow_pages_au: "general",
      product_review: "reviews",
      google_business_profile: "maps",
    });
  });
});

describe("LinkedIn is its company pages only", () => {
  it("a company page, on linkedin.com or au.linkedin.com, is LinkedIn", () => {
    expect(
      findDirectoryForSource("au.linkedin.com", "https://au.linkedin.com/company/numbatek-it")?.key,
    ).toBe("linkedin");
    expect(
      findDirectoryForSource(
        "www.linkedin.com",
        "https://www.linkedin.com/company/numbatek-it/about",
      )?.key,
    ).toBe("linkedin");
  });

  it("a person's profile, a post, or the host alone isn't a directory", () => {
    expect(
      findDirectoryForSource("au.linkedin.com", "https://au.linkedin.com/in/someone"),
    ).toBeNull();
    expect(findDirectoryForSource("linkedin.com", "https://www.linkedin.com/posts/x")).toBeNull();
    expect(findDirectoryByDomain("linkedin.com")).toBeNull();
    // A Gemini grounding link names the site, not the page: the path can't be checked, so it isn't counted.
    expect(
      findDirectoryForSource(
        "linkedin.com",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
      ),
    ).toBeNull();
  });

  it("a host directory is found by its host, with or without a URL", () => {
    expect(
      findDirectoryForSource("reviews.birdeye.com", "https://reviews.birdeye.com/numbatek-it-123")
        ?.key,
    ).toBe("birdeye");
    expect(findDirectoryForSource("whereis.com", null)?.key).toBe("whereis");
    expect(findDirectoryByDomain("www.localbusinessguide.com.au")?.key).toBe(
      "local_business_guide",
    );
  });

  it("a domain the registry doesn't have is never a directory", () => {
    for (const domain of [
      "numbatekit.com.au",
      "reddit.com",
      "wikipedia.org",
      "linkedin.com.evil.example",
    ])
      expect(findDirectoryForSource(domain, `https://${domain}/x`), domain).toBeNull();
  });
});

describe("the table's rows replace the seed", () => {
  it("what's read is what every function returns; an empty read changes nothing", () => {
    applyDirectoryRegistryRows([
      {
        domainPattern: "example-directory.com.au",
        directoryKey: "example_directory",
        name: "Example Directory",
        kind: "general",
        market: "au",
        appliesTo: "local",
        profileUrlHint: null,
        active: true,
        sortOrder: 1,
      },
    ]);
    expect(getDirectoriesForMarket("AU_EN").map((d) => d.key)).toEqual(["example_directory"]);
    expect(findDirectoryByDomain("hipages.com.au")).toBeNull();
    applyDirectoryRegistryRows([]);
    expect(getDirectoriesForMarket("AU_EN").map((d) => d.key)).toEqual(["example_directory"]);
    resetDirectoryRegistry();
    expect(findDirectoryByDomain("hipages.com.au")?.key).toBe("hipages");
  });

  it("an inactive row is a disabled directory", () => {
    applyDirectoryRegistryRows(
      DIRECTORY_REGISTRY_SEED.map((r) =>
        r.directoryKey === "whereis" ? { ...r, active: false } : r,
      ),
    );
    expect(getDirectoriesForMarket("AU_EN").some((d) => d.key === "whereis")).toBe(false);
    expect(
      getDirectoriesForMarket("AU_EN", { enabledOnly: false }).some((d) => d.key === "whereis"),
    ).toBe(true);
  });
});

describe("where the registry runs", () => {
  // The store's first import loads the database schema: seconds under load, once, before its test.
  beforeAll(async () => {
    await import("@/lib/directories/registry-store");
  }, 60_000);

  it("registry.ts never imports the database client (the landing FAQ and the Action Center bundle it)", () => {
    const imports = read("lib/directories/registry.ts").match(/^import .*$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line).not.toMatch(/@\/db|registry-store|postgres/);
  });

  it("with no database configured (unit tests), loading reads nothing and the seed stays", async () => {
    const { loadDirectoryRegistry } = await import("@/lib/directories/registry-store");
    expect(process.env.DATABASE_URL).toBeUndefined();
    await loadDirectoryRegistry({ force: true });
    expect(findDirectoryByDomain("hipages.com.au")?.key).toBe("hipages");
  });
});
