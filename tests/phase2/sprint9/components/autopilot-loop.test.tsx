// @vitest-environment jsdom
/**
 * SECTION 4.0 + 4.2 — autopilot-loop.tsx — the LLD's declared states
 *
 * 4.0: The canon clause nobody tested — flat/negative lift_achieved.
 * 4.2: All states canon declares for the component.
 */

import { render } from "@testing-library/react";
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
  useParams: () => ({ brandId: "b1" }),
  usePathname: () => "/brands/b1",
}));

import {
  AutopilotLoop,
  type AutopilotLoopData,
  buildMeasureDescription,
  deriveStepStatus,
  type RemediationTask,
} from "@/components/domain/autopilot/autopilot-loop";

// ─── 4.0: FLAT/NEGATIVE LIFT — the canon clause nobody tested ──────────────

// 17 Nov, part 3: step 5 shows the task's measured change from its own audit to its re-audit (the tasks API's
// `change`, lib/visibility/audit-change.ts), never lift_achieved (the re-audit minus score_before, an expected-impact
// bucket of 80/50/20: "Citation rate improved +7.3% · verified by re-audit").
const FIG_49 = {
  auditId: "a49",
  auditNumber: 49,
  completedAt: null,
  value: "28%",
  counts: "11 of 40",
  shownPercent: 28,
};
const FIG_50 = {
  auditId: "a50",
  auditNumber: 50,
  completedAt: null,
  value: "33%",
  counts: "13 of 40",
  shownPercent: 33,
};
const UP = {
  kind: "measured" as const,
  before: FIG_49,
  after: FIG_50,
  points: 5,
  direction: "up" as const,
  line: "Audit #49 → #50: 28% (11 of 40) → 33% (13 of 40), up 5 points",
};
const DOWN = {
  kind: "measured" as const,
  before: FIG_50,
  after: FIG_49,
  points: -5,
  direction: "down" as const,
  line: "Audit #50 → #49: 33% (13 of 40) → 28% (11 of 40), down 5 points",
};
const SAME = {
  kind: "measured" as const,
  before: FIG_50,
  after: FIG_50,
  points: 0,
  direction: "same" as const,
  line: "Audit #50 → #50: 33% (13 of 40) → 33% (13 of 40), no change",
};

describe("4.0 — buildMeasureDescription: the measured change, up, down or the same", () => {
  const task = (over: Partial<RemediationTask>): RemediationTask => ({
    id: "t1",
    title: "X",
    status: "complete",
    priority: 1,
    scoreBefore: 80,
    scoreAfter: 30,
    liftAchieved: -50,
    completedAt: null,
    updatedAt: "",
    ...over,
  });

  it("up, down and no change: each its own line, with both audits and counts", () => {
    expect(buildMeasureDescription(task({ reauditId: "a50", change: UP }))).toBe(UP.line);
    expect(buildMeasureDescription(task({ reauditId: "a49", change: DOWN }))).toBe(DOWN.line);
    expect(buildMeasureDescription(task({ reauditId: "a50", change: SAME }))).toBe(SAME.line);
  });

  it("⚠️ never the stored lift (score_before 80 is an expected-impact bucket)", () => {
    for (const change of [UP, DOWN, SAME]) {
      const desc = buildMeasureDescription(task({ reauditId: "a50", change }));
      expect(desc).not.toMatch(/-50|80|Citation rate|improved/);
    }
    expect(buildMeasureDescription(task({}))).toBe("Not re-audited yet");
  });

  it("null task → what starts a re-audit", () => {
    expect(buildMeasureDescription(null)).toBe(
      "Mark a task done to have it re-audited 14 days later",
    );
  });
});

// ─── 4.2: DECLARED STATES ──────────────────────��───────────────────────────

describe("4.2 — AutopilotLoop: declared states (canon §6U.2)", () => {
  // Bondi real fixture: audit done, task open, no gap filled yet
  const BONDI_DATA: AutopilotLoopData = {
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
      id: "t1",
      title: "Update local directory listings",
      status: "open",
      priority: 5000,
      scoreBefore: null,
      scoreAfter: null,
      liftAchieved: null,
      completedAt: null,
      updatedAt: "2026-06-15",
    },
    explainability: null,
    draft: null,
    brandId: "bondi-brand-id",
    brandName: "Galah Plumbing",
  };

  // Metropolitan: no task → honestly stalls at step 2
  const METRO_DATA: AutopilotLoopData = {
    audit: {
      scoreComposite: 40.5,
      engineCount: 4,
      promptsCount: 30,
      completedAt: "2026-06-10T12:00:00Z",
    },
    topGap: {
      topicCluster: "plumbing_general",
      topicLabel: "General Plumbing",
      estimatedCitationImpact: 8,
      priorityRank: 1,
    },
    topTask: null,
    explainability: null,
    draft: null,
    brandId: "metro-brand-id",
    brandName: "Metropolitan Plumbing",
  };

  describe("in-flight state", () => {
    it("Bondi (task open, no gap filled) → step 3 is 'current', future steps dashed", () => {
      const statuses = deriveStepStatus(
        BONDI_DATA.audit,
        BONDI_DATA.topGap,
        BONDI_DATA.topTask,
        null,
      );
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
      expect(statuses.slice(1).every((s) => s === "pending")).toBe(true);
    });

    it("renders 'Waiting for first audit to complete' — not a fabricated description", () => {
      const data: AutopilotLoopData = {
        audit: null,
        topGap: null,
        topTask: null,
        explainability: null,
        draft: null,
        brandId: "b1",
        brandName: "Test Brand",
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Waiting for first audit to complete");
    });

    it("renders 5 steps (including pending ones) — NOT an EmptyState", () => {
      // Canon (§6U.2): "an EmptyState explaining the loop populates after the first audit + gap —
      // NOT five pending steps with fabricated copy"
      // ACTUAL: component renders steps[0] as "current" with honest "Waiting..." copy.
      // This is a CANON DISAGREEMENT but NOT dishonest — the copy is truthful.
      // Documenting as a minor finding, NOT F24.
      const data: AutopilotLoopData = {
        audit: null,
        topGap: null,
        topTask: null,
        explainability: null,
        draft: null,
        brandId: "b1",
        brandName: "Test Brand",
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Audit complete");
    });

    it("⚠️ V: pre-audit → step 2 reads 'Scanning for gaps…', never '#1 gap identified' over 'No gaps identified yet'", () => {
      // Pre-V, step 2's title was the hardcoded constant "#1 gap identified"
      // even before the audit (which the gap scan depends on) had finished —
      // directly contradicting its own description, "No gaps identified yet".
      const data: AutopilotLoopData = {
        audit: null,
        topGap: null,
        topTask: null,
        explainability: null,
        draft: null,
        brandId: "b1",
        brandName: "Test Brand",
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Scanning for gaps…");
      expect(container.textContent).not.toContain("#1 gap identified");
      expect(container.textContent).not.toContain("No gaps identified yet");
    });
  });

  describe("⚠️ V — zero content gaps is a resolved, terminal outcome, not a stall", () => {
    const NO_GAPS_DATA: AutopilotLoopData = {
      audit: {
        scoreComposite: 40.5,
        engineCount: 4,
        promptsCount: 30,
        completedAt: "2026-06-10T12:00:00Z",
      },
      topGap: null,
      topTask: null,
      explainability: null,
      draft: null,
      brandId: "metro-brand-id",
      brandName: "Metropolitan Plumbing",
    };

    it("step 2 is 'done' (checkmark), not 'current' — no 'In progress' badge anywhere", () => {
      const statuses = deriveStepStatus(
        NO_GAPS_DATA.audit,
        NO_GAPS_DATA.topGap,
        NO_GAPS_DATA.topTask,
        NO_GAPS_DATA.draft,
      );
      expect(statuses).toEqual(["done", "done", "pending", "pending", "pending"]);

      const { container } = render(<AutopilotLoop data={NO_GAPS_DATA} />);
      expect(container.textContent).not.toContain("In progress");
    });

    it("title reads 'No content gaps found', never the stale '#1 gap identified'", () => {
      const { container } = render(<AutopilotLoop data={NO_GAPS_DATA} />);
      expect(container.textContent).toContain("No content gaps found");
      expect(container.textContent).not.toContain("#1 gap identified");
    });

    it("banner reads a clean resting state, not a misleading 'Loop complete'", () => {
      const { container } = render(<AutopilotLoop data={NO_GAPS_DATA} />);
      expect(container.textContent).toContain(
        "No content gaps found — nothing to action right now",
      );
    });
  });

  describe("measure-pending state", () => {
    it("done, not re-audited → step 5 says when the re-audit is due, no number", () => {
      const data: AutopilotLoopData = {
        ...BONDI_DATA,
        topTask: {
          ...BONDI_DATA.topTask!,
          status: "complete",
          scoreAfter: null,
          liftAchieved: null,
          completedAt: "2026-06-25T00:00:00.000Z",
        },
        draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Not re-audited yet");
      expect(container.textContent).toContain("Re-audit due");
      expect(container.textContent).not.toMatch(/\+\d+\.\d%/);
    });
  });

  describe("measure-complete state (up, down, the same)", () => {
    const withChange = (change: typeof UP | typeof DOWN | typeof SAME): AutopilotLoopData => ({
      ...BONDI_DATA,
      topTask: {
        ...BONDI_DATA.topTask!,
        status: "complete",
        // The stored columns, deliberately wrong: never shown.
        scoreAfter: 30.0,
        liftAchieved: 7.3,
        completedAt: "2026-06-25",
        reauditId: change.after.auditId,
        change,
      },
      draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
    });

    it("up → the change line, never the stored +7.3%", () => {
      const { container } = render(<AutopilotLoop data={withChange(UP)} />);
      expect(container.textContent).toContain(UP.line);
      expect(container.textContent).not.toMatch(/\+7\.3%|improved/);
    });

    it("down → 'down 5 points', never 'improved'", () => {
      const { container } = render(<AutopilotLoop data={withChange(DOWN)} />);
      expect(container.textContent).toContain(DOWN.line);
      expect(container.textContent).not.toContain("improved");
    });

    it("the same → 'no change'", () => {
      const { container } = render(<AutopilotLoop data={withChange(SAME)} />);
      expect(container.textContent).toContain(SAME.line);
    });

    it("all 5 steps 'done' → shows 'Loop complete' (not 'Step X of 5')", () => {
      const data: AutopilotLoopData = {
        ...BONDI_DATA,
        topTask: {
          ...BONDI_DATA.topTask!,
          status: "complete",
          scoreAfter: 30.0,
          liftAchieved: 7.3,
          completedAt: "2026-06-25",
        },
        draft: { id: "d1", title: "Draft content", status: "approved", approvedAt: "2026-06-20" },
      };
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Loop complete");
      expect(container.textContent).not.toContain("Step ");
    });
  });

  describe("⚠️ FINDING: loading skeletons NOT implemented", () => {
    it("component takes props (no internal fetch) — no useState/useEffect, no skeleton markup", () => {
      // Canon (§6U.2) says: "loading → step skeletons render"
      // ACTUAL: AutopilotLoop accepts `data: AutopilotLoopData` as a prop —
      // it does not fetch internally, so there is no *network* loading state
      // in this component. The loading skeleton must live in the PAGE
      // (parent) that fetches and passes data. This is a MINOR STRUCTURAL
      // GAP, not an honesty issue.
      //
      // ⚠️ V: step 2 does now have a "loading" *phase* (resolveStep2Phase),
      // for the pre-condition where the audit it depends on hasn't finished
      // yet — that's a pure derived-state concept, not a fetch/hook, so it
      // doesn't contradict "no internal fetch" above.
      const { readFileSync } = require("fs");
      const source = readFileSync("components/domain/autopilot/autopilot-loop.tsx", "utf-8");
      expect(source).not.toContain("useState");
      expect(source).not.toContain("useEffect");
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
      expect(container.textContent).toContain("Galah Plumbing");
    });

    it("renders the audit's Visibility as the audit page shows it (24%, 71 of 300)", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("Visibility 24% (71 of 300)");
      expect(container.textContent).not.toContain("23.7");
    });

    // 17 Nov, part 3: no "N prompts" (prompts_count counted the branded questions too): the audit's own
    // "71 of 300" says how many everyday answers.
    it("step 1 has no prompt count, only the audit's own answers", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).not.toContain("15 prompts");
      expect(container.textContent).toContain("71 of 300");
    });

    it("renders top gap label 'Emergency Plumbing'", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("Emergency Plumbing");
    });

    // 17 Nov, part 2: no "Explanation will appear after gap analysis" (nothing ever supplies one): the task's
    // own description, or that none is recorded.
    it("with no explanation: says none is recorded for the task, never a placeholder (F9/F13 carried)", () => {
      const { container } = render(<AutopilotLoop data={BONDI_DATA} />);
      expect(container.textContent).toContain("No explanation is recorded for this task.");
      expect(container.textContent).not.toContain("will appear after");
    });

    it("with the task's description: step 3 is that description", () => {
      const data = {
        ...BONDI_DATA,
        topTask: {
          ...(BONDI_DATA.topTask as object),
          description: "Add an emergency plumbing page.",
        },
      } as typeof BONDI_DATA;
      const { container } = render(<AutopilotLoop data={data} />);
      expect(container.textContent).toContain("Add an emergency plumbing page.");
    });
  });
});
