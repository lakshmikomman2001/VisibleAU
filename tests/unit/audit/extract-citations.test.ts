import { describe, expect, it, vi } from "vitest";
import {
  extractCitations,
  mergeCitedSources,
  resolveCitationOrigin,
  toDisplayDomain,
  toRegistrableDomain,
} from "@/lib/audit/extract-citations";

describe("extractCitations", () => {
  it("extracts markdown link URLs", () => {
    const r = extractCitations("See [Bondi Plumbing](https://bondiplumbing.com.au) for details.");
    expect(r).toContainEqual(expect.objectContaining({ domain: "bondiplumbing.com.au" }));
  });
  it("extracts bare https URLs", () => {
    const r = extractCitations("Visit https://bondiplumbing.com.au for a quote.");
    expect(r).toContainEqual(expect.objectContaining({ domain: "bondiplumbing.com.au" }));
  });
  it("extracts domain-only .com.au references", () => {
    const r = extractCitations("You can also try bondiplumbing.com.au directly.");
    expect(r).toContainEqual(expect.objectContaining({ domain: "bondiplumbing.com.au" }));
  });
  it("deduplicates same domain across formats", () => {
    const r = extractCitations("[Link](https://bondiplumbing.com.au) and bondiplumbing.com.au");
    expect(r.filter((s) => s.domain === "bondiplumbing.com.au")).toHaveLength(1);
  });
  it("empty response → empty array", () => {
    expect(extractCitations("")).toEqual([]);
  });
});

/**
 * Task #46: live Bondi data showed "other" cards overstating their
 * count -- citedSources entries whose host doesn't resolve to a real
 * ICANN domain at all. Every one of the three extraction passes must
 * drop these, not just the bare-domain one.
 */
describe("extractCitations -- drops hosts that don't resolve to a real ICANN domain", () => {
  it("a markdown link to an IP address is dropped, not stored as a domain", () => {
    const r = extractCitations("See [here](https://192.168.1.1/page) for details.");
    expect(r).toHaveLength(0);
  });

  it("a bare URL with an unrecognised/made-up TLD host is dropped", () => {
    const r = extractCitations("Check https://example.invalidmadeuptld/page for info.");
    expect(r).toHaveLength(0);
  });

  it("a bare URL to localhost or a single-label internal host is dropped", () => {
    const r = extractCitations("Internal: https://localhost:3000/test and https://some-internal-tool/");
    expect(r).toHaveLength(0);
  });

  it("a valid domain alongside a junk one keeps only the valid one", () => {
    const r = extractCitations("Try https://192.168.1.1/page or https://bondiplumbing.com.au instead.");
    expect(r).toEqual([expect.objectContaining({ domain: "bondiplumbing.com.au" })]);
  });

  it("logs a debug message (no PII) when dropping, but never throws", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(() => extractCitations("https://192.168.1.1/page")).not.toThrow();
    expect(debugSpy).toHaveBeenCalledWith(
      "[extract-citations] dropped unparseable host",
      expect.objectContaining({ domain: "192.168.1.1" }),
    );
    debugSpy.mockRestore();
  });

  it("a single-character label before the suffix (version-string/abbreviation shape) is rejected by the tightened regex", () => {
    const r = extractCitations("Revenue grew to v2.1.com this quarter, per U.S.com reports.");
    expect(r.find((s) => s.domain === "1.com")).toBeUndefined();
    expect(r.find((s) => s.domain === "s.com")).toBeUndefined();
  });
});

/**
 * Task #43: Perplexity-style answers like "the strongest options are
 * **hipages**, **Airtasker**…[1][3]" have nothing extractCitations()
 * can find in the text -- the real URLs live in the provider's own
 * structured citations field. mergeCitedSources is how those get back
 * into the same citedSources shape every downstream consumer expects.
 */
describe("mergeCitedSources", () => {
  it("structured URLs with nothing extractable from text still produce real sources", () => {
    const extracted = extractCitations("The strongest options are hipages and Airtasker. [1][3]");
    expect(extracted).toEqual([]); // confirms the text truly has nothing to extract

    const merged = mergeCitedSources(extracted, [
      "https://hipages.com.au/connect/plumber",
      "https://www.airtasker.com/tasks/plumbing",
    ]);

    expect(merged).toEqual([
      { domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber", origin: "retrieved" },
      { domain: "airtasker.com", url: "https://www.airtasker.com/tasks/plumbing", origin: "retrieved" },
    ]);
  });

  it("structured URLs are listed first (more reliable -- wins as classify-citation-sources.ts's primary source)", () => {
    const extracted = extractCitations("See bondiplumbing.com.au for details.");
    const merged = mergeCitedSources(extracted, ["https://hipages.com.au/connect/plumber"]);

    expect(merged[0].domain).toBe("hipages.com.au");
    expect(merged[1].domain).toBe("bondiplumbing.com.au");
  });

  it("de-duplicates by domain between structured and extracted", () => {
    const extracted = extractCitations("Visit https://hipages.com.au/connect/plumber directly.");
    const merged = mergeCitedSources(extracted, ["https://hipages.com.au/connect/plumber"]);

    expect(merged).toHaveLength(1);
  });

  it("undefined structuredUrls is a no-op -- just the extracted sources", () => {
    const extracted = extractCitations("See bondiplumbing.com.au for details.");
    expect(mergeCitedSources(extracted, undefined)).toEqual(extracted);
  });

  it("malformed structured URLs are skipped, not thrown", () => {
    const merged = mergeCitedSources([], ["not-a-valid-url", "https://hipages.com.au/connect/plumber"]);
    expect(merged).toEqual([
      { domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber", origin: "retrieved" },
    ]);
  });
});

/**
 * Task #45: "retrieved" vs "recalled" origin tagging -- extracted
 * (text-pattern) sources are always "recalled"; structured sources are
 * always "retrieved". resolveCitationOrigin infers an origin for
 * pre-task-#45 rows that have no per-entry origin at all.
 */
describe("origin tagging", () => {
  it("extractCitations always tags its own output 'recalled'", () => {
    const sources = extractCitations("See bondiplumbing.com.au and https://hipages.com.au/a");
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.origin === "recalled")).toBe(true);
  });

  it("mergeCitedSources tags structured URLs 'retrieved' and extracted ones stay 'recalled'", () => {
    const extracted = extractCitations("See bondiplumbing.com.au for details.");
    const merged = mergeCitedSources(extracted, ["https://hipages.com.au/connect/plumber"]);

    expect(merged.find((s) => s.domain === "hipages.com.au")?.origin).toBe("retrieved");
    expect(merged.find((s) => s.domain === "bondiplumbing.com.au")?.origin).toBe("recalled");
  });
});

describe("resolveCitationOrigin -- legacy (pre-task-#45) entries with no origin field", () => {
  it("returns the entry's own origin when present, regardless of engine", () => {
    expect(resolveCitationOrigin({ origin: "recalled" }, "perplexity")).toBe("recalled");
    expect(resolveCitationOrigin({ origin: "retrieved" }, "chatgpt")).toBe("retrieved");
  });

  it("infers 'retrieved' for a citation-supplying engine (perplexity) with no origin field", () => {
    expect(resolveCitationOrigin({}, "perplexity")).toBe("retrieved");
  });

  it("infers 'recalled' for engines that never supply structured citations", () => {
    expect(resolveCitationOrigin({}, "chatgpt")).toBe("recalled");
    expect(resolveCitationOrigin({}, "claude")).toBe("recalled");
    expect(resolveCitationOrigin({}, "gemini")).toBe("recalled");
  });
});

describe("toRegistrableDomain -- tldts/PSL-backed, not a hand-rolled suffix list", () => {
  it("strips a subdomain down to the registrable AU-style domain", () => {
    expect(toRegistrableDomain("blog.hipages.com.au")).toBe("hipages.com.au");
    expect(toRegistrableDomain("a.b.hipages.com.au")).toBe("hipages.com.au");
  });

  it("strips a subdomain down to the registrable generic domain", () => {
    expect(toRegistrableDomain("blog.example.com")).toBe("example.com");
  });

  it("leaves an already-registrable domain unchanged", () => {
    expect(toRegistrableDomain("hipages.com.au")).toBe("hipages.com.au");
    expect(toRegistrableDomain("example.com")).toBe("example.com");
  });

  it("strips www. first", () => {
    expect(toRegistrableDomain("www.hipages.com.au")).toBe("hipages.com.au");
  });

  // Task #45 follow-up: the table the "BEFORE pushing 17974b3" task
  // specified verbatim. www./subdomains/case/trailing-dot in, the PSL's
  // actual registrable domain out -- this is the behaviour the
  // hand-rolled version (only com.au/net.au/org.au/co.nz) got wrong for
  // every other AU multi-part suffix.
  it.each([
    ["www.hipages.com.au", "hipages.com.au"],
    ["connect.hipages.com.au", "hipages.com.au"],
    ["www.oneflare.com.au", "oneflare.com.au"],
    ["maps.google.com", "google.com"],
    ["business.google.com", "google.com"],
    ["g.page", "g.page"],
    ["www.airtasker.com", "airtasker.com"],
    ["example.co.nz", "example.co.nz"],
    ["HIPAGES.COM.AU", "hipages.com.au"], // uppercase normalised
    ["hipages.com.au.", "hipages.com.au"], // trailing dot normalised
  ])("%s -> %s", (input, expected) => {
    expect(toRegistrableDomain(input)).toBe(expected);
  });

  // fairtrading.nsw.gov.au: the PSL lists state-government second-level
  // domains (nsw.gov.au, vic.gov.au, ...) as their own public suffix --
  // under eTLD+1 rules, "nsw.gov.au" itself is the registrable boundary
  // (different NSW agencies are different "sites" from each other), one
  // level deeper than a human reading "fairtrading.nsw.gov.au" might
  // expect. This is the PSL-correct result, not a bug in this function
  // -- and it's still correct relative to the hand-rolled version it
  // replaces, which collapsed this (and every other gov.au/edu.au/
  // asn.au/id.au domain) down to the single, far-too-broad "gov.au".
  it("fairtrading.nsw.gov.au -> nsw.gov.au (PSL: nsw.gov.au is its own public suffix)", () => {
    expect(toRegistrableDomain("fairtrading.nsw.gov.au")).toBe("nsw.gov.au");
  });

  it.each(["192.168.1.1", "localhost", "garbage", "::1"])(
    "%s is not a registrable domain -> null (excluded, not guessed at)",
    (input) => {
      expect(toRegistrableDomain(input)).toBeNull();
    },
  );

  // Task #46: the original implementation here (`getDomain()` with no
  // further check) accepted these -- its fallback treats any
  // unrecognised final label as if it might be an obscure-but-real TLD.
  // Checking tldts' `isIcann` flag instead is what "a valid ICANN
  // registrable domain" (the task's own wording) actually requires.
  it.each(["example.invalidmadeuptld", "report.pdf", "x.pdf"])(
    "%s has a non-ICANN suffix -> null, not accepted as if it were a real domain",
    (input) => {
      expect(toRegistrableDomain(input)).toBeNull();
    },
  );

  // Not rejected, and correctly so: ".ltd" is a genuine ICANN-delegated
  // gTLD (not a company-suffix abbreviation as it might look), so
  // "Pty.Ltd" parses as a syntactically-real domain under it. This is
  // the honest limit of shape/suffix validation -- it can't distinguish
  // a real "pty.ltd"-registered business from a coincidental company-
  // suffix abbreviation, and in practice the bare-domain regex below
  // never offers it this string anyway (.ltd isn't in its own suffix
  // list), so this only matters for a hypothetical markdown-link URL
  // literally pointing at https://Pty.Ltd/.
  it("Pty.Ltd is NOT rejected -- .ltd is a real ICANN gTLD, not a company-suffix abbreviation", () => {
    expect(toRegistrableDomain("Pty.Ltd")).toBe("pty.ltd");
  });
});

describe("toDisplayDomain -- gov.au/edu.au group by full hostname, everything else by registrable domain", () => {
  it("a gov.au host groups by its full hostname, not the nsw.gov.au registrable reduction", () => {
    expect(toDisplayDomain("fairtrading.nsw.gov.au")).toBe("fairtrading.nsw.gov.au");
    expect(toDisplayDomain("service.nsw.gov.au")).toBe("service.nsw.gov.au");
  });

  // Task #46 (3rd follow-up): a specific licence-verification
  // subdomain, confirmed distinct from every other nsw.gov.au
  // department rather than collapsed alongside them.
  it("verify.licence.nsw.gov.au groups by its own full hostname", () => {
    expect(toDisplayDomain("verify.licence.nsw.gov.au")).toBe("verify.licence.nsw.gov.au");
  });

  it("strips www. and normalises case/trailing dot for a gov.au full hostname", () => {
    expect(toDisplayDomain("www.Fairtrading.NSW.GOV.AU.")).toBe("fairtrading.nsw.gov.au");
  });

  it("a bare gov.au with no sub-department still returns the full (here, registrable) hostname", () => {
    expect(toDisplayDomain("business.gov.au")).toBe("business.gov.au");
  });

  it("an edu.au host groups by full hostname too", () => {
    expect(toDisplayDomain("student.unisa.edu.au")).toBe("student.unisa.edu.au");
  });

  it("a normal (non gov.au/edu.au) domain still groups by the registrable domain", () => {
    expect(toDisplayDomain("blog.hipages.com.au")).toBe("hipages.com.au");
    expect(toDisplayDomain("www.airtasker.com")).toBe("airtasker.com");
  });

  it("returns null for the same inputs toRegistrableDomain rejects", () => {
    expect(toDisplayDomain("192.168.1.1")).toBeNull();
    expect(toDisplayDomain("report.pdf")).toBeNull();
  });
});
