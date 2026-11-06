// @vitest-environment jsdom
/**
 * SECTION 4.3 — health-check-panel.tsx — measured checks + the #1 action
 *
 * Since 7 Nov (Sri's decision 2): three measured checks side by side, no combined score. AI presence
 * uses the Visibility bands (strong / developing / low); site readiness and local authority have no
 * documented bands, so they aren't coloured. A check with no result says "Not measured yet", never 0.
 * SaaS → Local authority absent from the DOM. Raw audit multidims must NOT appear.
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

import {
  type HealthCheckData,
  HealthCheckPanel,
} from "@/components/domain/autopilot/health-check-panel";

// ─── FIXTURES ───────────────────────────────────────────────────────────────

const TOP_ACTION = {
  title: "Update local directory listings",
  rationale: "Consolidate NAP data across directories",
  expectedImpact: null,
  confidenceLabel: "likely",
  brandId: "metro-id",
};

// Metropolitan real values: Visibility 13% (2 of 15), technical 37 of 98, local trust 20.
const METROPOLITAN: HealthCheckData = {
  brandName: "Metropolitan Plumbing",
  auditDate: "15 Jun 2026",
  engineCount: 4,
  isSaas: false,
  aiPresence: { value: "13%", detail: "2 of 15", band: "developing", ci: { lower: 4, upper: 38 } },
  siteReadiness: { score: 37, max: 98, on: "14 Jun" },
  localAuthority: { score: 20, max: 100, on: "14 Jun" },
  topAction: TOP_ACTION,
};

// Bondi real values: Visibility 0% (0 of 20), technical 21 of 98, local trust not scored.
const BONDI: HealthCheckData = {
  ...METROPOLITAN,
  brandName: "Bondi Plumbing",
  engineCount: 2,
  aiPresence: { value: "0%", detail: "0 of 20", band: "low", ci: { lower: 0, upper: 16 } },
  siteReadiness: { score: 21, max: 98, on: "14 Jun" },
  localAuthority: null,
};

const card = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-health-card='${key}']`) as HTMLElement | null;

describe("4.3 — HealthCheckPanel: measured checks + #1 action", () => {
  describe("Metropolitan real data", () => {
    it("shows each check's own number on its own scale", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(card(container, "ai_presence")?.textContent).toContain("13%");
      expect(card(container, "site_readiness")?.textContent).toContain("37 of 98");
      expect(card(container, "local_authority")?.textContent).toContain("20 of 100");
    });

    it("AI presence: 13% is Developing, with its counts and interval", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      const presence = card(container, "ai_presence")?.textContent ?? "";
      expect(presence).toContain("Developing");
      expect(presence).toContain("Named in 2 of 15 answers");
      expect(presence).toContain("95% CI 4–38%");
      expect(presence).not.toContain("Critical");
    });

    it("site readiness and local authority say what they're built from, and when", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(card(container, "site_readiness")?.textContent).toContain("robots.txt");
      expect(card(container, "site_readiness")?.textContent).toContain("Checked 14 Jun");
      expect(card(container, "local_authority")?.textContent).toContain("Google Business Profile");
      expect(card(container, "local_authority")?.textContent).toContain("Scored 14 Jun");
    });

    it("renders 4 engines", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain("4 AI engines");
    });

    it("no combined score anywhere", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).not.toMatch(/\/100|overall/i);
      // (13 + 37 + 20) / 3 = 23.3: the old blend.
      expect(container.textContent).not.toContain("23");
    });
  });

  describe("Bondi real data", () => {
    it("0% is Low on the Visibility bands", () => {
      const { container } = render(<HealthCheckPanel data={BONDI} />);
      expect(card(container, "ai_presence")?.textContent).toContain("Low");
    });

    it("local authority with no score → 'Not measured yet' and an em-dash, never 0", () => {
      const { container } = render(<HealthCheckPanel data={BONDI} />);
      const local = card(container, "local_authority")?.textContent ?? "";
      expect(local).toContain("Not measured yet");
      expect(local).toContain("—");
      expect(local).not.toContain("0 of 100");
    });
  });

  describe("SaaS → Local authority absent from DOM", () => {
    it("SaaS brand has NO 'Local authority' card", () => {
      const { container } = render(<HealthCheckPanel data={{ ...METROPOLITAN, isSaas: true }} />);
      expect(container.textContent).not.toContain("Local authority");
      expect(container.querySelectorAll("[data-health-card]")).toHaveLength(2);
    });
  });

  describe("only AI presence is coloured", () => {
    it("site readiness and local authority carry no band label", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      for (const key of ["site_readiness", "local_authority"]) {
        const text = card(container, key)?.textContent ?? "";
        expect(text).not.toMatch(/Strong|Developing|Low|Good|Needs work|Critical/);
      }
    });
  });

  describe("raw audit multidims must NOT appear (§12 grep)", () => {
    it("component source does NOT contain scorePosition/scoreContext/scoreAccuracy", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("components/domain/autopilot/health-check-panel.tsx", "utf8");
      expect(source).not.toContain("scorePosition");
      expect(source).not.toContain("scoreContext");
      expect(source).not.toContain("scoreAccuracy");
    });

    it("rendered DOM does not contain raw multidim labels", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      const text = container.textContent ?? "";
      expect(text).not.toContain("Score Position");
      expect(text).not.toContain("scoreContext");
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
      const { container } = render(
        <HealthCheckPanel data={{ ...METROPOLITAN, topAction: null }} />,
      );
      expect(container.textContent).not.toContain("#1 recommended action");
    });
  });

  describe("hero banner — reduced-motion-safe (RM-02)", () => {
    it("⚠️ WEAK (CSS-class): hero has motion-safe:animate-gradient-shift", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.querySelector(".motion-safe\\:animate-gradient-shift")).not.toBeNull();
    });

    it("names the three checks, not a score", () => {
      const { container } = render(<HealthCheckPanel data={METROPOLITAN} />);
      expect(container.textContent).toContain(
        "Health Check: AI presence, site readiness and local authority",
      );
    });
  });
});
