// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/* ─── Mocks ─────────────────────────────────────────────── */

const mockPush = vi.fn();
const mockRefresh = vi.fn();
let mockPathname = "/brands/test-brand/workflow/tasks";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, back: vi.fn() }),
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function mockIcon(name: string) {
  const Icon = (props: Record<string, unknown>) => (
    <span data-testid={`icon-${name}`} {...props} />
  );
  Icon.displayName = name;
  return Icon;
}

vi.mock("lucide-react", () => ({
  ArrowRight: mockIcon("ArrowRight"),
  FileText: mockIcon("FileText"),
  GitBranch: mockIcon("GitBranch"),
  Lock: mockIcon("Lock"),
  ChevronRight: mockIcon("ChevronRight"),
  Activity: mockIcon("Activity"),
  Bot: mockIcon("Bot"),
  Calendar: mockIcon("Calendar"),
  Check: mockIcon("Check"),
  Code: mockIcon("Code"),
  Edit3: mockIcon("Edit3"),
  ExternalLink: mockIcon("ExternalLink"),
  Hash: mockIcon("Hash"),
  ListTodo: mockIcon("ListTodo"),
  MapPin: mockIcon("MapPin"),
  MessageCircle: mockIcon("MessageCircle"),
  MonitorDot: mockIcon("MonitorDot"),
  Shield: mockIcon("Shield"),
  Sparkles: mockIcon("Sparkles"),
  Tag: mockIcon("Tag"),
  Trash2: mockIcon("Trash2"),
  X: mockIcon("X"),
}));

vi.mock("@/lib/verticals/expand-prompt", () => ({
  formatLocation: (region: string) => region,
}));

beforeEach(() => {
  mockPush.mockClear();
  mockRefresh.mockClear();
  mockPathname = "/brands/test-brand/workflow/tasks";
});

/* ─── Component imports ─────────────────────────────────── */

import { StatusBadge } from "@/components/phase2/status-badge";
import { PriorityBadge } from "@/components/phase2/priority-badge";
import { ConfidenceBadge } from "@/components/phase2/confidence-badge";
import { ContentFormatBadge } from "@/components/domain/workflow/content-format-badge";
import { LiftIndicator } from "@/components/domain/workflow/lift-indicator";
import { WorkCompletedCard } from "@/components/domain/workflow/work-completed-card";
import { WorkflowSubNav } from "@/components/domain/workflow/workflow-sub-nav";
import { TaskCard } from "@/components/domain/workflow/task-card";
import { TaskKanban } from "@/components/domain/workflow/task-kanban";
import { WorkflowHubClient } from "@/app/(auth)/brands/[brandId]/workflow/workflow-hub-client";
import { GenerateDraftModal } from "@/components/domain/workflow/generate-draft-modal";
import { ContentDraftViewer } from "@/components/domain/workflow/content-draft-viewer";
import { RecommendationCard } from "@/components/domain/action-center/recommendation-card";
import { BrandFilter } from "@/components/domain/action-center/brand-filter";
import { TierGate } from "@/components/domain/action-center/tier-gate";
import { ConfidenceBadge as ActionConfidenceBadge } from "@/components/domain/action-center/confidence-badge";
import { ActionStatusButtons } from "@/components/domain/action-center/action-status-buttons";
import { DimensionGroup } from "@/components/domain/action-center/dimension-group";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";

/* ─── Shared test data ──────────────────────────────────── */

const TASK_BASE = {
  id: "task-1",
  title: "Optimise FAQ schema",
  status: "open",
  priority: 1,
  effort: "medium" as string | null,
  confidenceLabel: "High" as string | null,
  dimension: "accuracy" as string | null,
  scoreBefore: "55" as string | null,
  scoreAfter: null as string | null,
  assignedTo: null as string | null,
  dueDate: null as string | null,
  reauditDeferredReason: null as string | null,
};

const DRAFT_BASE = {
  id: "draft-1",
  title: "Expert guide to FAQ schema",
  body: "This guide explains how to optimise FAQ schema markup for AI engines.",
  status: "draft",
  draftType: "ai",
  contentFormat: "expert_article",
  formatRecommendationReason: "High search overlap",
  targetWordCount: 1200,
  wordCount: 850,
};

const BRAND_BASE = {
  id: "test-brand-id",
  name: "TestBrand",
  domain: "testbrand.com.au",
  vertical: "finance",
  region: "AU_EN",
  competitors: ["comp1.com.au"],
  primaryRegions: ["Sydney"],
};

const REC_ITEM_BASE = {
  id: "rec-1",
  title: "Add FAQ schema to pricing page",
  action: "Implement FAQ structured data",
  confidenceLabel: "confirmed",
  expectedImpactScore: "high",
  evidenceRefs: [{ source: "ChatGPT", url: "https://example.com" }],
};

/* ═══════════════════════════════════════════════════════════
   1. StatusBadge — Assertion #9
   ═══════════════════════════════════════════════════════════ */

describe("StatusBadge", () => {
  const cases: Array<[string, string]> = [
    ["complete", "Done"],
    ["draft", "Draft"],
    ["approved", "Approved"],
    ["published", "Published"],
    ["rejected", "Rejected"],
    ["ready_for_review", "Review"],
    ["open", "Open"],
    ["in_progress", "In Progress"],
    ["wont_fix", "Won't Fix"],
    ["scheduled", "Scheduled"],
    ["running", "Running"],
    ["completed", "Completed"],
    ["failed", "Failed"],
    ["pending", "Generating…"],
  ];

  it.each(cases)("maps %s → %s", (status, label) => {
    render(<StatusBadge status={status as "open"} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   2. PriorityBadge
   ═══════════════════════════════════════════════════════════ */

describe("PriorityBadge", () => {
  it('renders "High Impact" for high band', () => {
    render(<PriorityBadge band="high" />);
    expect(screen.getByText("High Impact")).toBeInTheDocument();
  });

  it('renders "Medium Impact" for medium band', () => {
    render(<PriorityBadge band="medium" />);
    expect(screen.getByText("Medium Impact")).toBeInTheDocument();
  });

  it('renders "Low Impact" for low band', () => {
    render(<PriorityBadge band="low" />);
    expect(screen.getByText("Low Impact")).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   3. ConfidenceBadge (phase2)
   ═══════════════════════════════════════════════════════════ */

describe("ConfidenceBadge (phase2)", () => {
  it("renders level text", () => {
    render(<ConfidenceBadge level="High" />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("returns null when level is null", () => {
    const { container } = render(<ConfidenceBadge level={null} />);
    expect(container.firstChild).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════
   4. ContentFormatBadge
   ═══════════════════════════════════════════════════════════ */

describe("ContentFormatBadge", () => {
  const knownFormats: Array<[string, string]> = [
    ["expert_article", "Expert Article"],
    ["how_to_guide", "How-To Guide"],
    ["listicle", "Listicle"],
    ["faq_block", "FAQ Block"],
    ["comparison_article", "Comparison"],
    ["case_study", "Case Study"],
    ["press_release", "Press Release"],
    ["linkedin_article", "LinkedIn Article"],
  ];

  it.each(knownFormats)("maps %s → %s", (format, label) => {
    render(<ContentFormatBadge format={format} reason={null} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("falls back to raw format for unknown value", () => {
    render(<ContentFormatBadge format="podcast_transcript" reason={null} />);
    expect(screen.getByText("podcast_transcript")).toBeInTheDocument();
  });

  it("renders reason when provided", () => {
    render(<ContentFormatBadge format="listicle" reason="High search overlap" />);
    expect(screen.getByText("High search overlap")).toBeInTheDocument();
  });

  it("does not render reason when null", () => {
    const { container } = render(<ContentFormatBadge format="listicle" reason={null} />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════
   5. LiftIndicator — Assertion #3 (lift two-state)
   ═══════════════════════════════════════════════════════════ */

describe("LiftIndicator", () => {
  it("returns null when scoreBefore is null", () => {
    const { container } = render(
      <LiftIndicator scoreBefore={null} scoreAfter={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders before → after with delta when both present", () => {
    render(<LiftIndicator scoreBefore={42} scoreAfter={58} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(screen.getByText(/58/)).toBeInTheDocument();
    expect(screen.getByText(/\+16\.0/)).toBeInTheDocument();
  });

  it("renders before → — when scoreAfter is null", () => {
    render(<LiftIndicator scoreBefore={42} scoreAfter={null} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows green (success) color for improvement", () => {
    render(<LiftIndicator scoreBefore={40} scoreAfter={60} />);
    const afterSpan = screen.getByText("60").closest("span");
    expect(afterSpan?.style.color).toBe("var(--success)");
  });

  it("shows red (danger) color for decline", () => {
    render(<LiftIndicator scoreBefore={60} scoreAfter={40} />);
    const afterSpan = screen.getByText("40").closest("span");
    expect(afterSpan?.style.color).toBe("var(--danger)");
  });
});

/* ═══════════════════════════════════════════════════════════
   6. WorkCompletedCard — Assertion #8 (dashboard two-state)
   ═══════════════════════════════════════════════════════════ */

describe("WorkCompletedCard", () => {
  it('renders "Work Completed" heading', () => {
    render(
      <WorkCompletedCard
        completedThisMonth={3}
        totalTasks={10}
        measuredImpact={4.2}
        gapsClosed={3}
        validationPending={false}
      />,
    );
    expect(screen.getByText("Work Completed")).toBeInTheDocument();
  });

  it("shows empty state when completedThisMonth is 0", () => {
    render(
      <WorkCompletedCard
        completedThisMonth={0}
        totalTasks={5}
        measuredImpact={null}
        gapsClosed={0}
        validationPending={false}
      />,
    );
    expect(
      screen.getByText("No completed work yet this month"),
    ).toBeInTheDocument();
  });

  it('shows "X of Y gaps closed" count', () => {
    render(
      <WorkCompletedCard
        completedThisMonth={3}
        totalTasks={10}
        measuredImpact={null}
        gapsClosed={3}
        validationPending={false}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("of 10 gaps closed")).toBeInTheDocument();
  });

  it("shows +X.X pts when measuredImpact is positive", () => {
    render(
      <WorkCompletedCard
        completedThisMonth={3}
        totalTasks={10}
        measuredImpact={4.2}
        gapsClosed={3}
        validationPending={false}
      />,
    );
    expect(screen.getByText("+4.2 pts")).toBeInTheDocument();
  });

  it("shows pending message when validationPending is true", () => {
    render(
      <WorkCompletedCard
        completedThisMonth={3}
        totalTasks={10}
        measuredImpact={null}
        gapsClosed={3}
        validationPending={true}
      />,
    );
    expect(
      screen.getByText(
        "Validation audit scheduled — measured impact pending",
      ),
    ).toBeInTheDocument();
  });

  it("shows — when neither measuredImpact nor validationPending", () => {
    render(
      <WorkCompletedCard
        completedThisMonth={3}
        totalTasks={10}
        measuredImpact={null}
        gapsClosed={3}
        validationPending={false}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it('"Measured Impact" heading is separate from gaps closed', () => {
    render(
      <WorkCompletedCard
        completedThisMonth={5}
        totalTasks={12}
        measuredImpact={2.1}
        gapsClosed={5}
        validationPending={false}
      />,
    );
    expect(screen.getByText("Measured Impact")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("+2.1 pts")).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   7. WorkflowSubNav — Assertion #5 (active tab)
   ═══════════════════════════════════════════════════════════ */

describe("WorkflowSubNav", () => {
  it("renders Tasks and Drafts tabs", () => {
    render(<WorkflowSubNav brandId="test-brand" />);
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Drafts")).toBeInTheDocument();
  });

  it('has aria-label "Workflow sections" on nav', () => {
    render(<WorkflowSubNav brandId="test-brand" />);
    expect(
      screen.getByRole("navigation", { name: "Workflow sections" }),
    ).toBeInTheDocument();
  });

  it("links Tasks tab to /brands/{brandId}/workflow/tasks", () => {
    render(<WorkflowSubNav brandId="brand-42" />);
    const link = screen.getByText("Tasks").closest("a");
    expect(link).toHaveAttribute("href", "/brands/brand-42/workflow/tasks");
  });

  it("links Drafts tab to /brands/{brandId}/workflow/drafts", () => {
    render(<WorkflowSubNav brandId="brand-42" />);
    const link = screen.getByText("Drafts").closest("a");
    expect(link).toHaveAttribute("href", "/brands/brand-42/workflow/drafts");
  });

  it("marks Tasks as active when pathname matches", () => {
    mockPathname = "/brands/test-brand/workflow/tasks";
    render(<WorkflowSubNav brandId="test-brand" />);
    const tasksLink = screen.getByText("Tasks");
    expect(tasksLink.style.borderBottom).toBe("2px solid var(--accent-blue)");
  });

  it("marks Drafts as inactive when pathname is tasks", () => {
    mockPathname = "/brands/test-brand/workflow/tasks";
    render(<WorkflowSubNav brandId="test-brand" />);
    const draftsLink = screen.getByText("Drafts");
    expect(draftsLink.style.borderBottom).toBe("2px solid transparent");
  });

  it("marks Drafts as active when pathname matches", () => {
    mockPathname = "/brands/test-brand/workflow/drafts";
    render(<WorkflowSubNav brandId="test-brand" />);
    const draftsLink = screen.getByText("Drafts");
    expect(draftsLink.style.borderBottom).toBe("2px solid var(--accent-blue)");
  });
});

/* ═══════════════════════════════════════════════════════════
   8. TaskCard — Assertions #2 (impact badge) & #3 (lift)
   ═══════════════════════════════════════════════════════════ */

describe("TaskCard", () => {
  describe("deriveImpactBand (Assertion #2)", () => {
    it("null scoreBefore → Medium Impact", () => {
      render(<TaskCard {...TASK_BASE} scoreBefore={null} />);
      expect(screen.getByText("Medium Impact")).toBeInTheDocument();
    });

    it("scoreBefore >= 70 → High Impact", () => {
      render(<TaskCard {...TASK_BASE} scoreBefore="70" />);
      expect(screen.getByText("High Impact")).toBeInTheDocument();
    });

    it("scoreBefore >= 70 boundary (85) → High Impact", () => {
      render(<TaskCard {...TASK_BASE} scoreBefore="85" />);
      expect(screen.getByText("High Impact")).toBeInTheDocument();
    });

    it("scoreBefore 40..69 → Medium Impact", () => {
      render(<TaskCard {...TASK_BASE} scoreBefore="55" />);
      expect(screen.getByText("Medium Impact")).toBeInTheDocument();
    });

    it("scoreBefore 40 boundary → Medium Impact", () => {
      render(<TaskCard {...TASK_BASE} scoreBefore="40" />);
      expect(screen.getByText("Medium Impact")).toBeInTheDocument();
    });

    it("scoreBefore < 40 → Low Impact", () => {
      render(<TaskCard {...TASK_BASE} scoreBefore="39" />);
      expect(screen.getByText("Low Impact")).toBeInTheDocument();
    });

    it("scoreBefore 0 → Low Impact", () => {
      render(<TaskCard {...TASK_BASE} scoreBefore="0" />);
      expect(screen.getByText("Low Impact")).toBeInTheDocument();
    });
  });

  describe("lift two-state inline (Assertion #3)", () => {
    it("shows scoreBefore → scoreAfter (green) when both present", () => {
      render(
        <TaskCard {...TASK_BASE} scoreBefore="45" scoreAfter="62" />,
      );
      expect(screen.getByText("45")).toBeInTheDocument();
      expect(screen.getByText("→")).toBeInTheDocument();
      const greenSpan = screen.getByText("62");
      expect(greenSpan.style.color).toBe("var(--success)");
    });

    it("shows scoreBefore → — (tertiary) when scoreAfter is null", () => {
      render(
        <TaskCard {...TASK_BASE} scoreBefore="45" scoreAfter={null} />,
      );
      expect(screen.getByText("45")).toBeInTheDocument();
      expect(screen.getByText("→")).toBeInTheDocument();
      const dashSpan = screen.getByText("—");
      expect(dashSpan.style.color).toBe("var(--text-tertiary)");
    });

    it("does not render lift section when scoreBefore is null", () => {
      const { container } = render(
        <TaskCard {...TASK_BASE} scoreBefore={null} />,
      );
      expect(container.querySelector('[style*="tabular-nums"]')).toBeNull();
    });

    it("shows validation pending with deferred reason", () => {
      render(
        <TaskCard
          {...TASK_BASE}
          scoreBefore="50"
          scoreAfter={null}
          reauditDeferredReason="budget_cap"
        />,
      );
      expect(
        screen.getByText(/validation pending — budget cap/),
      ).toBeInTheDocument();
    });
  });

  describe("generate draft button", () => {
    it('hides "Generate draft" button when status is complete', () => {
      render(
        <TaskCard
          {...TASK_BASE}
          status="complete"
          onGenerateDraft={vi.fn()}
        />,
      );
      expect(
        screen.queryByLabelText("Generate content draft"),
      ).not.toBeInTheDocument();
    });

    it('shows "Generate draft" button when status is open', () => {
      render(
        <TaskCard
          {...TASK_BASE}
          status="open"
          onGenerateDraft={vi.fn()}
        />,
      );
      expect(
        screen.getByLabelText("Generate content draft"),
      ).toBeInTheDocument();
    });
  });

  describe("status and role", () => {
    it("renders article role with task title and status", () => {
      render(<TaskCard {...TASK_BASE} />);
      expect(
        screen.getByRole("article", {
          name: "Task: Optimise FAQ schema, status open",
        }),
      ).toBeInTheDocument();
    });

    it("sets aria-busy when pending", () => {
      render(<TaskCard {...TASK_BASE} pending={true} />);
      const article = screen.getByRole("article");
      expect(article).toHaveAttribute("aria-busy", "true");
    });

    it("sets opacity 0.5 when pending", () => {
      render(<TaskCard {...TASK_BASE} pending={true} />);
      const article = screen.getByRole("article");
      expect(article.style.opacity).toBe("0.5");
    });
  });
});

/* ═══════════════════════════════════════════════════════════
   9. TaskKanban — Assertion #4 (column mapping)
   ═══════════════════════════════════════════════════════════ */

describe("TaskKanban", () => {
  const kanbanTasks = [
    { ...TASK_BASE, id: "t-open", status: "open" },
    { ...TASK_BASE, id: "t-ip", status: "in_progress" },
    { ...TASK_BASE, id: "t-review", status: "ready_for_review" },
    { ...TASK_BASE, id: "t-done", status: "complete" },
  ];

  it("renders 4 column headers: Open, In Progress, Review, Done", () => {
    render(<TaskKanban tasks={kanbanTasks} brandId="b1" />);
    expect(screen.getByLabelText("Open column")).toBeInTheDocument();
    expect(screen.getByLabelText("In Progress column")).toBeInTheDocument();
    expect(screen.getByLabelText("Review column")).toBeInTheDocument();
    expect(screen.getByLabelText("Done column")).toBeInTheDocument();
  });

  it('maps ready_for_review status to "Review" column (Assertion #4)', () => {
    render(<TaskKanban tasks={kanbanTasks} brandId="b1" />);
    const reviewCol = screen.getByLabelText("Review column");
    expect(within(reviewCol).getByRole("article")).toBeInTheDocument();
  });

  it('maps complete status to "Done" column (Assertion #4)', () => {
    render(<TaskKanban tasks={kanbanTasks} brandId="b1" />);
    const doneCol = screen.getByLabelText("Done column");
    expect(within(doneCol).getByRole("article")).toBeInTheDocument();
  });

  it("shows empty state when tasks is empty", () => {
    render(<TaskKanban tasks={[]} brandId="b1" />);
    expect(
      screen.getByText("No tasks yet — create one from a recommendation"),
    ).toBeInTheDocument();
  });

  it("renders task board with aria-label", () => {
    render(<TaskKanban tasks={kanbanTasks} brandId="b1" />);
    expect(
      screen.getByLabelText("Task board"),
    ).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   10. WorkflowHubClient — Assertion #1 ("Completed" label)
   ═══════════════════════════════════════════════════════════ */

describe("WorkflowHubClient", () => {
  it('renders "Completed" label, NOT "Done this month" (Assertion #1)', () => {
    render(
      <WorkflowHubClient
        brandId="test-brand"
        counts={{ open: 3, in_progress: 2, complete: 5 }}
      />,
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Done this month")).not.toBeInTheDocument();
  });

  it("renders all three stat cards with correct values", () => {
    render(
      <WorkflowHubClient
        brandId="test-brand"
        counts={{ open: 3, in_progress: 2, complete: 5 }}
      />,
    );
    expect(screen.getByText("Open tasks")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows empty state when total is 0", () => {
    render(
      <WorkflowHubClient
        brandId="test-brand"
        counts={{ open: 0, in_progress: 0, complete: 0 }}
      />,
    );
    expect(
      screen.getByText("No tasks yet — create one from a recommendation"),
    ).toBeInTheDocument();
  });

  it("renders Generate draft and New task buttons", () => {
    render(
      <WorkflowHubClient
        brandId="test-brand"
        counts={{ open: 1, in_progress: 0, complete: 0 }}
      />,
    );
    expect(screen.getByText("Generate draft")).toBeInTheDocument();
    expect(screen.getByText("New task")).toBeInTheDocument();
  });

  it("renders WorkflowSubNav", () => {
    render(
      <WorkflowHubClient
        brandId="test-brand"
        counts={{ open: 1, in_progress: 0, complete: 0 }}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Workflow sections" }),
    ).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   11. GenerateDraftModal
   ═══════════════════════════════════════════════════════════ */

describe("GenerateDraftModal", () => {
  const defaultProps = {
    brandId: "b1",
    taskId: "t1",
    taskTitle: "Fix FAQ schema",
    onClose: vi.fn(),
  };

  it("renders all 8 content format options", () => {
    render(<GenerateDraftModal {...defaultProps} />);
    const select = screen.getByLabelText("Content format");
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(8);

    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Expert Article");
    expect(labels).toContain("How-To Guide");
    expect(labels).toContain("Listicle");
    expect(labels).toContain("FAQ Block");
    expect(labels).toContain("Comparison Article");
    expect(labels).toContain("Case Study");
    expect(labels).toContain("Press Release");
    expect(labels).toContain("LinkedIn Article");
  });

  it("shows task title in subtitle", () => {
    render(<GenerateDraftModal {...defaultProps} />);
    expect(screen.getByText(/From task: Fix FAQ schema/)).toBeInTheDocument();
  });

  it('renders dialog with aria-label "Generate content draft"', () => {
    render(<GenerateDraftModal {...defaultProps} />);
    expect(
      screen.getByRole("dialog", { name: "Generate content draft" }),
    ).toBeInTheDocument();
  });

  it('submit button text is "Generate" initially', () => {
    render(<GenerateDraftModal {...defaultProps} />);
    expect(screen.getByText("Generate")).toBeInTheDocument();
  });

  it("renders Cancel button", () => {
    render(<GenerateDraftModal {...defaultProps} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   12. ContentDraftViewer
   ═══════════════════════════════════════════════════════════ */

describe("ContentDraftViewer", () => {
  it("renders draft title and body", () => {
    render(<ContentDraftViewer draft={DRAFT_BASE} />);
    expect(
      screen.getByText("Expert guide to FAQ schema"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This guide explains how to optimise FAQ schema markup for AI engines.",
      ),
    ).toBeInTheDocument();
  });

  it("renders StatusBadge for draft status", () => {
    render(<ContentDraftViewer draft={DRAFT_BASE} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("renders ContentFormatBadge", () => {
    render(<ContentDraftViewer draft={DRAFT_BASE} />);
    expect(screen.getByText("Expert Article")).toBeInTheDocument();
  });

  it("renders format recommendation reason", () => {
    render(<ContentDraftViewer draft={DRAFT_BASE} />);
    expect(screen.getByText("High search overlap")).toBeInTheDocument();
  });

  it('shows Approve and Reject buttons when status is "draft"', () => {
    render(
      <ContentDraftViewer
        draft={DRAFT_BASE}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it('hides Approve and Reject when status is "approved"', () => {
    render(
      <ContentDraftViewer
        draft={{ ...DRAFT_BASE, status: "approved" }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
  });

  it('hides Approve and Reject when status is "published"', () => {
    render(
      <ContentDraftViewer
        draft={{ ...DRAFT_BASE, status: "published" }}
      />,
    );
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
  });

  it("shows word count when provided", () => {
    render(<ContentDraftViewer draft={DRAFT_BASE} />);
    expect(screen.getByText(/Target: 1200 words/)).toBeInTheDocument();
    expect(screen.getByText(/Current: 850/)).toBeInTheDocument();
  });

  it("title is editable when status is draft", () => {
    render(<ContentDraftViewer draft={DRAFT_BASE} />);
    const titleBox = screen.getByLabelText("Draft title");
    expect(titleBox).toHaveAttribute("contenteditable", "true");
  });

  it("title is not editable when status is approved", () => {
    render(
      <ContentDraftViewer draft={{ ...DRAFT_BASE, status: "approved" }} />,
    );
    const titleBox = screen.getByLabelText("Draft title");
    expect(titleBox).toHaveAttribute("contenteditable", "false");
  });
});

/* ═══════════════════════════════════════════════════════════
   13. RecommendationCard — Assertion #7 (aggregate brand)
   ═══════════════════════════════════════════════════════════ */

describe("RecommendationCard", () => {
  it('renders "High" impact label for high score', () => {
    render(
      <RecommendationCard
        item={{ ...REC_ITEM_BASE, expectedImpactScore: "high" }}
        isFree={false}
        showBrandLabel={false}
      />,
    );
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it('renders "Med" impact label for medium score', () => {
    render(
      <RecommendationCard
        item={{ ...REC_ITEM_BASE, expectedImpactScore: "medium" }}
        isFree={false}
        showBrandLabel={false}
      />,
    );
    expect(screen.getByText("Med")).toBeInTheDocument();
  });

  it('renders "Low" impact label for low score', () => {
    render(
      <RecommendationCard
        item={{ ...REC_ITEM_BASE, expectedImpactScore: "low" }}
        isFree={false}
        showBrandLabel={false}
      />,
    );
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("shows brand badge when showBrandLabel is true and brandName exists (Assertion #7)", () => {
    render(
      <RecommendationCard
        item={{ ...REC_ITEM_BASE, brandName: "Acme Corp" }}
        isFree={false}
        showBrandLabel={true}
      />,
    );
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("hides brand badge when showBrandLabel is false (Assertion #7)", () => {
    render(
      <RecommendationCard
        item={{ ...REC_ITEM_BASE, brandName: "Acme Corp" }}
        isFree={false}
        showBrandLabel={false}
      />,
    );
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  it("hides brand badge when brandName is undefined", () => {
    render(
      <RecommendationCard
        item={REC_ITEM_BASE}
        isFree={false}
        showBrandLabel={true}
      />,
    );
    const badges = screen
      .getAllByText(/.+/)
      .filter(
        (el) =>
          el.style.background === "var(--accent-muted)" &&
          el.tagName === "SPAN",
      );
    expect(badges).toHaveLength(0);
  });

  it("renders citation count", () => {
    render(
      <RecommendationCard
        item={REC_ITEM_BASE}
        isFree={false}
      />,
    );
    expect(screen.getByText("1 citation")).toBeInTheDocument();
  });

  it("links to action-center detail page", () => {
    render(
      <RecommendationCard
        item={REC_ITEM_BASE}
        isFree={false}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/action-center/rec-1");
  });
});

/* ═══════════════════════════════════════════════════════════
   14. BrandFilter
   ═══════════════════════════════════════════════════════════ */

describe("BrandFilter", () => {
  const brands = [
    { id: "b1", name: "Brand Alpha" },
    { id: "b2", name: "Brand Beta" },
  ];

  it('renders "All brands" default option', () => {
    render(<BrandFilter brands={brands} selectedBrandId={null} />);
    const allOption = screen.getByText("All brands");
    expect(allOption).toBeInTheDocument();
    expect((allOption as HTMLOptionElement).value).toBe("all");
  });

  it("renders brand options", () => {
    render(<BrandFilter brands={brands} selectedBrandId={null} />);
    expect(screen.getByText("Brand Alpha")).toBeInTheDocument();
    expect(screen.getByText("Brand Beta")).toBeInTheDocument();
  });

  it('selects "All brands" when selectedBrandId is null', () => {
    render(<BrandFilter brands={brands} selectedBrandId={null} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("all");
  });

  it("selects the correct brand when selectedBrandId is set", () => {
    render(<BrandFilter brands={brands} selectedBrandId="b2" />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("b2");
  });
});

/* ═══════════════════════════════════════════════════════════
   15. BrandDetailClient – Workflow card tier gate
       Assertion #6
   ═══════════════════════════════════════════════════════════ */

describe("BrandDetailClient – Workflow card tier gate (Assertion #6)", () => {
  const brandProps = {
    brand: BRAND_BASE,
    auditCount: 2,
    recentAudits: [],
    latestAudit: null,
    avgPosition: null,
    totalMentions: 0,
    sentimentScore: null,
    engineStats: [],
  };

  it("locks workflow card when isFree is true", () => {
    render(<BrandDetailClient {...brandProps} isFree={true} />);
    const workflowLabel = screen.getByText("Workflow");
    const card = workflowLabel.closest("a");
    expect(card).toHaveAttribute("href", "#");
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card?.style.opacity).toBe("0.5");
    expect(card?.style.cursor).toBe("not-allowed");
  });

  it('shows "Starter plan required" when isFree', () => {
    render(<BrandDetailClient {...brandProps} isFree={true} />);
    expect(screen.getByText("Starter plan required")).toBeInTheDocument();
  });

  it("shows Lock icon when isFree", () => {
    render(<BrandDetailClient {...brandProps} isFree={true} />);
    const workflowCard = screen.getByText("Workflow").closest("a");
    const lockIcon = within(workflowCard!).queryByTestId("icon-Lock");
    expect(lockIcon).toBeInTheDocument();
  });

  it("unlocks workflow card when isFree is false", () => {
    render(<BrandDetailClient {...brandProps} isFree={false} />);
    const workflowLabel = screen.getByText("Workflow");
    const card = workflowLabel.closest("a");
    expect(card).toHaveAttribute(
      "href",
      `/brands/${BRAND_BASE.id}/workflow`,
    );
    expect(card).not.toHaveAttribute("aria-disabled");
    expect(card?.style.opacity).toBe("1");
    expect(card?.style.cursor).toBe("pointer");
  });

  it('shows "Tasks & remediation" when not free', () => {
    render(<BrandDetailClient {...brandProps} isFree={false} />);
    expect(screen.getByText("Tasks & remediation")).toBeInTheDocument();
  });

  it("does not show Lock icon when not free", () => {
    render(<BrandDetailClient {...brandProps} isFree={false} />);
    const workflowCard = screen.getByText("Workflow").closest("a");
    const lockIcon = within(workflowCard!).queryByTestId("icon-Lock");
    expect(lockIcon).not.toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   FU-2: Deepened edge-case tests
   ═══════════════════════════════════════════════════════════ */

/* ─── TierGate ──────────────────────────────────────────── */

describe("TierGate", () => {
  it("renders children directly when not free", () => {
    render(
      <TierGate isFree={false}>
        <span data-testid="child">Content</span>
      </TierGate>,
    );
    const child = screen.getByTestId("child");
    expect(child).toBeInTheDocument();
    expect(child.closest("div")?.style.filter).toBeFalsy();
  });

  it("blurs children and shows upgrade CTA when free", () => {
    render(
      <TierGate isFree={true}>
        <span data-testid="child">Content</span>
      </TierGate>,
    );
    const blurWrapper = screen.getByTestId("child").closest("div");
    expect(blurWrapper?.style.filter).toBe("blur(4px)");
    expect(blurWrapper?.style.pointerEvents).toBe("none");
    expect(screen.getByText("Upgrade to Starter to unlock")).toBeInTheDocument();
  });

  it("upgrade link points to /settings/billing", () => {
    render(
      <TierGate isFree={true}>
        <span>Gated content</span>
      </TierGate>,
    );
    const link = screen.getByText("Upgrade to Starter to unlock").closest("a");
    expect(link).toHaveAttribute("href", "/settings/billing");
  });
});

/* ─── Action-center ConfidenceBadge ─────────────────────── */

describe("ConfidenceBadge (action-center)", () => {
  it("maps confirmed → Confirmed", () => {
    render(<ActionConfidenceBadge label="confirmed" />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
  });

  it("maps likely → Likely", () => {
    render(<ActionConfidenceBadge label="likely" />);
    expect(screen.getByText("Likely")).toBeInTheDocument();
  });

  it("maps hypothesis → Hypothesis", () => {
    render(<ActionConfidenceBadge label="hypothesis" />);
    expect(screen.getByText("Hypothesis")).toBeInTheDocument();
  });

  it("falls back to raw label for unknown values", () => {
    render(<ActionConfidenceBadge label="speculative" />);
    expect(screen.getByText("speculative")).toBeInTheDocument();
  });
});

/* ─── TaskCard edge cases ───────────────────────────────── */

describe("TaskCard – edge cases (FU-2)", () => {
  it("renders dimension badge when present", () => {
    render(<TaskCard {...TASK_BASE} dimension="frequency" />);
    expect(screen.getByText("frequency")).toBeInTheDocument();
  });

  it("does not render dimension badge when null", () => {
    render(<TaskCard {...TASK_BASE} dimension={null} />);
    expect(screen.queryByText("accuracy")).not.toBeInTheDocument();
  });

  it("renders confidence badge when label present", () => {
    render(<TaskCard {...TASK_BASE} confidenceLabel="Medium" />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("does not render confidence badge when null", () => {
    render(<TaskCard {...TASK_BASE} confidenceLabel={null} />);
    expect(screen.queryByText("High")).not.toBeInTheDocument();
    expect(screen.queryByText("Medium")).not.toBeInTheDocument();
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
  });

  it("renders allowed move buttons", () => {
    render(
      <TaskCard
        {...TASK_BASE}
        status="in_progress"
        allowedMoves={[
          { key: "open", label: "Open" },
          { key: "ready_for_review", label: "Review" },
        ]}
        onMove={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Move to Open")).toBeInTheDocument();
    expect(screen.getByLabelText("Move to Review")).toBeInTheDocument();
  });

  it("hides move buttons when pending", () => {
    render(
      <TaskCard
        {...TASK_BASE}
        status="in_progress"
        allowedMoves={[{ key: "open", label: "Open" }]}
        onMove={vi.fn()}
        pending={true}
      />,
    );
    expect(screen.queryByLabelText("Move to Open")).not.toBeInTheDocument();
  });

  it("is not draggable when pending", () => {
    render(<TaskCard {...TASK_BASE} onDragStart={vi.fn()} pending={true} />);
    const article = screen.getByRole("article");
    expect(article).toHaveAttribute("draggable", "false");
  });

  it("is draggable when not pending and onDragStart provided", () => {
    render(<TaskCard {...TASK_BASE} onDragStart={vi.fn()} pending={false} />);
    const article = screen.getByRole("article");
    expect(article).toHaveAttribute("draggable", "true");
  });

  it("complete status has no allowed moves", () => {
    render(
      <TaskCard
        {...TASK_BASE}
        status="complete"
        allowedMoves={[]}
        onMove={vi.fn()}
      />,
    );
    const moveButtons = screen.queryAllByLabelText(/^Move to /);
    expect(moveButtons).toHaveLength(0);
  });
});

/* ─── TaskKanban edge cases ─────────────────────────────── */

describe("TaskKanban – edge cases (FU-2)", () => {
  it("shows task count per column", () => {
    const tasks = [
      { ...TASK_BASE, id: "t1", status: "open" },
      { ...TASK_BASE, id: "t2", status: "open" },
      { ...TASK_BASE, id: "t3", status: "complete" },
    ];
    render(<TaskKanban tasks={tasks} brandId="b1" />);
    const openCol = screen.getByLabelText("Open column");
    expect(within(openCol).getByText("2")).toBeInTheDocument();
    const doneCol = screen.getByLabelText("Done column");
    expect(within(doneCol).getByText("1")).toBeInTheDocument();
  });

  it('shows "Nothing here" in empty columns', () => {
    const tasks = [{ ...TASK_BASE, id: "t1", status: "open" }];
    render(<TaskKanban tasks={tasks} brandId="b1" />);
    const doneCol = screen.getByLabelText("Done column");
    expect(within(doneCol).getByText("Nothing here")).toBeInTheDocument();
  });

  it("places all tasks in correct columns by status", () => {
    const tasks = [
      { ...TASK_BASE, id: "t1", status: "open", title: "Task A" },
      { ...TASK_BASE, id: "t2", status: "in_progress", title: "Task B" },
      { ...TASK_BASE, id: "t3", status: "ready_for_review", title: "Task C" },
      { ...TASK_BASE, id: "t4", status: "complete", title: "Task D" },
    ];
    render(<TaskKanban tasks={tasks} brandId="b1" />);

    const openCol = screen.getByLabelText("Open column");
    expect(within(openCol).getByText("Task A")).toBeInTheDocument();

    const ipCol = screen.getByLabelText("In Progress column");
    expect(within(ipCol).getByText("Task B")).toBeInTheDocument();

    const revCol = screen.getByLabelText("Review column");
    expect(within(revCol).getByText("Task C")).toBeInTheDocument();

    const doneCol = screen.getByLabelText("Done column");
    expect(within(doneCol).getByText("Task D")).toBeInTheDocument();
  });
});

/* ─── WorkflowHubClient edge cases ──────────────────────── */

describe("WorkflowHubClient – edge cases (FU-2)", () => {
  it("defaults missing count keys to 0", () => {
    render(
      <WorkflowHubClient
        brandId="test-brand"
        counts={{ open: 5 }}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    const zeroes = screen.getAllByText("0");
    expect(zeroes.length).toBeGreaterThanOrEqual(2);
  });

  it("does not show empty state when any count > 0", () => {
    render(
      <WorkflowHubClient
        brandId="test-brand"
        counts={{ open: 0, in_progress: 0, complete: 1 }}
      />,
    );
    expect(
      screen.queryByText("No tasks yet — create one from a recommendation"),
    ).not.toBeInTheDocument();
  });

  it("Generate draft link points to workflow/tasks", () => {
    render(
      <WorkflowHubClient
        brandId="brand-x"
        counts={{ open: 1, in_progress: 0, complete: 0 }}
      />,
    );
    const link = screen.getByText("Generate draft").closest("a");
    expect(link).toHaveAttribute("href", "/brands/brand-x/workflow/tasks");
  });
});

/* ─── ContentDraftViewer edge cases ─────────────────────── */

describe("ContentDraftViewer – edge cases (FU-2)", () => {
  it("body is editable when status is draft", () => {
    render(<ContentDraftViewer draft={DRAFT_BASE} />);
    const bodyBox = screen.getByLabelText("Draft body");
    expect(bodyBox).toHaveAttribute("contenteditable", "true");
  });

  it("body is not editable when status is rejected", () => {
    render(
      <ContentDraftViewer draft={{ ...DRAFT_BASE, status: "rejected" }} />,
    );
    const bodyBox = screen.getByLabelText("Draft body");
    expect(bodyBox).toHaveAttribute("contenteditable", "false");
  });

  it('hides Approve and Reject when status is "rejected"', () => {
    render(
      <ContentDraftViewer draft={{ ...DRAFT_BASE, status: "rejected" }} />,
    );
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
  });

  it('renders StatusBadge "Approved" for approved draft', () => {
    render(
      <ContentDraftViewer draft={{ ...DRAFT_BASE, status: "approved" }} />,
    );
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it('renders StatusBadge "Published" for published draft', () => {
    render(
      <ContentDraftViewer draft={{ ...DRAFT_BASE, status: "published" }} />,
    );
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it('renders StatusBadge "Rejected" for rejected draft', () => {
    render(
      <ContentDraftViewer draft={{ ...DRAFT_BASE, status: "rejected" }} />,
    );
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("omits word count section when targetWordCount is null", () => {
    render(
      <ContentDraftViewer
        draft={{ ...DRAFT_BASE, targetWordCount: null, wordCount: null }}
      />,
    );
    expect(screen.queryByText(/Target:/)).not.toBeInTheDocument();
  });
});

/* ─── RecommendationCard edge cases ─────────────────────── */

describe("RecommendationCard – edge cases (FU-2)", () => {
  it("pluralises citation count correctly for 0", () => {
    render(
      <RecommendationCard
        item={{ ...REC_ITEM_BASE, evidenceRefs: [] }}
        isFree={false}
      />,
    );
    expect(screen.queryByText(/citation/)).not.toBeInTheDocument();
  });

  it("pluralises citation count correctly for >1", () => {
    render(
      <RecommendationCard
        item={{
          ...REC_ITEM_BASE,
          evidenceRefs: [
            { source: "A", url: "a" },
            { source: "B", url: "b" },
            { source: "C", url: "c" },
          ],
        }}
        isFree={false}
      />,
    );
    expect(screen.getByText("3 citations")).toBeInTheDocument();
  });

  it("renders TierGate content when not free (visible)", () => {
    render(
      <RecommendationCard
        item={{ ...REC_ITEM_BASE, expectedImpactScore: "high" }}
        isFree={false}
      />,
    );
    expect(
      screen.getByText("High impact — significant visibility lift expected"),
    ).toBeInTheDocument();
  });

  it("renders title text regardless of tier", () => {
    render(
      <RecommendationCard
        item={REC_ITEM_BASE}
        isFree={true}
      />,
    );
    expect(
      screen.getByText("Add FAQ schema to pricing page"),
    ).toBeInTheDocument();
  });
});

/* ─── LiftIndicator edge cases ──────────────────────────── */

describe("LiftIndicator – edge cases (FU-2)", () => {
  it("shows negative delta with minus sign for decline", () => {
    render(<LiftIndicator scoreBefore={60} scoreAfter={55} />);
    expect(screen.getByText(/-5\.0/)).toBeInTheDocument();
  });

  it("handles zero delta (no change)", () => {
    render(<LiftIndicator scoreBefore={50} scoreAfter={50} />);
    expect(screen.getByText(/0\.0/)).toBeInTheDocument();
  });

  it("handles scoreBefore of 0", () => {
    render(<LiftIndicator scoreBefore={0} scoreAfter={null} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

/* ─── WorkCompletedCard edge cases ──────────────────────── */

describe("WorkCompletedCard – edge cases (FU-2)", () => {
  it("shows negative impact with no + sign", () => {
    render(
      <WorkCompletedCard
        completedThisMonth={2}
        totalTasks={5}
        measuredImpact={-1.5}
        gapsClosed={2}
        validationPending={false}
      />,
    );
    expect(screen.getByText("-1.5 pts")).toBeInTheDocument();
  });

  it("shows zero impact without + sign", () => {
    render(
      <WorkCompletedCard
        completedThisMonth={1}
        totalTasks={3}
        measuredImpact={0}
        gapsClosed={1}
        validationPending={false}
      />,
    );
    expect(screen.getByText("0.0 pts")).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════
   FU-3: Cross-sprint gaps (Sprint 1 → Sprint 2 bridges)
   ═══════════════════════════════════════════════════════════ */

/* ─── ActionStatusButtons (recommendation → task bridge) ── */

describe("ActionStatusButtons – cross-sprint (FU-3)", () => {
  it('shows "Create task" button when no existing task', () => {
    render(
      <ActionStatusButtons
        itemId="rec-1"
        brandId="b1"
        existingTaskUrl={null}
      />,
    );
    expect(screen.getByText("Create task")).toBeInTheDocument();
  });

  it('shows "Task created" link when existingTaskUrl is present', () => {
    render(
      <ActionStatusButtons
        itemId="rec-1"
        brandId="b1"
        existingTaskUrl="/brands/b1/workflow/tasks"
      />,
    );
    expect(screen.getByText("Task created")).toBeInTheDocument();
    const link = screen.getByText("Task created").closest("a");
    expect(link).toHaveAttribute("href", "/brands/b1/workflow/tasks");
  });

  it('hides "Create task" button when existingTaskUrl is set', () => {
    render(
      <ActionStatusButtons
        itemId="rec-1"
        brandId="b1"
        existingTaskUrl="/brands/b1/workflow/tasks"
      />,
    );
    expect(screen.queryByText("Create task")).not.toBeInTheDocument();
  });

  it('renders "Mark as done" button', () => {
    render(
      <ActionStatusButtons
        itemId="rec-1"
        brandId="b1"
      />,
    );
    expect(screen.getByText("Mark as done")).toBeInTheDocument();
  });

  it('renders "Dismiss" button', () => {
    render(
      <ActionStatusButtons
        itemId="rec-1"
        brandId="b1"
      />,
    );
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("dismiss reason textarea is hidden initially", () => {
    render(
      <ActionStatusButtons
        itemId="rec-1"
        brandId="b1"
      />,
    );
    expect(
      screen.queryByPlaceholderText(/Why are you dismissing/),
    ).not.toBeInTheDocument();
  });
});

/* ─── DimensionGroup (Sprint 1 grouping + Sprint 2 cards) ─ */

describe("DimensionGroup – cross-sprint (FU-3)", () => {
  const groupItems = [
    {
      ...REC_ITEM_BASE,
      id: "r1",
      dimension: "frequency",
      expectedImpactScore: "medium",
      title: "Freq item 1",
    },
    {
      ...REC_ITEM_BASE,
      id: "r2",
      dimension: "frequency",
      expectedImpactScore: "high",
      title: "Freq item 2",
    },
    {
      ...REC_ITEM_BASE,
      id: "r3",
      dimension: "accuracy",
      expectedImpactScore: "low",
      title: "Accuracy item",
    },
  ];

  it("renders dimension headings for populated dimensions", () => {
    render(
      <DimensionGroup items={groupItems} isFree={false} />,
    );
    expect(screen.getByText("Frequency")).toBeInTheDocument();
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
  });

  it("does not render headings for empty dimensions", () => {
    render(
      <DimensionGroup items={groupItems} isFree={false} />,
    );
    expect(screen.queryByText("Position")).not.toBeInTheDocument();
    expect(screen.queryByText("Sentiment")).not.toBeInTheDocument();
    expect(screen.queryByText("Context")).not.toBeInTheDocument();
  });

  it("sorts items within dimension by impact (high first)", () => {
    render(
      <DimensionGroup items={groupItems} isFree={false} />,
    );
    const freqHeading = screen.getByText("Frequency");
    const freqSection = freqHeading.parentElement!;
    const freqLinks = within(freqSection).getAllByRole("link");
    const titles = freqLinks.map(
      (l) => within(l).getByText(/Freq item/).textContent,
    );
    expect(titles[0]).toBe("Freq item 2");
    expect(titles[1]).toBe("Freq item 1");
  });

  it("renders RecommendationCards inside each group", () => {
    render(
      <DimensionGroup items={groupItems} isFree={false} />,
    );
    expect(screen.getByText("Freq item 1")).toBeInTheDocument();
    expect(screen.getByText("Freq item 2")).toBeInTheDocument();
    expect(screen.getByText("Accuracy item")).toBeInTheDocument();
  });

  it("passes showBrandLabel through to cards", () => {
    const items = [
      {
        ...REC_ITEM_BASE,
        id: "r1",
        dimension: "frequency",
        brandName: "TestBrand",
      },
    ];
    render(
      <DimensionGroup items={items} isFree={false} showBrandLabel={true} />,
    );
    expect(screen.getByText("TestBrand")).toBeInTheDocument();
  });

  it("follows DIMENSION_ORDER (frequency before accuracy)", () => {
    const { container } = render(
      <DimensionGroup items={groupItems} isFree={false} />,
    );
    const headings = container.querySelectorAll("h2");
    const labels = Array.from(headings).map((h) => h.textContent);
    const freqIdx = labels.indexOf("Frequency");
    const accIdx = labels.indexOf("Accuracy");
    expect(freqIdx).toBeLessThan(accIdx);
  });
});

/* ─── Brand detail → Workflow nav integration ────────────── */

describe("BrandDetailClient – cross-sprint tool grid (FU-3)", () => {
  const brandProps = {
    brand: BRAND_BASE,
    auditCount: 3,
    recentAudits: [],
    latestAudit: null,
    avgPosition: null,
    totalMentions: 0,
    sentimentScore: null,
    engineStats: [],
  };

  it("renders all audit tool links in the nav grid", () => {
    render(<BrandDetailClient {...brandProps} isFree={false} />);
    expect(screen.getByText("Workflow")).toBeInTheDocument();
    expect(screen.getByText("Technical Audit")).toBeInTheDocument();
    expect(screen.getByText("Robots.txt")).toBeInTheDocument();
    expect(screen.getByText("llms.txt")).toBeInTheDocument();
    expect(screen.getByText("Schema")).toBeInTheDocument();
    expect(screen.getByText("SSR Check")).toBeInTheDocument();
    expect(screen.getByText("Answer Capsules")).toBeInTheDocument();
    expect(screen.getByText("Brand Entity")).toBeInTheDocument();
  });

  it("only Workflow card is tier-gated (others are always active)", () => {
    render(<BrandDetailClient {...brandProps} isFree={true} />);
    const techLink = screen.getByText("Technical Audit").closest("a");
    expect(techLink?.style.opacity).toBe("1");
    expect(techLink).not.toHaveAttribute("aria-disabled");

    const workflowLink = screen.getByText("Workflow").closest("a");
    expect(workflowLink?.style.opacity).toBe("0.5");
    expect(workflowLink).toHaveAttribute("aria-disabled", "true");
  });

  it("audit count renders singular for 1", () => {
    render(
      <BrandDetailClient
        {...brandProps}
        auditCount={1}
      />,
    );
    expect(screen.getByText(/1 audit$/)).toBeInTheDocument();
  });

  it("audit count renders plural for >1", () => {
    render(
      <BrandDetailClient
        {...brandProps}
        auditCount={3}
      />,
    );
    expect(screen.getByText(/3 audits$/)).toBeInTheDocument();
  });
});

/* ─── WorkflowHubClient → WorkflowSubNav integration ──── */

describe("WorkflowHubClient → WorkflowSubNav integration (FU-3)", () => {
  it("sub-nav in hub uses the same brandId for links", () => {
    render(
      <WorkflowHubClient
        brandId="brand-xyz"
        counts={{ open: 1, in_progress: 0, complete: 0 }}
      />,
    );
    const tasksLink = screen.getByText("Tasks").closest("a");
    expect(tasksLink).toHaveAttribute(
      "href",
      "/brands/brand-xyz/workflow/tasks",
    );
    const draftsLink = screen.getByText("Drafts").closest("a");
    expect(draftsLink).toHaveAttribute(
      "href",
      "/brands/brand-xyz/workflow/drafts",
    );
  });
});

/* ─── StatusBadge across Sprint boundaries ────────────── */

describe("StatusBadge – cross-sprint status consistency (FU-3)", () => {
  it("task complete and workflow completed use different labels", () => {
    const { unmount } = render(<StatusBadge status={"complete" as "open"} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    unmount();

    render(<StatusBadge status={"completed" as "open"} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("three distinct status spelling families render correctly", () => {
    const { unmount: u1 } = render(<StatusBadge status={"complete" as "open"} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    u1();

    const { unmount: u2 } = render(<StatusBadge status={"completed" as "open"} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    u2();

    render(<StatusBadge status={"draft" as "open"} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });
});
