/**
 * S00 part 4 (22 Nov; LLD 8.8.2, T2): the name the add-brand wizard suggests from a business's own home page, and
 * the aliases it pre-fills. NumbaTek IT was stored as "numbatekit" (its domain label); its site calls it
 * "NumbaTek IT". Also the alias rules every write checks (lib/brands/aliases.ts) and the host the suggestion route
 * accepts (no IP address, port, path or local name).
 */
import { describe, expect, it } from "vitest";
import { aliasProblem, checkAliases, MAX_ALIASES } from "@/lib/brands/aliases";
import { suggestBrandName, suggestionHost } from "@/lib/brands/name-suggestion";

/** A home page shaped like NumbaTek IT's: the business's name in the title's last segment, no og:site_name. */
const NUMBATEK_HOME = `<!doctype html><html><head>
  <title>Managed IT Services Western Sydney | NumbaTek IT</title>
  <meta name="description" content="Managed IT, cybersecurity and Microsoft 365 for Sydney businesses.">
</head><body><h1>IT support that just works</h1></body></html>`;

describe("suggestBrandName: the site's own name, in order", () => {
  it("NumbaTek IT: the title's brand segment, 'NumbaTek IT', not the domain label", () => {
    expect(suggestBrandName(NUMBATEK_HOME, "numbatekit.com.au")).toEqual({
      name: "NumbaTek IT",
      source: "title",
    });
  });

  it("og:site_name comes first", () => {
    const html = `<html><head><meta property="og:site_name" content="NumbaTek IT"><title>Home - Something Else</title></head></html>`;
    expect(suggestBrandName(html, "numbatekit.com.au")).toEqual({
      name: "NumbaTek IT",
      source: "og:site_name",
    });
  });

  it("then a JSON-LD organisation's name that matches the domain", () => {
    const html = `<html><head><title>Welcome</title><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"Home"},
       {"@type":"LocalBusiness","name":"NumbaTek IT","telephone":"02 9000 0000"}]}
    </script></head></html>`;
    expect(suggestBrandName(html, "numbatekit.com.au")).toEqual({
      name: "NumbaTek IT",
      source: "json-ld",
    });
  });

  it("a title segment that isn't the business (no match with the domain) isn't suggested", () => {
    const html = "<html><head><title>Home | Welcome to our website</title></head></html>";
    expect(suggestBrandName(html, "numbatekit.com.au")).toBeNull();
  });

  it("then the domain's own words, when it shows them; nothing when it doesn't", () => {
    expect(suggestBrandName(null, "wren-home-services.com.au")).toEqual({
      name: "Wren Home Services",
      source: "domain",
    });
    expect(suggestBrandName(null, "numbatekit.com.au")).toBeNull();
  });

  it("never suggests a URL or a long line", () => {
    const html = `<html><head><meta property="og:site_name" content="https://numbatekit.com.au"><title>${"NumbaTek IT ".repeat(10)}</title></head></html>`;
    expect(suggestBrandName(html, "numbatekit.com.au")).toBeNull();
  });

  it("decodes entities and trims ('Smith &amp; Sons' -> 'Smith & Sons')", () => {
    const html = `<html><head><meta property="og:site_name" content="  Smith &amp; Sons  "></head></html>`;
    expect(suggestBrandName(html, "smithandsons.com.au")?.name).toBe("Smith & Sons");
  });
});

// S01 part 0: S00's four suggestAliases tests are gone with the function. LLD section 0.2 #5: "S01 carry-over: stop
// suggesting the name without spaces or the domain stem" (contract C-27) -- those were its only two forms.

describe("the alias rules (UI contract P01.aliases)", () => {
  // S01 part 0 (LLD section 0.2 #5: "aliases unique ignoring case"; contract C-27): S00 kept "numbatekit" and
  // "NumbaTekIT" both; a name added now is compared ignoring case.
  it("2-60 characters, unique ignoring case, never the brand's name (ignoring case), up to 10", () => {
    expect(aliasProblem("A", [], "NumbaTek IT")).toBe("A name is 2 to 60 characters.");
    expect(aliasProblem("x".repeat(61), [], "NumbaTek IT")).toBe("A name is 2 to 60 characters.");
    expect(aliasProblem("numbatek it", [], "NumbaTek IT")).toBe("That's the brand's name already.");
    expect(aliasProblem("numbatekit", ["numbatekit"], "NumbaTek IT")).toBe(
      "That name is already listed.",
    );
    expect(aliasProblem("NumbaTekIT", ["numbatekit"], "NumbaTek IT")).toBe(
      "That name is already listed.",
    );
    const ten = Array.from({ length: MAX_ALIASES }, (_, i) => `Name ${i}`);
    expect(aliasProblem("Another", ten, "NumbaTek IT")).toBe("Up to 10 names.");
    expect(aliasProblem("  Quollen  Group ", [], "NumbaTek IT")).toBeNull();
  });

  it("aliases saved before S01 are kept as they are; a new case-only twin is refused", () => {
    const saved = ["numbatekit", "NumbaTekIT"];
    expect(checkAliases(saved, "NumbaTek IT", saved)).toEqual({ ok: true, aliases: saved });
    expect(checkAliases([...saved, "Quollen Group"], "NumbaTek IT", saved)).toEqual({
      ok: true,
      aliases: [...saved, "Quollen Group"],
    });
    expect(checkAliases([...saved, "NUMBATEKIT"], "NumbaTek IT", saved)).toEqual({
      ok: false,
      error: "aliases: That name is already listed.",
    });
    // A new brand (POST) has nothing saved: the twin is refused.
    expect(checkAliases(saved, "NumbaTek IT")).toEqual({
      ok: false,
      error: "aliases: That name is already listed.",
    });
  });

  it("checkAliases trims each and stops at the first problem", () => {
    expect(checkAliases(["  Quollen  Group "], "NumbaTek IT")).toEqual({
      ok: true,
      aliases: ["Quollen Group"],
    });
    expect(checkAliases(["Quollen", "Quollen "], "NumbaTek IT")).toEqual({
      ok: false,
      error: "aliases: That name is already listed.",
    });
  });
});

describe("suggestionHost: a plain host name only", () => {
  it("accepts a domain as people type it", () => {
    expect(suggestionHost("NumbaTekIT.com.au")).toBe("numbatekit.com.au");
    expect(suggestionHost("https://www.numbatekit.com.au/")).toBe("numbatekit.com.au");
  });

  it("refuses an IP address, a port, a path, a local name or nothing", () => {
    for (const bad of [
      "127.0.0.1",
      "169.254.169.254",
      "10.0.0.5",
      "localhost",
      "printer.local",
      "db.internal",
      "numbatekit.com.au:8080",
      "numbatekit.com.au/admin",
      "user@numbatekit.com.au",
      "",
      null,
    ])
      expect(suggestionHost(bad), String(bad)).toBeNull();
  });
});
