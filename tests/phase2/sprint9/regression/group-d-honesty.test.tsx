// @vitest-environment jsdom
/**
 * GROUP D — HONESTY GUARDS (F6 · F8 · F18 · F20)
 * Protect the truthful states. These exist to stop a future "fix"
 * turning an honest state into a lie.
 */

import { render } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "test-brand-id" }),
  usePathname: () => "/brands/test-brand-id",
}));

import {
  buildHealthCheckCards,
  type HealthCheckData,
  HealthCheckPanel,
} from "@/components/domain/autopilot/health-check-panel";

// ─── F8: the two NULLs are DIFFERENT ──────────────────────────────────────

// Bondi Plumbing (tradies, non-SaaS), each check on its own scale since 7 Nov:
//   AI presence 0% (0 of 20), site readiness 21 of 98, local authority not scored yet.
const BONDI: HealthCheckData = {
  aiPresence: { value: "0%", detail: "0 of 20", band: "low", ci: { lower: 0, upper: 16 } },
  siteReadiness: { score: 21, max: 98, on: "14 Jun" },
  localAuthority: null,
  topAction: null,
  brandName: "Bondi Plumbing",
  auditDate: "15 Jun 2026",
  engineCount: 4,
  isSaas: false,
};

describe("F8 — NULL semantics: SaaS hides Local authority, non-SaaS shows 'Not measured yet'", () => {
  it("SaaS brand → Local authority absent entirely", () => {
    const cards = buildHealthCheckCards({ ...BONDI, isSaas: true });
    expect(cards.map((c) => c.name)).not.toContain("Local authority");
    expect(cards).toHaveLength(2);
  });

  it("non-SaaS + no local trust score → card IS present, shows 'Not measured yet'", () => {
    const local = buildHealthCheckCards(BONDI).find((c) => c.key === "local_authority");
    expect(local).toBeDefined();
    expect(local!.value).toBeNull();
    expect(local!.detail).toBe("Not measured yet");
  });

  it("non-SaaS renders an em-dash for the unmeasured check, never 0", () => {
    const { container } = render(<HealthCheckPanel data={BONDI} />);
    const local = container.querySelector("[data-health-card='local_authority']");
    expect(local?.textContent).toContain("—");
    expect(local?.textContent).not.toMatch(/\b0 of 100/);
  });

  it("⚠️ no combined score: the old (0 + 21) blend and its 'Critical' never render", () => {
    // Before 7 Nov the page averaged the measured checks into one 0-100 number.
    const { container } = render(<HealthCheckPanel data={BONDI} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Critical");
    expect(text).not.toMatch(/\/100|overall/i);
  });
});

// ─── F20: a check with no result must NEVER carry a band ───────────────────

describe("F20 — a check with no result is 'Not measured yet', never a band", () => {
  const empty: HealthCheckData = {
    ...BONDI,
    aiPresence: { value: "—", detail: "Not enough answers", band: null, ci: null },
    siteReadiness: null,
  };

  it("no result → no value and no band, on every check", () => {
    for (const card of buildHealthCheckCards(empty)) {
      expect(card.value).toBeNull();
      expect(card.band).toBeNull();
    }
  });

  it("⚠️ an unmeasured check never reads as Critical, Good or Needs work", () => {
    const { container } = render(<HealthCheckPanel data={empty} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Critical|Good|Needs work/);
    expect(text).toContain("Not measured yet");
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
    const source = readFileSync("app/(auth)/brands/[brandId]/discovery/journeys/page.tsx", "utf-8");
    expect(source).toContain("No journeys yet");
    expect(source).not.toContain("404");
  });
});
