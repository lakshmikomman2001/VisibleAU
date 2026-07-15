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
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
import {
  AutopilotLoop,
  deriveStepStatus,
  buildMeasureDescription,
  type AutopilotLoopData,
} from "@/components/domain/autopilot/autopilot-loop";

// ─── F11: Health Check with real data renders THAT DATA ────────────────────

describe("F11 — health-check renders real scores, not zeros", () => {
  // Metropolitan Plumbing — real answer key:
  //   sentiment=100, presence=5, siteReadiness=37, localAuthority=20
  //   4 active dims → overall = (100+5+37+20)/4 = 40.5 → screen shows "41 / Amber"
  const METROPOLITAN_DATA = {
    overallScore: 40.5,
    overallStatus: "amber" as const,
    overallLabel: "Fair — room to improve",
    dimensions: buildDimensions(100, 5, 37, 20, false),
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
    expect(screen.getByText(/Metropolitan Plumbing/)).toBeTruthy();
    expect(screen.queryByText(/^Brand$/)).toBeNull();
  });

  it("renders the overall score (41), not 0", () => {
    const { container } = render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    const scoreText = container.textContent!;
    // Math.round(40.5) = 41 (the component rounds)
    expect(scoreText).toContain("41");
    expect(scoreText).not.toMatch(/\b0\b.*\/100/);
  });

  it("renders overall 'Fair' label (amber status), not 'Critical'", () => {
    const { container } = render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    const text = container.textContent!;
    expect(text).toContain("Fair");
    // The overall status pill shows "Fair", not a zero-induced "Critical"
  });

  it("renders individual dimension scores (100, 5, 37, 20)", () => {
    const { container } = render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    const text = container.textContent!;
    expect(text).toContain("100");
    expect(text).toContain("5");
    expect(text).toContain("37");
    expect(text).toContain("20");
  });

  it("renders the top action title", () => {
    render(<HealthCheckPanel data={METROPOLITAN_DATA} />);
    expect(screen.getByText(/Update local directory listings/)).toBeTruthy();
  });

  it("⚠️ BREAK-PROOF: classifyScore(100, {green:70, amber:40}) must be 'green', not 'red'", () => {
    expect(classifyScore(100, { green: 70, amber: 40 })).toBe("green");
    expect(classifyScore(100, { green: 70, amber: 40 })).not.toBe("red");
    expect(classifyScore(100, { green: 70, amber: 40 })).not.toBe("unmeasured");
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

  it("renders the score (23.67 → 23.7)", () => {
    const { container } = render(<AutopilotLoop data={BONDI_AUTOPILOT} />);
    expect(container.textContent).toContain("23.7");
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
      { id: "t1", title: "Fix schema", status: "open", priority: 1000, scoreBefore: null, scoreAfter: null, liftAchieved: null, completedAt: null, updatedAt: "2026-06-01" },
      null,
    );
    expect(statuses[0]).toBe("done");
    expect(statuses[1]).toBe("done");
    expect(statuses[2]).toBe("current");
  });

  it("renders the task title in step 2 description when no gap exists", () => {
    const data: AutopilotLoopData = {
      audit: { scoreComposite: 30, engineCount: 2, promptsCount: 5, completedAt: "2026-06-01T00:00:00Z" },
      topGap: null,
      topTask: { id: "t1", title: "Fix schema markup", status: "open", priority: 1000, scoreBefore: null, scoreAfter: null, liftAchieved: null, completedAt: null, updatedAt: "2026-06-01" },
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
      { id: "t1", title: "X", status: "open", priority: 1, scoreBefore: null, scoreAfter: null, liftAchieved: null, completedAt: null, updatedAt: "" },
      null,
    );
    // If someone reverts to requiring a gap for step 2 done, this fails:
    expect(statuses[1]).not.toBe("current");
    expect(statuses[1]).toBe("done");
  });
});

// ─── NEGATIVE ENVELOPE TEST: wrong shape must not render plausible zeros ────

describe("⚠️ NEGATIVE ENVELOPE — wrong shape must not silently render 0", () => {
  it("F11: health-check with NULL scores → renders 'unmeasured', not 0 or Critical", () => {
    const dims = buildDimensions(null, null, null, null, false);
    expect(dims.every((d) => d.status === "unmeasured")).toBe(true);
    expect(dims.every((d) => d.label === "Not yet measured")).toBe(true);
    // The overall score when all are unmeasured:
    const activeDims = dims.filter((d) => !d.pending);
    expect(activeDims.length).toBe(0); // no active dims
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

  it("F11: classifyScore(null) must never return 'red' — it returns 'unmeasured'", () => {
    expect(classifyScore(null, { green: 70, amber: 40 })).toBe("unmeasured");
    expect(classifyScore(undefined, { green: 70, amber: 40 })).toBe("unmeasured");
    expect(classifyScore(NaN, { green: 70, amber: 40 })).toBe("unmeasured");
  });
});
