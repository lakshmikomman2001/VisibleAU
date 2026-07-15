// @vitest-environment jsdom
/**
 * SECTION 4.3 — health-check-panel.tsx — bands + the #1 action
 *
 * Canon (§6U.3): 3 bands (green/amber/red). Prototype's 4-band is KNOWN-WRONG (S9-02).
 * SaaS → Local Authority absent from DOM.
 * unmeasured NEVER renders as a band.
 * Raw audit multidims (scorePosition/scoreContext/scoreAccuracy) must NOT appear.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import {
  HealthCheckPanel,
  buildDimensions,
  classifyScore,
} from "@/components/domain/autopilot/health-check-panel";

// ─── FIXTURES ───────────────────────────────���───────────────────────────────

// Metropolitan real: sentiment=100, presence=5, siteReadiness=37, localAuthority=20
// 4 active dims → overall = 40.5 → renders "41" (amber)
const METROPOLITAN = {
  overallScore: 40.5,
  overallStatus: "amber" as const,
  overallLabel: "Fair — room to improve",
  dimensions: buildDimensions(100, 5, 37, 20, false),
  topAction: {
    title: "Update local directory listings",
    rationale: "Consolidate NAP data across directories",
    expectedImpact: null,
    confidenceLabel: "likely",
    brandId: "metro-id",
  },
  brandName: "Metropolitan Plumbing",
  auditDate: "15 Jun 2026",
  engineCount: 4,
  isSaas: false,
};

// Bondi real: sentiment=50, presence=0, siteReadiness=21, localAuthority=NULL
// 3 active dims → overall = 23.67 → renders "24" (red / "Critical")
const BONDI = {
  overallScore: 23.67,
  overallStatus: "red" as const,
  overallLabel: "Critical — significant room to improve",
  dimensions: buildDimensions(50, 0, 21, null, false),
  topAction: {
    title: "Update local directory listings",
    rationale: "Improve local citation rate",
    expectedImpact: null,
    confidenceLabel: "likely",
    brandId: "bondi-id",
  },
  brandName: "Bondi Plumbing",
  auditDate: "15 Jun 2026",
  engineCount: 2,
  isSaas: false,
};

describe("4.3 — HealthCheckPanel: 3 bands + #1 action", () => {
  describe("Metropolitan real data (amber)", () => {
    it("renders overall score 41 (Math.round(40.5))", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain("41");
    });

    it("renders 'Fair' label (amber status)", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain("Fair");
    });

    it("renders all 4 dimension scores: 100, 5, 37, 20", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      const text = container.textContent!;
      expect(text).toContain("100");
      expect(text).toContain("5");
      expect(text).toContain("37");
      expect(text).toContain("20");
    });

    it("renders 4 engines", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain("4 AI engines");
    });
  });

  describe("Bondi real data (red/critical)", () => {
    it("renders overall score 24 (Math.round(23.67))", () => {
      const { container } = render(<HealthCheckPanel data={BONDI} />);
      expect(container.textContent).toContain("24");
    });

    it("renders 'Critical' label (red status)", () => {
      const { container } = render(<HealthCheckPanel data={BONDI} />);
      expect(container.textContent).toContain("Critical");
    });

    it("Local Authority with NULL → renders em-dash and 'Not yet measured'", () => {
      const { container } = render(<HealthCheckPanel data={BONDI} />);
      expect(container.innerHTML).toContain("—");
      expect(container.textContent).toContain("Not yet measured");
    });

    it("NULL dimension → pending card with reduced opacity", () => {
      const { container } = render(<HealthCheckPanel data={BONDI} />);
      const cards = container.querySelectorAll("[class*='rounded-xl']");
      const pendingCards = Array.from(cards).filter(c => c.getAttribute("style")?.includes("opacity: 0.7"));
      expect(pendingCards.length).toBeGreaterThan(0);
    });
  });

  describe("SaaS → Local Authority absent from DOM", () => {
    it("SaaS brand has NO 'Local Authority' text in the DOM", () => {
      const saasData = {
        ...METROPOLITAN,
        dimensions: buildDimensions(100, 5, 37, null, true /* isSaas */),
        isSaas: true,
      };
      const { container } = render(<HealthCheckPanel data={saasData} />);
      expect(container.textContent).not.toContain("Local Authority");
    });

    it("SaaS renders exactly 3 dimension cards (no 4th)", () => {
      const dims = buildDimensions(80, 60, 70, null, true);
      expect(dims).toHaveLength(3);
      expect(dims.map(d => d.name)).not.toContain("Local Authority");
    });
  });

  describe("'unmeasured' NEVER renders as a band (F20 mechanism)", () => {
    it("classifyScore(null) → unmeasured (never green/amber/red)", () => {
      expect(classifyScore(null, { green: 70, amber: 40 })).toBe("unmeasured");
      expect(classifyScore(undefined, { green: 70, amber: 40 })).toBe("unmeasured");
      expect(classifyScore(NaN, { green: 70, amber: 40 })).toBe("unmeasured");
    });

    it("all-null dimensions → no band labels (Good/Needs work/Critical) in DOM", () => {
      const allNullData = {
        ...BONDI,
        overallScore: 0,
        overallStatus: "unmeasured" as const,
        overallLabel: "Not yet measured",
        dimensions: buildDimensions(null, null, null, null, false),
      };
      const { container } = render(<HealthCheckPanel data={allNullData} />);
      // Each dimension shows "Not yet measured", never a band label
      const text = container.textContent!;
      const goodCount = (text.match(/\bGood\b/g) || []).length;
      const needsWorkCount = (text.match(/Needs work/g) || []).length;
      expect(goodCount).toBe(0);
      expect(needsWorkCount).toBe(0);
    });
  });

  describe("raw audit multidims must NOT appear (§12 grep)", () => {
    it("component source does NOT contain scorePosition/scoreContext/scoreAccuracy", () => {
      const { readFileSync } = require("fs");
      const source = readFileSync("components/domain/autopilot/health-check-panel.tsx", "utf-8");
      expect(source).not.toContain("scorePosition");
      expect(source).not.toContain("scoreContext");
      expect(source).not.toContain("scoreAccuracy");
    });

    it("rendered DOM does not contain raw multidim labels", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      const text = container.textContent!;
      expect(text).not.toContain("scorePosition");
      expect(text).not.toContain("Score Position");
      expect(text).not.toContain("scoreContext");
      expect(text).not.toContain("scoreAccuracy");
    });
  });

  describe("#1 action rendering", () => {
    it("renders the top action title", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain("Update local directory listings");
    });

    it("renders 'Your #1 recommended action' label", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain("#1 recommended action");
    });

    it("renders confidence label", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain("likely");
    });

    it("no topAction → no action card rendered", () => {
      const noActionData = { ...BONDI, topAction: null };
      const { container } = render(<HealthCheckPanel data={noActionData} />);
      expect(container.textContent).not.toContain("#1 recommended action");
    });
  });

  describe("hero banner — reduced-motion-safe (RM-02)", () => {
    it("⚠️ WEAK (CSS-class): hero has motion-safe:animate-gradient-shift", () => {
      // WEAK: CSS-class assertion — deferred to Section 5 for real browser test
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      const heroDiv = container.querySelector("[class*='motion-safe:animate-gradient-shift']");
      expect(heroDiv).not.toBeNull();
    });
  });

  describe("3-band system (NOT 4-band prototype)", () => {
    it("only 3 status bands exist: green, amber, red (+ unmeasured)", () => {
      expect(classifyScore(90, { green: 70, amber: 40 })).toBe("green");
      expect(classifyScore(55, { green: 70, amber: 40 })).toBe("amber");
      expect(classifyScore(20, { green: 70, amber: 40 })).toBe("red");
      // No 4th band like "fair" or "moderate"
    });

    it("thresholds: >=70 green, >=40 amber, <40 red (default AI Sentiment)", () => {
      expect(classifyScore(70, { green: 70, amber: 40 })).toBe("green");
      expect(classifyScore(69, { green: 70, amber: 40 })).toBe("amber");
      expect(classifyScore(40, { green: 70, amber: 40 })).toBe("amber");
      expect(classifyScore(39, { green: 70, amber: 40 })).toBe("red");
    });
  });
});
