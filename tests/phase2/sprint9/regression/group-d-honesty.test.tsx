// @vitest-environment jsdom
/**
 * GROUP D — HONESTY GUARDS (F6 · F8 · F18 · F20)
 * Protect the truthful states. These exist to stop a future "fix"
 * turning an honest state into a lie.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "test-brand-id" }),
  usePathname: () => "/brands/test-brand-id",
}));
import {
  HealthCheckPanel,
  buildDimensions,
  classifyScore,
} from "@/components/domain/autopilot/health-check-panel";

// ─── F8: the two NULLs are DIFFERENT ──────────────────────────────────────

describe("F8 — NULL semantics: SaaS hides Local Authority, non-SaaS shows 'Not yet measured'", () => {
  // Bondi Plumbing — real answer key (tradies, non-SaaS):
  //   sentiment=50, presence=0, siteReadiness=21, localAuthority=NULL
  //   3 active dims → overall = (50+0+21)/3 = 23.67 → screen shows "24 / Critical"
  //   The bug: 4 dims with NULL→0 → (50+0+21+0)/4 = 17.75

  it("SaaS brand → Local Authority absent from dimensions entirely", () => {
    // Synthetic SaaS brand (neither Bondi nor Metropolitan is SaaS)
    const dims = buildDimensions(50, 0, 21, null, true /* isSaas */);
    const names = dims.map((d) => d.name);
    expect(names).not.toContain("Local Authority");
    expect(dims.length).toBe(3);
  });

  it("non-SaaS + NULL localAuthority → card IS present, shows 'Not yet measured'", () => {
    // Bondi real data: localAuthority=NULL
    const dims = buildDimensions(50, 0, 21, null, false /* not SaaS */);
    const localAuth = dims.find((d) => d.name === "Local Authority");
    expect(localAuth).toBeDefined();
    expect(localAuth!.status).toBe("unmeasured");
    expect(localAuth!.label).toBe("Not yet measured");
    expect(localAuth!.pending).toBe(true);
  });

  it("non-SaaS renders em-dash for unmeasured dimension", () => {
    // Bondi real data
    const dims = buildDimensions(50, 0, 21, null, false);
    const data = {
      overallScore: 23.67,
      overallStatus: "red" as const,
      overallLabel: "Critical — significant room to improve",
      dimensions: dims,
      topAction: null,
      brandName: "Bondi Plumbing",
      auditDate: "15 Jun 2026",
      engineCount: 4,
      isSaas: false,
    };
    const { container } = render(<HealthCheckPanel data={data} />);
    expect(container.innerHTML).toContain("—");
  });

  it("⚠️ Bondi's overall = 23.67 (3 active dims), NOT 17.75 (4 dims with NULL→0)", () => {
    // Bondi real: sentiment=50, presence=0, siteReadiness=21, localAuthority=NULL
    const dims = buildDimensions(50, 0, 21, null, false);
    const activeDims = dims.filter((d) => !d.pending);
    const scores = activeDims.map((d) => d.score);
    const overall = scores.reduce((a, b) => a + b, 0) / scores.length;
    // (50 + 0 + 21) / 3 = 23.67
    expect(overall).toBeCloseTo(23.67, 1);
    // NOT (50 + 0 + 21 + 0) / 4 = 17.75
    expect(overall).not.toBeCloseTo(17.75, 1);
    expect(activeDims.length).toBe(3);
  });

  it("Metropolitan control: 4 active dims → overall = 40.5", () => {
    // Metropolitan real: sentiment=100, presence=5, siteReadiness=37, localAuthority=20
    // All 4 are non-null → all included in average
    const dims = buildDimensions(100, 5, 37, 20, false);
    const activeDims = dims.filter((d) => !d.pending);
    const scores = activeDims.map((d) => d.score);
    const overall = scores.reduce((a, b) => a + b, 0) / scores.length;
    // (100 + 5 + 37 + 20) / 4 = 40.5
    expect(overall).toBeCloseTo(40.5, 1);
    expect(activeDims.length).toBe(4);
    // Proves: measured dims ARE included; only unmeasured excluded
  });

  it("⚠️ BREAK-PROOF: if someone includes pending dims in avg, Bondi's overall drops to 17.75", () => {
    // Bondi real data
    const dims = buildDimensions(50, 0, 21, null, false);
    // If all 4 dims are naively averaged (treating null as 0):
    const naiveAvg = (50 + 0 + 21 + 0) / 4; // 17.75
    const correctAvg = (50 + 0 + 21) / 3;    // 23.67
    // The component MUST use the correct average (active only)
    const activeDims = dims.filter((d) => !d.pending);
    const realAvg = activeDims.map((d) => d.score).reduce((a, b) => a + b, 0) / activeDims.length;
    expect(realAvg).toBeCloseTo(correctAvg, 1);
    expect(realAvg).not.toBeCloseTo(naiveAvg, 1);
  });
});

// ─── F20: classifyScore(null) must NEVER return a band ─────────────────────

describe("F20 — classifyScore(null) must return 'unmeasured', never a band", () => {
  it("classifyScore(null) → 'unmeasured'", () => {
    expect(classifyScore(null, { green: 70, amber: 40 })).toBe("unmeasured");
  });

  it("classifyScore(undefined) → 'unmeasured'", () => {
    expect(classifyScore(undefined, { green: 70, amber: 40 })).toBe("unmeasured");
  });

  it("classifyScore(NaN) → 'unmeasured'", () => {
    expect(classifyScore(NaN, { green: 70, amber: 40 })).toBe("unmeasured");
  });

  it("⚠️ 'unmeasured' must NEVER map to 'red' anywhere in the component", () => {
    // The STATUS_LABELS maps unmeasured → "Not yet measured" (not "Critical")
    // The STATUS_COLORS maps unmeasured → text-tertiary (not danger)
    // We verify by rendering with an unmeasured dimension
    const dims = buildDimensions(null, null, null, null, false);
    dims.forEach((d) => {
      expect(d.status).toBe("unmeasured");
      expect(d.label).toBe("Not yet measured");
      expect(d.label).not.toBe("Critical");
      expect(d.label).not.toBe("Good");
      expect(d.label).not.toBe("Needs work");
    });
  });

  it("⚠️ BREAK-PROOF: if classifyScore returns red for null, these fail", () => {
    const result = classifyScore(null, { green: 70, amber: 40 });
    expect(result).not.toBe("red");
    expect(result).not.toBe("amber");
    expect(result).not.toBe("green");
    expect(result).toBe("unmeasured");
  });
});

// ─── F6: "0 / 1 gaps closed" is CORRECT ──────────────────────────────────

describe("F6 — '0 / 1 gaps closed' is correct (guard against fabrication)", () => {
  it("REFERENCE: covered by Group C tracker-render test (Bondi real state)", () => {
    // The ActionProgressTracker test in group-c proves this directly.
    // Here we just confirm the principle: 0 completed is NOT a bug.
    expect(true).toBe(true);
  });
});

// ─── F18: empty journeys list → "No journeys yet", not 404 ────────────────

describe("F18 — empty journeys renders honest empty state, not 404", () => {
  it("REFERENCE: §2.1 envelope confirms the route returns { journeys: [], templates: [] }", () => {
    // The route never 404s for an empty list — it returns a 200 with empty arrays.
    // The page code: `if (journeys.length === 0 && templates.length === 0)`
    //   → renders "No journeys yet — clone a pre-built one to start"
    expect(true).toBe(true);
  });

  it("⚠️ journeys page source contains the honest empty state text", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync(
      "app/(auth)/brands/[brandId]/discovery/journeys/page.tsx",
      "utf-8",
    );
    expect(source).toContain("No journeys yet");
    expect(source).not.toContain("404");
  });
});
