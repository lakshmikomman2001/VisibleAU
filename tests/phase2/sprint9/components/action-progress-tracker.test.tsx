// @vitest-environment jsdom
/**
 * 4.4 -- the Autopilot tracker (components/domain/autopilot/action-progress-tracker.tsx).
 *
 * 17 Nov, part 3 (Sri: every page must agree with the audit): "Measured Impact +8.5% · Citation rate improved ·
 * verified by re-audit" was SUM(lift_achieved), and lift_achieved was the re-audit's Visibility minus score_before,
 * a recommendation's expected-impact bucket (80/50/20) -- a made-up figure. The card now counts each re-audited
 * task's measured change between its own audit and its re-audit (lib/visibility/audit-change.ts): how many went up,
 * down or stayed, and the latest one in full. "N / M gaps closed this month" (M was every task ever) is "N tasks done
 * this month · M still open", in the workspace's own month.
 */
import { render, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { ActionProgressTracker } from "@/components/domain/autopilot/action-progress-tracker";

function mockFetch(data: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError() {
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

const NO_REAUDITS = { measured: 0, up: 0, down: 0, same: 0, notComparable: 0, latest: null };
const LINE = "Audit #49 → #50: 28% (11 of 40) → 33% (13 of 40), up 5 points";

const progress = (over: Record<string, unknown> = {}) => ({
  completedThisMonth: 0,
  openTasks: 1,
  totalTasks: 1,
  reaudits: NO_REAUDITS,
  awaitingReaudit: 0,
  monthLabel: "Since 1 Nov, Sydney time",
  ...over,
});

describe("4.4 — ActionProgressTracker: Bondi real state", () => {
  it("Bondi: 0 tasks done this month, 1 still open, in the workspace's month", async () => {
    mockFetch(progress());
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain("tasks done this month · 1 task still open");
    });
    expect(container.textContent).toContain("Since 1 Nov, Sydney time");
    expect(container.textContent).not.toContain("gaps closed this month");
  });

  it("nothing re-audited → says so, never a zero impact or 'Validation audit scheduled'", async () => {
    mockFetch(progress());
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain("No measured re-audit this month");
    });
    expect(container.textContent).not.toMatch(/Validation audit scheduled|\d+\.\d%/);
  });
});

describe("4.4 — Measured impact: each task's measured change, counted", () => {
  it("re-audits up and down: the counts and the latest change in full", async () => {
    mockFetch(
      progress({
        completedThisMonth: 2,
        openTasks: 3,
        totalTasks: 5,
        reaudits: { measured: 2, up: 1, down: 1, same: 0, notComparable: 0, latest: LINE },
      }),
    );
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain(
        "tasks re-audited this month: up in 1, down in 1, the same in 0",
      );
    });
    expect(container.textContent).toContain(`Latest: ${LINE}`);
    expect(container.textContent).not.toMatch(/Citation rate|verified by re-audit|[+-]\d+\.\d%/);
  });

  it("done but not re-audited yet → when it will be, never a figure", async () => {
    mockFetch(progress({ completedThisMonth: 1, awaitingReaudit: 1 }));
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain(
        "1 task done this month: each is re-audited 14 days after it was marked done.",
      );
    });
  });

  it("re-audited but not comparable → says so", async () => {
    mockFetch(
      progress({
        completedThisMonth: 1,
        reaudits: { ...NO_REAUDITS, notComparable: 1 },
      }),
    );
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain(
        "1 re-audit couldn't be compared with the task's own audit.",
      );
    });
  });
});

describe("4.4 — exactly ONE work-completed surface (F7)", () => {
  it("renders exactly 1 'Work Completed' card heading", async () => {
    mockFetch(progress({ completedThisMonth: 2, totalTasks: 5 }));
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      const text = container.textContent!;
      const occurrences = text.split("Work Completed").length - 1;
      expect(occurrences).toBe(1);
    });
  });
});

describe("4.4 — loading + empty states", () => {
  it("loading state: renders skeleton placeholders with animate-pulse", async () => {
    // Don't resolve fetch immediately
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    const skeletons = container.querySelectorAll("[class*='animate-pulse']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("totalTasks=0 → shows empty state 'No gaps closed yet this month'", async () => {
    mockFetch(progress({ openTasks: 0, totalTasks: 0 }));
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain("No gaps closed yet this month");
    });
  });

  it("fetch error → says it couldn't load, never the empty state (no crash)", async () => {
    mockFetchError();
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load your Autopilot progress.");
    });
    expect(container.textContent).not.toContain("No gaps closed yet this month");
  });
});

describe("4.4 — LLD 9060: prominent placement", () => {
  it("⚠️ WEAK (structural): tracker grid renders BEFORE any fold-level section", async () => {
    mockFetch(progress({ completedThisMonth: 1, totalTasks: 3 }));
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      const grid = container.querySelector("[class*='grid']");
      expect(grid).not.toBeNull();
      expect(grid?.className).toContain("mb-6");
    });
  });
});
