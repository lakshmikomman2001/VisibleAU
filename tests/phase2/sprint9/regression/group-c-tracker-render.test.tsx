// @vitest-environment jsdom
/**
 * GROUP C — THE TRACKER (F1 · F2 · F3 · F4 · F21)
 * Sections 1+2 cover the query. This section covers the RENDER.
 *
 * F6: an honest zero for the real fixture (no task done this month).
 * F7: exactly ONE work-completed surface on the dashboard.
 *
 * 17 Nov, part 3: "N / M gaps closed this month" (M was every task ever) is "N tasks done this month · M still
 * open"; "Measured Impact +8.5%" (a sum of re-audit scores minus expected-impact buckets) is the count of measured
 * re-audits and the latest one in full (lib/workflow/progress-summary.ts, lib/visibility/audit-change.ts).
 */

import { render, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { ActionProgressTracker } from "@/components/domain/autopilot/action-progress-tracker";

const NO_REAUDITS = { measured: 0, up: 0, down: 0, same: 0, notComparable: 0, latest: null };
const BONDI_PROGRESS = {
  completedThisMonth: 0,
  openTasks: 1,
  totalTasks: 1,
  reaudits: NO_REAUDITS,
  awaitingReaudit: 0,
  monthLabel: "Since 1 Nov, Sydney time",
};
const WITH_REAUDITS = {
  ...BONDI_PROGRESS,
  completedThisMonth: 2,
  openTasks: 3,
  totalTasks: 5,
  reaudits: {
    measured: 1,
    up: 1,
    down: 0,
    same: 0,
    notComparable: 0,
    latest: "Audit #49 → #50: 28% (11 of 40) → 33% (13 of 40), up 5 points",
  },
  awaitingReaudit: 1,
};

function mockFetch(data: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("F6 — an honest zero for the real fixture", () => {
  it("Bondi: 0 tasks done this month, 1 still open -- never a ratio against every task ever", async () => {
    mockFetch(BONDI_PROGRESS);
    const { container } = render(<ActionProgressTracker brandId="bondi-brand-id" />);
    await waitFor(() => {
      expect(container.textContent).toContain("tasks done this month · 1 task still open");
    });
    expect(container.textContent).not.toContain("/ 1");
  });

  it("⚠️ BREAK-PROOF: never a made-up impact when nothing was re-audited", async () => {
    mockFetch(BONDI_PROGRESS);
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain("No measured re-audit this month");
    });
    expect(container.textContent).not.toMatch(/[+-]?\d+\.\d%/);
  });
});

describe("F7 — exactly ONE work-completed surface on the dashboard", () => {
  it("renders exactly 1 'Work Completed' card", async () => {
    mockFetch(WITH_REAUDITS);
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent?.split("Work Completed").length).toBe(2);
    });
  });
});

describe("Tracker render — with re-audits", () => {
  it("2 done, 3 still open; 1 re-audit measured, with the latest change in full", async () => {
    mockFetch(WITH_REAUDITS);
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain("tasks done this month · 3 tasks still open");
    });
    expect(container.textContent).toContain("task re-audited this month: up in 1");
    expect(container.textContent).toContain(`Latest: ${WITH_REAUDITS.reaudits.latest}`);
    expect(container.textContent).not.toMatch(/Citation rate|\+\d+\.\d%/);
  });

  it("REFERENCE: F1-F4, F21 — the summary's own guards are in §1.5 and the real-DB consistency test", () => {
    // The query's correctness (completedAt, status 'complete', the workspace's month, measured changes, never
    // lift_achieved) is covered by tests/phase2/sprint9/unit/progress-summary.test.ts and
    // tests/integration/brand-pages-agree-with-audit.integration.test.tsx.
    expect(true).toBe(true);
  });
});
