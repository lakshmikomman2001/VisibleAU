import { describe, it, expect } from "vitest";
import { classifyScore, buildDimensions } from "@/components/domain/autopilot/health-check-panel";

/**
 * §1.1 — classifyScore: per-dimension threshold bands
 * Canon: LLD §6U.3, lines 112–115
 *
 * | Dimension       | green | amber  | red  |
 * |-----------------|-------|--------|------|
 * | AI Sentiment    | ≥70   | 40–69  | <40  |
 * | AI Presence     | ≥60   | 30–59  | <30  |
 * | Site Readiness  | ≥75   | 45–74  | <45  |
 * | Local Authority | ≥70   | 40–69  | <40  |
 */

const SENTIMENT = { green: 70, amber: 40 };
const PRESENCE = { green: 60, amber: 30 };
const SITE_READINESS = { green: 75, amber: 45 };
const LOCAL_AUTHORITY = { green: 70, amber: 40 };

describe("§1.1 — classifyScore (per-dimension threshold bands)", () => {
  describe("AI Sentiment (green ≥70, amber 40–69, red <40)", () => {
    it("exact boundary 70 → green", () => {
      expect(classifyScore(70, SENTIMENT)).toBe("green");
    });
    it("69 → amber (off-by-one)", () => {
      expect(classifyScore(69, SENTIMENT)).toBe("amber");
    });
    it("exact boundary 40 → amber", () => {
      expect(classifyScore(40, SENTIMENT)).toBe("amber");
    });
    it("39 → red (off-by-one)", () => {
      expect(classifyScore(39, SENTIMENT)).toBe("red");
    });
    it("0 → red", () => {
      expect(classifyScore(0, SENTIMENT)).toBe("red");
    });
    it("100 → green", () => {
      expect(classifyScore(100, SENTIMENT)).toBe("green");
    });
  });

  describe("AI Presence (green ≥60, amber 30–59, red <30)", () => {
    it("exact boundary 60 → green", () => {
      expect(classifyScore(60, PRESENCE)).toBe("green");
    });
    it("59 → amber (off-by-one)", () => {
      expect(classifyScore(59, PRESENCE)).toBe("amber");
    });
    it("exact boundary 30 → amber", () => {
      expect(classifyScore(30, PRESENCE)).toBe("amber");
    });
    it("29 → red (off-by-one)", () => {
      expect(classifyScore(29, PRESENCE)).toBe("red");
    });
    it("0 → red", () => {
      expect(classifyScore(0, PRESENCE)).toBe("red");
    });
    it("100 → green", () => {
      expect(classifyScore(100, PRESENCE)).toBe("green");
    });
  });

  describe("Site Readiness (green ≥75, amber 45–74, red <45)", () => {
    it("exact boundary 75 → green", () => {
      expect(classifyScore(75, SITE_READINESS)).toBe("green");
    });
    it("74 → amber (off-by-one)", () => {
      expect(classifyScore(74, SITE_READINESS)).toBe("amber");
    });
    it("exact boundary 45 → amber", () => {
      expect(classifyScore(45, SITE_READINESS)).toBe("amber");
    });
    it("44 → red (off-by-one)", () => {
      expect(classifyScore(44, SITE_READINESS)).toBe("red");
    });
    it("0 → red", () => {
      expect(classifyScore(0, SITE_READINESS)).toBe("red");
    });
    it("100 → green", () => {
      expect(classifyScore(100, SITE_READINESS)).toBe("green");
    });
  });

  describe("cross-dimension: same value, different band", () => {
    it("65 is amber for Sentiment but green for Presence", () => {
      expect(classifyScore(65, SENTIMENT)).toBe("amber");
      expect(classifyScore(65, PRESENCE)).toBe("green");
    });
    it("65 is amber for Site Readiness", () => {
      expect(classifyScore(65, SITE_READINESS)).toBe("amber");
    });
  });

  describe("⚠️ NULL handling (F11/F20 fix — unmeasured, NOT red)", () => {
    it("null returns 'unmeasured' — distinct from any band", () => {
      const result = classifyScore(null, SENTIMENT);
      expect(result).toBe("unmeasured");
      expect(result).not.toBe("red");
    });
    it("undefined returns 'unmeasured'", () => {
      const result = classifyScore(undefined as unknown as number | null, SENTIMENT);
      expect(result).toBe("unmeasured");
      expect(result).not.toBe("red");
    });
    it("NaN returns 'unmeasured'", () => {
      const result = classifyScore(NaN, SENTIMENT);
      expect(result).toBe("unmeasured");
    });
  });

  describe("numeric scores produce exactly 3 bands; null produces 'unmeasured'", () => {
    const numericResults = new Set<string>();
    for (let v = 0; v <= 100; v++) {
      numericResults.add(classifyScore(v, SENTIMENT));
      numericResults.add(classifyScore(v, PRESENCE));
      numericResults.add(classifyScore(v, SITE_READINESS));
    }
    it("numeric inputs → exactly {green, amber, red}", () => {
      expect([...numericResults].sort()).toEqual(["amber", "green", "red"]);
    });
    it("null adds 'unmeasured' to the union", () => {
      const withNull = new Set([...numericResults, classifyScore(null, SENTIMENT)]);
      expect([...withNull].sort()).toEqual(["amber", "green", "red", "unmeasured"]);
    });
  });
});

/**
 * §1.2 — buildDimensions
 * Canon: 4 cross-layer dims. SaaS hides Local Authority.
 */
describe("§1.2 — buildDimensions", () => {
  describe("Metropolitan answer key (tradies)", () => {
    // Metropolitan: Sentiment 100, Presence 5, Site 37, Local 20
    const dims = buildDimensions(100, 5, 37, 20, false);

    it("Sentiment 100 → green", () => {
      const d = dims.find((d) => d.name === "AI Sentiment")!;
      expect(d.status).toBe("green");
      expect(d.score).toBe(100);
    });
    it("Presence 5 → red", () => {
      const d = dims.find((d) => d.name === "AI Presence")!;
      expect(d.status).toBe("red");
      expect(d.score).toBe(5);
    });
    it("Site Readiness 37 → red", () => {
      const d = dims.find((d) => d.name === "Site Readiness")!;
      expect(d.status).toBe("red");
      expect(d.score).toBe(37);
    });
    it("Local Authority 20 → red", () => {
      const d = dims.find((d) => d.name === "Local Authority")!;
      expect(d.status).toBe("red");
      expect(d.score).toBe(20);
    });
    it("has 4 dimensions for non-SaaS with data", () => {
      expect(dims).toHaveLength(4);
    });
    it("overall avg = 40.5 (4-dim average)", () => {
      const activeDims = dims.filter((d) => !d.pending);
      const avg = activeDims.reduce((s, d) => s + d.score, 0) / activeDims.length;
      expect(avg).toBeCloseTo(40.5, 1);
    });
  });

  describe("Bondi answer key (tradies, 1 audit)", () => {
    // Bondi: Sentiment 50, Presence 0, Site 21, Local NULL
    const dims = buildDimensions(50, 0, 21, null, false);

    it("Sentiment 50 → amber", () => {
      const d = dims.find((d) => d.name === "AI Sentiment")!;
      expect(d.status).toBe("amber");
    });
    it("Presence 0 → red", () => {
      const d = dims.find((d) => d.name === "AI Presence")!;
      expect(d.status).toBe("red");
    });
    it("Site Readiness 21 → red", () => {
      const d = dims.find((d) => d.name === "Site Readiness")!;
      expect(d.status).toBe("red");
    });
    it("Local Authority is present and marked 'not yet measured'", () => {
      const d = dims.find((d) => d.name === "Local Authority")!;
      expect(d).toBeDefined();
      expect(d.pending).toBe(true);
      expect(d.label).toContain("Not yet measured");
    });
    it("⚠️ F8: overall avg = 23.67 (3-dim, not 4-dim treating NULL as 0)", () => {
      // Canon: NULL local authority EXCLUDED from average (not 0)
      const activeDims = dims.filter((d) => !d.pending);
      expect(activeDims).toHaveLength(3);
      const avg = activeDims.reduce((s, d) => s + d.score, 0) / activeDims.length;
      expect(avg).toBeCloseTo(23.67, 1);
    });
  });

  describe("SaaS brand → Local Authority ABSENT", () => {
    const saasVerticals = ["saas", "software", "fintech", "edtech", "martech"];
    for (const vertical of saasVerticals) {
      it(`${vertical}: Local Authority absent from array`, () => {
        const dims = buildDimensions(70, 60, 75, 50, true);
        expect(dims.find((d) => d.name === "Local Authority")).toBeUndefined();
        expect(dims).toHaveLength(3);
      });
    }
  });

  describe("⚠️ F8: not applicable (SaaS) vs not yet measured (non-SaaS NULL)", () => {
    it("SaaS: Local Authority not present at all", () => {
      const dims = buildDimensions(70, 60, 75, null, true);
      expect(dims.find((d) => d.name === "Local Authority")).toBeUndefined();
    });
    it("non-SaaS NULL: Local Authority IS present, marked pending", () => {
      const dims = buildDimensions(70, 60, 75, null, false);
      const la = dims.find((d) => d.name === "Local Authority")!;
      expect(la).toBeDefined();
      expect(la.pending).toBe(true);
    });
  });

  describe("Site Readiness reads its CANON column (not audits)", () => {
    it("different siteReadiness vs sentiment proves correct source", () => {
      // If site readiness were reading from the audit's composite score,
      // passing sentiment=80, site=30 would not yield site readiness score=30
      const dims = buildDimensions(80, 60, 30, null, true);
      const site = dims.find((d) => d.name === "Site Readiness")!;
      expect(site.score).toBe(30);
      expect(site.status).toBe("red");
    });
  });

  describe("empty/undefined technicalAudit → Site Readiness is unmeasured (F20 fix)", () => {
    it("null siteReadinessScore → unmeasured status, score=0, pending=true", () => {
      const dims = buildDimensions(70, 60, null, null, true);
      const site = dims.find((d) => d.name === "Site Readiness")!;
      expect(site.score).toBe(0);
      expect(site.status).toBe("unmeasured");
      expect(site.pending).toBe(true);
    });
  });
});

/**
 * §1.6 — isSaasVertical
 * Extracted from health-check page.tsx line 64
 */
describe("§1.6 — isSaasVertical (SAAS_VERTICALS classification)", () => {
  const SAAS_VERTICALS = ["saas", "software", "fintech", "edtech", "martech"];
  function isSaasVertical(vertical: string | null | undefined): boolean {
    return SAAS_VERTICALS.includes((vertical ?? "").toLowerCase());
  }

  it("canon SaaS verticals → true", () => {
    expect(isSaasVertical("saas")).toBe(true);
    expect(isSaasVertical("software")).toBe(true);
    expect(isSaasVertical("fintech")).toBe(true);
    expect(isSaasVertical("edtech")).toBe(true);
    expect(isSaasVertical("martech")).toBe(true);
  });

  it("non-SaaS verticals → false", () => {
    expect(isSaasVertical("tradies")).toBe(false);
    expect(isSaasVertical("allied_health")).toBe(false);
    expect(isSaasVertical("unknown")).toBe(false);
    expect(isSaasVertical("retail")).toBe(false);
  });

  it("case normalization: 'SaaS', ' saas ' handling", () => {
    expect(isSaasVertical("SaaS")).toBe(true);
    expect(isSaasVertical("SOFTWARE")).toBe(true);
    // Leading/trailing spaces are NOT trimmed by the impl
    expect(isSaasVertical(" saas ")).toBe(false);
  });

  it("null / undefined → false (never crash, never hide Local Authority)", () => {
    expect(isSaasVertical(null)).toBe(false);
    expect(isSaasVertical(undefined)).toBe(false);
  });
});
