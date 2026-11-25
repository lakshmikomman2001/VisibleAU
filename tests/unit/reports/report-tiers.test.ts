/**
 * S01 part 8 (LLD 8.1.7, D-RT1 revised, D-RT3): report tiers per plan and the page set per tier.
 */
import { describe, expect, it } from "vitest";
import {
  capTierAtPlan,
  lowestPlanForTier,
  maxReportTierFor,
  pagesForTier,
  planNamesTiers,
  reportTierAllowed,
  tierNamesFrom,
  tiersForPlan,
} from "@/lib/reports/report-tiers";

describe("tiers per plan (tiers.ts maxReportTier)", () => {
  it("Free and Starter have no reports; Growth Basic and Standard; Agency and up all three", () => {
    expect(maxReportTierFor("free")).toBeNull();
    expect(maxReportTierFor("starter")).toBeNull();
    expect(maxReportTierFor("growth")).toBe("standard");
    for (const plan of ["agency", "agency_pro", "enterprise"])
      expect(maxReportTierFor(plan)).toBe("enhanced");
    expect(tiersForPlan("starter")).toEqual([]);
    expect(tiersForPlan("growth")).toEqual(["basic", "standard"]);
    expect(tiersForPlan("agency")).toEqual(["basic", "standard", "enhanced"]);
  });

  it("reportTierAllowed is the one check", () => {
    expect(reportTierAllowed("free", "basic")).toBe(false);
    expect(reportTierAllowed("growth", "standard")).toBe(true);
    expect(reportTierAllowed("growth", "enhanced")).toBe(false);
    expect(reportTierAllowed("agency_pro", "enhanced")).toBe(true);
    expect(reportTierAllowed("some_unknown_plan", "basic")).toBe(false);
  });

  it("a scheduled tier is capped at the plan", () => {
    expect(capTierAtPlan("growth", "enhanced")).toBe("standard");
    expect(capTierAtPlan("agency", "enhanced")).toBe("enhanced");
    expect(capTierAtPlan("starter", "basic")).toBeNull();
  });

  it("'Available on {plan} and up'", () => {
    expect(lowestPlanForTier("basic")).toBe("Growth");
    expect(lowestPlanForTier("enhanced")).toBe("Agency");
  });
});

describe("tier names (D-RT3)", () => {
  it("Agency and up rename the tiers; missing or blank names fall back", () => {
    expect(planNamesTiers("growth")).toBe(false);
    expect(planNamesTiers("agency")).toBe(true);
    expect(
      tierNamesFrom({ basic: "Essentials", standard: "  ", enhanced: "Premium Audit" }, "agency"),
    ).toEqual({
      basic: "Essentials",
      standard: "Standard",
      enhanced: "Premium Audit",
    });
  });

  it("other plans always see the default names", () => {
    expect(tierNamesFrom({ basic: "Essentials" }, "growth")).toEqual({
      basic: "Basic",
      standard: "Standard",
      enhanced: "Enhanced",
    });
    expect(tierNamesFrom(null, "agency").enhanced).toBe("Enhanced");
  });
});

describe("pagesForTier (appendix D sections)", () => {
  it("Basic: today's pages, Diagnosis and the prioritised list", () => {
    expect(pagesForTier("basic")).toEqual([
      "cover",
      "summary",
      "engines",
      "google",
      "directories",
      "competitors",
      "diagnosis",
      "trend",
      "recommended",
      "method",
    ]);
  });
  it("Standard: What to do next instead of Diagnosis, no prioritised list, no Beyond AI answers", () => {
    const pages = pagesForTier("standard");
    expect(pages).toContain("next");
    expect(pages).not.toContain("diagnosis");
    expect(pages).not.toContain("recommended");
    expect(pages).not.toContain("beyond_ai");
  });
  // S01C part 3c, LLD amendment 62: "Standard and Enhanced run: ... Why, and what to do next; Over time; Beyond AI
  // answers (Enhanced); Method and notes." It was Beyond straight after What to do next.
  it("Enhanced: What to do next, Over time, then Beyond AI answers", () => {
    const pages = pagesForTier("enhanced");
    expect(pages.indexOf("trend")).toBe(pages.indexOf("next") + 1);
    expect(pages.indexOf("beyond_ai")).toBe(pages.indexOf("trend") + 1);
  });
});
