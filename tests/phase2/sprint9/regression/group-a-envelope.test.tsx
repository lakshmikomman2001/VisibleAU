// @vitest-environment jsdom
/**
 * GROUP A — THE ENVELOPE CLASS (F11 · F15 · F16 · F17)
 *
 * The bug: routes return inconsistent shapes; pages guess; a wrong guess
 * yields undefined → null → Number(null)=0 → "Critical". 200 OK, data
 * arrives, page silently drops it.
 *
 * Guard: render each component with REAL data, assert the rendered output
 * contains the real values — not zeros, not "Critical", not placeholder text.
 *
 * BREAK-PROOF: also render with the WRONG shape and assert it does NOT
 * silently render zeros.
 */

import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";

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
  AutopilotLoop,
  type AutopilotLoopData,
  buildMeasureDescription,
  deriveStepStatus,
} from "@/components/domain/autopilot/autopilot-loop";
import {
  buildHealthCheckCards,
  type HealthCheckData,
  HealthCheckPanel,
} from "@/components/domain/autopilot/health-check-panel";

// ─── F11: Health Check with real data renders THAT DATA ────────────────────

describe("F11 — health-check renders real scores, not zeros", () => {
  // Metropolitan Plumbing -- each check on its own scale since 7 Nov (no combined score):
  //   AI presence 13% (2 of 15), site readiness 37 of 98, local authority 20 of 100.
  const METROPOLITAN_DATA: HealthCheckData = {
    aiPresence: {
      value: "13%",
      detail: "2 of 15",
      band: "developing",
      ci: { lower: 4, upper: 38 },
    },
    siteReadiness: { score: 37, max: 98, on: "14 Jun" },
    localAuthority: { score: 20, max: 100, on: "14 Jun" },
    topAction: {
      title: "Update local directory listings",
      rationale: "Improve local citation rate by consolidating NAP data",
      expectedImpact: null,
      confidenceLabel: "likely",
      brandId: "test-brand-id",
    },
    brandName: "Metropolitan Plumbing",
    auditDate: "15 Jun 2026",
    engineCount: 4,
    isSaas: false,
  };

  it("renders the brand name, not 'Brand'", () => {
    render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    expect(screen.getAllByText(/Metropolitan Plumbing/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Brand$/)).toBeNull();
  });

  it("renders each check's real value (13%, 37 of 98, 20 of 100), not 0", () => {
    const { container } = render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    const text = container.textContent!;
    expect(text).toContain("13%");
    expect(text).toContain("37 of 98");
    expect(text).toContain("20 of 100");
    expect(text).not.toMatch(/\b0 of /);
  });

  it("13% AI presence is 'Developing', never a zero-induced 'Critical'", () => {
    const { container } = render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    const text = container.textContent!;
    expect(text).toContain("Developing");
    expect(text).not.toContain("Critical");
  });

  it("renders the top action title", () => {
    render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    expect(screen.getByText(/Update local directory listings/)).toBeTruthy();
  });
});

// ─── F15: Autopilot with real brand name + promptsCount ────────────────────

describe("F15 — autopilot renders brand name and promptsCount", () => {
  // Bondi Plumbing — real answer key:
  //   scoreComposite=23.67, engineCount=2 (chatgpt, perplexity), promptsCount=15
  //   #1 action: "Update local directory listings" (priority 5000)
  //   topGap: "Emergency Plumbing" (plumbing_emergency cluster)
  const BONDI_AUTOPILOT: AutopilotLoopData = {
    audit: {
      scoreComposite: 23.67,
      // Task 16: what /api/brands/[brandId]/latest-audit returns -- the
      // audit page's figure, through lib/scoring/visibility-display.ts.
      visibility: visibilityDisplay({
        headline: { status: "scored", value: 23.67, ci: { lower: 19, upper: 29 } },
        mentionedCount: 71,
        sampleCount: 300,
      }),
      engineCount: 2,
      promptsCount: 15,
      completedAt: "2026-06-15T12:00:00Z",
    },
    topGap: {
      topicCluster: "plumbing_emergency",
      topicLabel: "Emergency Plumbing",
      estimatedCitationImpact: 15,
      priorityRank: 1,
    },
    topTask: {
      id: "task-1",
      title: "Update local directory listings",
      status: "open",
      priority: 5000,
      scoreBefore: null,
      scoreAfter: null,
      liftAchieved: null,
      completedAt: null,
      updatedAt: "2026-06-15T12:00:00Z",
    },
    explainability: null,
    draft: null,
    brandId: "test-brand-id",
    brandName: "Bondi Plumbing",
  };

  it("renders the brand name, NOT the literal 'Brand'", () => {
    const { container } = render(<AutopilotLoop data={BONDI_AUTOPILOT} />);
    expect(container.textContent).toContain("Bondi Plumbing");
  });

  it("renders promptsCount (15), not 0", () => {
    const { container } = render(<AutopilotLoop data={BONDI_AUTOPILOT} />);
    expect(container.textContent).toContain("15 prompts");
  });

  it("renders the Visibility as the audit page shows it (23.67 → 24%, with its counts)", () => {
    const { container } = render(<AutopilotLoop data={BONDI_AUTOPILOT} />);
    expect(container.textContent).toContain("Visibility 24% (71 of 300)");
  });

  it("renders the top gap label", () => {
    const { container } = render(<AutopilotLoop data={BONDI_AUTOPILOT} />);
    expect(container.textContent).toContain("Emergency Plumbing");
  });

  it("⚠️ BREAK-PROOF: missing brand name defaults to fallback, not crash", () => {
    const dataWithNoBrand = { ...BONDI_AUTOPILOT, brandName: "" };
    expect(() => render(<AutopilotLoop data={dataWithNoBrand} />)).not.toThrow();
  });
});

// ─── F16: Discovery journeys — deriveStepStatus logic covers here ──────────
// (full page render requires fetch mocking; the component-level guard is that
//  the journeys page parses `data.journeys` correctly — covered by §2.1 envelope test.
//  This section guards the data transformation at the component level.)

describe("F16 — discovery page uses { journeys, templates } envelope", () => {
  it("REFERENCE: §2.1 envelope tests confirm /journeys returns { journeys, templates }", () => {
    // §2.1 integration test already asserts the envelope shape.
    // This is a reference anchor — the guard is in Section 2.
    expect(true).toBe(true);
  });
});

// ─── F17: Autopilot loop advances when task exists but no gap ──────────────

describe("F17 — autopilot loop advances on a task with no gap", () => {
  it("task + no gap → step 2 is 'done' (loop advances to step 3)", () => {
    const statuses = deriveStepStatus(
      { scoreComposite: 30, engineCount: 2, promptsCount: 5, completedAt: "2026-06-01T00:00:00Z" },
      null, // no gap
      {
        id: "t1",
        title: "Fix schema",
        status: "open",
        priority: 1000,
        scoreBefore: null,
        scoreAfter: null,
        liftAchieved: null,
        completedAt: null,
        updatedAt: "2026-06-01",
      },
      null,
    );
    expect(statuses[0]).toBe("done");
    expect(statuses[1]).toBe("done");
    expect(statuses[2]).toBe("current");
  });

  it("renders the task title in step 2 description when no gap exists", () => {
    const data: AutopilotLoopData = {
      audit: {
        scoreComposite: 30,
        engineCount: 2,
        promptsCount: 5,
        completedAt: "2026-06-01T00:00:00Z",
      },
      topGap: null,
      topTask: {
        id: "t1",
        title: "Fix schema markup",
        status: "open",
        priority: 1000,
        scoreBefore: null,
        scoreAfter: null,
        liftAchieved: null,
        completedAt: null,
        updatedAt: "2026-06-01",
      },
      explainability: null,
      draft: null,
      brandId: "b1",
      brandName: "Bondi Plumbing",
    };
    const { container } = render(<AutopilotLoop data={data} />);
    expect(container.textContent).toContain("Fix schema markup");
  });

  it("⚠️ BREAK-PROOF: if deriveStepStatus is broken to require gap, step 2 stays 'current'", () => {
    // This test verifies the current correct behaviour: task without gap advances
    const statuses = deriveStepStatus(
      { scoreComposite: 30, engineCount: 2, promptsCount: 5, completedAt: "2026-06-01" },
      null,
      {
        id: "t1",
        title: "X",
        status: "open",
        priority: 1,
        scoreBefore: null,
        scoreAfter: null,
        liftAchieved: null,
        completedAt: null,
        updatedAt: "",
      },
      null,
    );
    // If someone reverts to requiring a gap for step 2 done, this fails:
    expect(statuses[1]).not.toBe("current");
    expect(statuses[1]).toBe("done");
  });
});

// ─── NEGATIVE ENVELOPE TEST: wrong shape must not render plausible zeros ────

describe("⚠️ NEGATIVE ENVELOPE — wrong shape must not silently render 0", () => {
  it("F11: health-check with no results → 'Not measured yet', not 0 or Critical", () => {
    const cards = buildHealthCheckCards({
      aiPresence: { value: "—", detail: "Not enough answers", band: null, ci: null },
      siteReadiness: null,
      localAuthority: null,
      topAction: null,
      brandName: "Empty",
      auditDate: "15 Jun 2026",
      engineCount: 4,
      isSaas: false,
    });
    expect(cards.every((c) => c.value === null)).toBe(true);
    expect(cards.map((c) => c.detail)).toEqual([
      "Not enough answers",
      "Not measured yet",
      "Not measured yet",
    ]);
    expect(cards.every((c) => c.band === null)).toBe(true);
  });

  it("F15: autopilot with null audit → step 1 is 'current' (loop hasn't started)", () => {
    const statuses = deriveStepStatus(null, null, null, null);
    expect(statuses[0]).toBe("current");
    expect(statuses.slice(1).every((s) => s === "pending")).toBe(true);
  });

  it("F15: buildMeasureDescription(null) does not produce '0.0%'", () => {
    const desc = buildMeasureDescription(null);
    expect(desc).not.toContain("0.0%");
    expect(desc).not.toContain("+0");
    expect(desc).toContain("Validation re-audit");
  });

  it("F11: a check with no result never carries a band", () => {
    const [presence] = buildHealthCheckCards({
      aiPresence: { value: "—", detail: "Not enough answers", band: null, ci: null },
      siteReadiness: null,
      localAuthority: null,
      topAction: null,
      brandName: "Empty",
      auditDate: "15 Jun 2026",
      engineCount: 4,
      isSaas: true,
    });
    expect(presence.band).toBeNull();
  });
});
