import { describe, expect, it } from "vitest";
import { CITABILITY_METHODS, getMethodsData } from "@/lib/methodology/methods";

describe("F01: Methodology data integrity", () => {
  it("F01-01: every method either has a citationUrl, or explicitly marks itself as an unverified general practice (no orphan attribution)", () => {
    // Task NN: a method MUST NOT carry a citationUrl that doesn't actually
    // contain its claim (the fabricated "SE Ranking" pattern) -- when no
    // primary source is verified, the honest alternative is no citationUrl
    // at all, with the `citation` field saying so plainly, not inventing
    // or keeping a mismatched one.
    for (const m of CITABILITY_METHODS) {
      if (m.citationUrl) continue;
      expect(
        m.citation,
        `${m.id} has no citationUrl and doesn't mark itself as unverified`,
      ).toMatch(/no verified primary-source figure/i);
    }
  });

  it('F01-02: no fabricated "AutoGEO" or "ICLR 2026" citations', () => {
    for (const m of CITABILITY_METHODS) {
      expect(m.citation).not.toMatch(/AutoGEO/i);
      expect(m.citation).not.toMatch(/ICLR 2026/i);
      expect(m.description).not.toMatch(/AutoGEO/i);
    }
  });

  it("F01-03: citationUrls point to real domains", () => {
    const allowedDomains = [
      "arxiv.org",
      "ahrefs.com",
      "foglift.io",
      "leapd.ai",
      "superlines.io",
      "businesswire.com",
    ];
    for (const m of CITABILITY_METHODS) {
      if (!m.citationUrl) continue;
      const url = new URL(m.citationUrl);
      const matched = allowedDomains.some((d) => url.hostname.endsWith(d));
      expect(matched, `${m.id} has unknown domain: ${url.hostname}`).toBe(true);
    }
  });

  it("F01-04: GEO-bench numbers labelled as GEO-bench", () => {
    const geoMethods = CITABILITY_METHODS.filter(
      (m) => m.citationUrl?.includes("arxiv.org/abs/2311.09735") && m.effectSizeDelta.includes("%"),
    );
    for (const m of geoMethods) {
      expect(m.effectSizeDelta, `${m.id} GEO number not labelled`).toMatch(/GEO-bench/);
    }
  });

  it("F01-05: Ahrefs correlational findings are labelled as correlations; Ahrefs experiments are labelled as such", () => {
    // Task NN: not every Ahrefs-cited method is a correlation study anymore --
    // structured-data-faq cites a null-result EXPERIMENT (schema -> AI
    // citations, no significant lift). Either honest label is acceptable;
    // what's disallowed is presenting either kind as a guaranteed lift.
    const ahrefsMethods = CITABILITY_METHODS.filter((m) => m.citationUrl?.includes("ahrefs.com"));
    for (const m of ahrefsMethods) {
      const text = `${m.effectSizeDelta} ${m.description}`.toLowerCase();
      const honestlyLabeled =
        text.includes("correlat") ||
        text.includes("significant") ||
        text.includes("directional") ||
        text.includes("mixed evidence");
      expect(honestlyLabeled, `${m.id} Ahrefs finding not honestly labelled`).toBe(true);
    }
  });

  it("F01-06: getMethodsData returns correct shape", () => {
    const { all, total, top10 } = getMethodsData();
    expect(total).toBe(CITABILITY_METHODS.length);
    expect(all).toHaveLength(total);
    expect(top10).toHaveLength(Math.min(10, total));
    expect(top10).toEqual(all.slice(0, 10));
  });

  it("F01-07: every method has valid dimension", () => {
    const validDimensions = ["frequency", "position", "sentiment", "context", "accuracy"];
    for (const m of CITABILITY_METHODS) {
      expect(validDimensions).toContain(m.dimension);
    }
  });

  it("F01-08: every method has valid effort", () => {
    const validEfforts = ["low", "medium", "high"];
    for (const m of CITABILITY_METHODS) {
      expect(validEfforts).toContain(m.effort);
    }
  });

  it("F01-09: no duplicate method IDs", () => {
    const ids = CITABILITY_METHODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
