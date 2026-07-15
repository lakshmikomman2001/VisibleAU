// @vitest-environment jsdom
/**
 * SECTION 4.0 + 4.2 — autopilot-loop.tsx — the LLD's declared states
 *
 * 4.0: The canon clause nobody tested — flat/negative lift_achieved.
 * 4.2: All states canon declares for the component.
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
  useParams: () => ({ brandId: "b1" }),
  usePathname: () => "/brands/b1",
}));

import {
  AutopilotLoop,
  deriveStepStatus,
  buildMeasureDescription,
  type AutopilotLoopData,
  type RemediationTask,
} from "@/components/domain/autopilot/autopilot-loop";

// ─── 4.0: FLAT/NEGATIVE LIFT — the canon clause nobody tested ──────────────

describe("4.0 — buildMeasureDescription: flat + negative lift honesty", () => {
  it("scoreAfter=NULL → 'Validation audit scheduled — pending' (no number at all)", () => {
    const task: RemediationTask = {
      id: "t1", title: "Fix NAP", status: "complete", priority: 1000,
      scoreBefore: 23, scoreAfter: null, liftAchieved: null,
      completedAt: "2026-06-20", updatedAt: "2026-06-20",
    };
    const desc = buildMeasureDescription(task);
    expect(desc).toBe("Validation audit scheduled — pending");
    expect(desc).not.toMatch(/\d+\.\d%/);
    expect(desc).not.toContain("improved");
    expect(desc).not.toContain("+");
  });

  it("liftAchieved=+7.3 → shows improvement with +7.3", () => {
    const task: RemediationTask = {
      id: "t1", title: "Fix NAP", status: "complete", priority: 1000,
      scoreBefore: 23, scoreAfter: 42.5, liftAchieved: 7.3,
      completedAt: "2026-06-20", updatedAt: "2026-06-20",
    };
    const desc = buildMeasureDescription(task);
    expect(desc).toContain("+7.3");
    expect(desc).toContain("improved");
  });

  it("liftAchieved=0 → 'No measurable change yet' — NOT 'improved 0%'", () => {
    const task: RemediationTask = {
      id: "t1", title: "Fix NAP", status: "complete", priority: 1000,
      scoreBefore: 42.5, scoreAfter: 42.5, liftAchieved: 0,
      completedAt: "2026-06-20", updatedAt: "2026-06-20",
    };
    const desc = buildMeasureDescription(task);
    expect(desc).toContain("No measurable change yet");
    expect(desc).not.toContain("improved");
    expect(desc).not.toContain("+");
    expect(desc).not.toContain("0.0%");
  });

  it("liftAchieved=-5.2 → shows real negative delta, NOT 'improved 5.2%'", () => {
    const task: RemediationTask = {
      id: "t1", title: "Fix NAP", status: "complete", priority: 1000,
      scoreBefore: 42.5, scoreAfter: 37.3, liftAchieved: -5.2,
      completedAt: "2026-06-20", updatedAt: "2026-06-20",
    };
    const desc = buildMeasureDescription(task);
    expect(desc).toContain("-5.2");
    expect(desc).not.toContain("improved");
    expect(desc).not.toContain("+");
    // Must not hide the sign or absolutize — no unsigned "5.2%" without the leading minus
    expect(desc).not.toMatch(/[^-]5\.2%/);
    expect(desc).toContain("-5.2%");
  });

  it("negative uses 'changed' not 'decreased' or 'improved' (current wording)", () => {
    const task: RemediationTask = {
      id: "t1", title: "Fix NAP", status: "complete", priority: 1000,
      scoreBefore: 42.5, scoreAfter: 37.3, liftAchieved: -5.2,
      completedAt: "2026-06-20", updatedAt: "2026-06-20",
    };
    const desc = buildMeasureDescription(task);
    expect(desc).toContain("changed");
  });

  it("⚠️ ABSENCE: 'improved' / '↑' / '+' NEVER appear for zero or negative lift", () => {
    const zero: RemediationTask = {
      id: "t1", title: "X", status: "complete", priority: 1,
      scoreBefore: 30, scoreAfter: 30, liftAchieved: 0,
      completedAt: null, updatedAt: "",
    };
    const neg: RemediationTask = {
      id: "t2", title: "Y", status: "complete", priority: 1,
      scoreBefore: 30, scoreAfter: 25, liftAchieved: -5,
      completedAt: null, updatedAt: "",
    };
    for (const task of [zero, neg]) {
      const desc = buildMeasureDescription(task);
      expect(desc).not.toContain("improved");
      expect(desc).not.toContain("↑");
      expect(desc).not.toMatch(/\+\d/);
    }
  });

  it("null task → 'Validation re-audit will run after draft approval'", () => {
    const desc = buildMeasureDescription(null);
    expect(desc).toBe("Validation re-audit will run after draft approval");
    expect(desc).not.toContain("improved");
    expect(desc).not.toContain("+");
  });
});

// ─── 4.2: DECLARED STATES ──────────────────────��───────────────────────────

describe("4.2 — AutopilotLoop: declared states (canon §6U.2)", () => {
  // Bondi real fixture: audit done, task open, no gap filled yet
  const BONDI_DATA: AutopilotLoopData = {
    audit: { scoreComposite: 23.67, engineCount: 2, promptsCount: 15, completedAt: "2026-06-15T12:00:00Z" },
    topGap: { topicCluster: "plumbing_emergency", topicLabel: "Emergency Plumbing", estimatedCitationImpact: 15, priorityRank: 1 },
    topTask: { id: "t1", title: "Update local directory listings", status: "open", priority: 5000, scoreBefore: null, scoreAfter: null, liftAchieved: null, completedAt: null, updatedAt: "2026-06-15" },
    explainability: null,
    draft: null,
    brandId: "bondi-brand-id",
    brandName: "Bondi Plumbing",
  };

  // Metropolitan: no task → honestly stalls at step 2
  const METRO_DATA: AutopilotLoopData = {
    audit: { scoreComposite: 40.5, engineCount: 4, promptsCount: 30, completedAt: "2026-06-10T12:00:00Z" },
    topGap: { topicCluster: "plumbing_general", topicLabel: "General Plumbing", estimatedCitationImpact: 8, priorityRank: 1 },
    topTask: null,
    explainability: null,
    draft: null,
    brandId: "metro-brand-id",
    brandName: "Metropolitan Plumbing",
  };

  describe("in-flight state", () => {
    it("Bondi (task open, no gap filled) → step 3 is 'current', future steps dashed", () => {
      const statuses = deriveStepStatus(BONDI_DATA.audit, BONDI_DATA.topGap, BONDI_DATA.topTask, null);
      expect(statuses[0]).toBe("done");
      expect(statuses[1]).toBe("done");
      expect(statuses[2]).toBe("current");
      expect(statuses[3]).toBe("pending");
      expect(statuses[4]).toBe("pending");
    });

    it("renders 'Step 3 of 5' indicator for Bondi's state", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("Step 3 of 5");
    });

    it("Metropolitan (no task) → honestly stalls at step 2 'current'", () => {
      const statuses = deriveStepStatus(METRO_DATA.audit, METRO_DATA.topGap, null, null);
      expect(statuses[0]).toBe("done");
      expect(statuses[1]).toBe("done");
      expect(statuses[2]).toBe("current");
    });
  });

  describe("loop-not-started (no audit)", () => {
    it("no audit → step 1 is 'current', all others 'pending'", () => {
      const statuses = deriveStepStatus(null, null, null, null);
      expect(statuses[0]).toBe("current");
      expect(statuses.slice(1).every(s => s === "pending")).toBe(true);
    });

    it("renders 'Waiting for first audit to complete' — not a fabricated description", () => {
      const data: AutopilotLoopData = {
        audit: null, topGap: null, topTask: null,
        explainability: null, draft: null,
        brandId: "b1", brandName: "Test Brand",
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Waiting for first audit to complete");
    });

    it("⚠️ FINDING: canon says EmptyState, component renders 5 steps — gap documented", () => {
      // Canon (§6U.2): "an EmptyState explaining the loop populates after the first audit + gap —
      // NOT five pending steps with fabricated copy"
      // ACTUAL: component renders steps[0] as "current" with honest "Waiting..." copy.
      // This is a CANON DISAGREEMENT but NOT dishonest — the copy is truthful.
      // Documenting as a minor finding, NOT F24.
      const data: AutopilotLoopData = {
        audit: null, topGap: null, topTask: null,
        explainability: null, draft: null,
        brandId: "b1", brandName: "Test Brand",
      };
      const { container } = render(<AutopilotLoop data={data} />);
      // It renders 5 steps (including pending ones) — NOT an EmptyState
      expect(container.textContent).toContain("Audit complete");
      expect(container.textContent).toContain("#1 gap identified");
      // The pending steps have description text:
      expect(container.textContent).toContain("No gaps identified yet");
    });
  });

  describe("measure-pending state", () => {
    it("scoreAfter=null → step 5 renders 'Validation audit scheduled — pending', no number", () => {
      const data: AutopilotLoopData = {
        ...BONDI_DATA,
        topTask: { ...BONDI_DATA.topTask!, status: "complete", scoreAfter: null, liftAchieved: null },
        draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Validation audit scheduled — pending");
      expect(container.textContent).not.toMatch(/\+\d+\.\d%/);
    });
  });

  describe("measure-complete state (including flat/negative — 4.0 render)", () => {
    it("positive lift → renders improvement in step 5 description", () => {
      const data: AutopilotLoopData = {
        ...BONDI_DATA,
        topTask: { ...BONDI_DATA.topTask!, status: "complete", scoreAfter: 30.0, liftAchieved: 7.3, completedAt: "2026-06-25" },
        draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("+7.3%");
      expect(container.textContent).toContain("improved");
    });

    it("negative lift → renders honest 'changed -X%' NOT 'improved'", () => {
      const data: AutopilotLoopData = {
        ...BONDI_DATA,
        topTask: { ...BONDI_DATA.topTask!, status: "complete", scoreAfter: 18.5, liftAchieved: -5.2, completedAt: "2026-06-25" },
        draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("-5.2%");
      expect(container.textContent).toContain("changed");
      expect(container.textContent).not.toContain("improved");
    });

    it("zero lift → 'No measurable change yet', NOT 'improved 0%'", () => {
      const data: AutopilotLoopData = {
        ...BONDI_DATA,
        topTask: { ...BONDI_DATA.topTask!, status: "complete", scoreAfter: 23.67, liftAchieved: 0, completedAt: "2026-06-25" },
        draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("No measurable change yet");
      expect(container.textContent).not.toContain("improved");
    });

    it("all 5 steps 'done' → shows 'Loop complete' (not 'Step X of 5')", () => {
      const data: AutopilotLoopData = {
        ...BONDI_DATA,
        topTask: { ...BONDI_DATA.topTask!, status: "complete", scoreAfter: 30.0, liftAchieved: 7.3, completedAt: "2026-06-25" },
        draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Loop complete");
      expect(container.textContent).not.toContain("Step ");
    });
  });

  describe("⚠️ FINDING: loading skeletons NOT implemented", () => {
    it("component takes props (no internal fetch) — loading is parent's responsibility", () => {
      // Canon (§6U.2) says: "loading → step skeletons render"
      // ACTUAL: AutopilotLoop accepts `data: AutopilotLoopData` as a prop —
      // it does not fetch internally, so there is no loading state in this component.
      // The loading skeleton must live in the PAGE (parent) that fetches and passes data.
      // This is a MINOR STRUCTURAL GAP, not an honesty issue.
      const { readFileSync } = require("fs");
      const source = readFileSync("components/domain/autopilot/autopilot-loop.tsx", "utf-8");
      expect(source).not.toContain("useState");
      expect(source).not.toContain("useEffect");
      expect(source).not.toContain("loading");
      expect(source).not.toContain("skeleton");
    });
  });

  describe("⚠️ FINDING: no error boundary implemented", () => {
    it("component has no error boundary — will throw on malformed data", () => {
      // Canon (§6U.2) says: "error → an error boundary — not a silent empty"
      // ACTUAL: No error boundary. If `data` is somehow malformed, React will throw.
      // This is a MISSING FEATURE, not a honesty issue.
      const { readFileSync } = require("fs");
      const source = readFileSync("components/domain/autopilot/autopilot-loop.tsx", "utf-8");
      expect(source).not.toContain("ErrorBoundary");
      expect(source).not.toContain("error");
    });
  });

  describe("real fixtures with Bondi data", () => {
    it("renders brand name in header", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("Bondi Plumbing");
    });

    it("renders score (23.7) from the audit", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("23.7");
    });

    it("renders promptsCount (15 prompts)", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("15 prompts");
    });

    it("renders top gap label 'Emergency Plumbing'", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("Emergency Plumbing");
    });

    it("renders explainability placeholder when null (F9/F13 carried)", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("Explanation will appear after gap analysis");
    });
  });
});
