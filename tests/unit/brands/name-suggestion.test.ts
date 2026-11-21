/**
 * S00 part 4 (22 Nov; LLD 8.8.2, T2): the name the add-brand wizard suggests from a business's own home page, and
 * the aliases it pre-fills. TechCore IT was stored as "techcoreit" (its domain label); its site calls it
 * "TechCore IT". Also the alias rules every write checks (lib/brands/aliases.ts) and the host the suggestion route
 * accepts (no IP address, port, path or local name).
 */
import { describe, expect, it } from "vitest";
import { aliasProblem, checkAliases, MAX_ALIASES, suggestAliases } from "@/lib/brands/aliases";
import { suggestBrandName, suggestionHost } from "@/lib/brands/name-suggestion";

/** A home page shaped like TechCore IT's: the business's name in the title's last segment, no og:site_name. */
const TECHCORE_HOME = `<!doctype html><html><head>
  <title>Managed IT Services Western Sydney | TechCore IT</title>
  <meta name="description" content="Managed IT, cybersecurity and Microsoft 365 for Sydney businesses.">
</head><body><h1>IT support that just works</h1></body></html>`;

describe("suggestBrandName: the site's own name, in order", () => {
  it("TechCore IT: the title's brand segment, 'TechCore IT', not the domain label", () => {
    expect(suggestBrandName(TECHCORE_HOME, "techcoreit.com.au")).toEqual({
      name: "TechCore IT",
      source: "title",
    });
  });

  it("og:site_name comes first", () => {
    const html = `<html><head><meta property="og:site_name" content="TechCore IT"><title>Home - Something Else</title></head></html>`;
    expect(suggestBrandName(html, "techcoreit.com.au")).toEqual({
      name: "TechCore IT",
      source: "og:site_name",
    });
  });

  it("then a JSON-LD organisation's name that matches the domain", () => {
    const html = `<html><head><title>Welcome</title><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"Home"},
       {"@type":"LocalBusiness","name":"TechCore IT","telephone":"02 9000 0000"}]}
    </script></head></html>`;
    expect(suggestBrandName(html, "techcoreit.com.au")).toEqual({
      name: "TechCore IT",
      source: "json-ld",
    });
  });

  it("a title segment that isn't the business (no match with the domain) isn't suggested", () => {
    const html = "<html><head><title>Home | Welcome to our website</title></head></html>";
    expect(suggestBrandName(html, "techcoreit.com.au")).toBeNull();
  });

  it("then the domain's own words, when it shows them; nothing when it doesn't", () => {
    expect(suggestBrandName(null, "hero-home-services.com.au")).toEqual({
      name: "Hero Home Services",
      source: "domain",
    });
    expect(suggestBrandName(null, "techcoreit.com.au")).toBeNull();
  });

  it("never suggests a URL or a long line", () => {
    const html = `<html><head><meta property="og:site_name" content="https://techcoreit.com.au"><title>${"TechCore IT ".repeat(10)}</title></head></html>`;
    expect(suggestBrandName(html, "techcoreit.com.au")).toBeNull();
  });

  it("decodes entities and trims ('Smith &amp; Sons' -> 'Smith & Sons')", () => {
    const html = `<html><head><meta property="og:site_name" content="  Smith &amp; Sons  "></head></html>`;
    expect(suggestBrandName(html, "smithandsons.com.au")?.name).toBe("Smith & Sons");
  });
});

describe("suggestAliases: the domain label and the name without its spaces", () => {
  it('TechCore IT -> "techcoreit" and "TechCoreIT"', () => {
    expect(suggestAliases("TechCore IT", "techcoreit.com.au")).toEqual([
      "techcoreit",
      "TechCoreIT",
    ]);
  });

  it("nothing that is just the name again", () => {
    expect(suggestAliases("Omega", "omega.com.au")).toEqual([]);
    expect(suggestAliases("herohomeservices", "herohomeservices.com.au")).toEqual([]);
  });

  it("a hyphenated domain gives the no-space form only", () => {
    expect(suggestAliases("Hero Home Services", "hero-home-services.com.au")).toEqual([
      "HeroHomeServices",
    ]);
  });

  it("every suggestion passes the rules a write checks", () => {
    const name = "TechCore IT";
    expect(checkAliases(suggestAliases(name, "techcoreit.com.au"), name)).toEqual({
      ok: true,
      aliases: ["techcoreit", "TechCoreIT"],
    });
  });
});

describe("the alias rules (UI contract P01.aliases)", () => {
  // Unique as written: S00 part 4 keeps "techcoreit" and "TechCoreIT" both (the contract's "ignoring case" is
  // proposed for amendment); detection ignores case either way.
  it("2-60 characters, unique as written, never the brand's name (ignoring case), up to 10", () => {
    expect(aliasProblem("A", [], "TechCore IT")).toBe("A name is 2 to 60 characters.");
    expect(aliasProblem("x".repeat(61), [], "TechCore IT")).toBe("A name is 2 to 60 characters.");
    expect(aliasProblem("techcore it", [], "TechCore IT")).toBe("That's the brand's name already.");
    expect(aliasProblem("techcoreit", ["techcoreit"], "TechCore IT")).toBe(
      "That name is already listed.",
    );
    expect(aliasProblem("TechCoreIT", ["techcoreit"], "TechCore IT")).toBeNull();
    const ten = Array.from({ length: MAX_ALIASES }, (_, i) => `Name ${i}`);
    expect(aliasProblem("Another", ten, "TechCore IT")).toBe("Up to 10 names.");
    expect(aliasProblem("  Astorio  Group ", [], "TechCore IT")).toBeNull();
  });

  it("checkAliases trims each and stops at the first problem", () => {
    expect(checkAliases(["  Astorio  Group "], "TechCore IT")).toEqual({
      ok: true,
      aliases: ["Astorio Group"],
    });
    expect(checkAliases(["Astorio", "Astorio "], "TechCore IT")).toEqual({
      ok: false,
      error: "aliases: That name is already listed.",
    });
  });
});

describe("suggestionHost: a plain host name only", () => {
  it("accepts a domain as people type it", () => {
    expect(suggestionHost("TechCoreIT.com.au")).toBe("techcoreit.com.au");
    expect(suggestionHost("https://www.techcoreit.com.au/")).toBe("techcoreit.com.au");
  });

  it("refuses an IP address, a port, a path, a local name or nothing", () => {
    for (const bad of [
      "127.0.0.1",
      "169.254.169.254",
      "10.0.0.5",
      "localhost",
      "printer.local",
      "db.internal",
      "techcoreit.com.au:8080",
      "techcoreit.com.au/admin",
      "user@techcoreit.com.au",
      "",
      null,
    ])
      expect(suggestionHost(bad), String(bad)).toBeNull();
  });
});
