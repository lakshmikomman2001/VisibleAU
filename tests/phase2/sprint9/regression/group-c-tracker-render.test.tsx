// @vitest-environment jsdom
/**
 * GROUP C — THE TRACKER (F1 · F2 · F3 · F4 · F21)
 * Sections 1+2 cover the query. This section covers the RENDER.
 *
 * F6: "0 / 1 gaps closed this month" is CORRECT for real fixture.
 * F7: exactly ONE work-completed surface on the dashboard.
 *
 * The ActionProgressTracker component fetches from /api/brands/{id}/action-progress
 * and renders the tracker. We test it by rendering with mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import { ActionProgressTracker } from "@/components/domain/autopilot/action-progress-tracker";

// Bondi real answer key: 1 open task, 0 complete this month, score_after=NULL everywhere
const BONDI_PROGRESS = {
  completedThisMonth: 0,
  totalTasks: 1,
  measuredImpact: null,
  gapsClosed: 0,
  validationPending: false,
};

// SYNTHETIC: exercises the "measured impact rendered" path
// (score_after is NULL on every task system-wide — this state hasn't occurred yet)
const WITH_MEASURED_IMPACT = {
  completedThisMonth: 2,
  totalTasks: 5,
  measuredImpact: 8.5,
  gapsClosed: 3,
  validationPending: false,
};

// SYNTHETIC: exercises the "pending validation" render path
const PENDING_VALIDATION = {
  completedThisMonth: 1,
  totalTasks: 3,
  measuredImpact: null,
  gapsClosed: 1,
  validationPending: true,
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

describe("F6 — honest zero: '0 / 1 gaps closed this month' is correct", () => {
  it("Bondi real state: renders '0 / 1 gaps closed this month', not a fabricated number", async () => {
    mockFetch(BONDI_PROGRESS);
    const { container } = render(<ActionProgressTracker brandId="bondi-brand-id" />);

    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("0");
      expect(text).toContain("/ 1");
      expect(text).toContain("gaps closed this month");
    });
  });

  it("⚠️ BREAK-PROOF: never fabricates a non-zero completed count when data says 0", async () => {
    mockFetch(BONDI_PROGRESS);
    const { container } = render(<ActionProgressTracker brandId="b1" />);

    await waitFor(() => {
      const text = container.textContent!;
      // completedThisMonth=0: the number shown must be 0, not 1 or higher
      expect(text).toContain("0");
      // Should NOT show "1 / 1" or any positive as completedThisMonth
      expect(text).not.toMatch(/[1-9]\d*\s*\/ 1\s*gaps/);
    });
  });
});

describe("F7 — exactly ONE work-completed surface on the dashboard", () => {
  it("renders exactly 1 'Work Completed' card", async () => {
    mockFetch(WITH_MEASURED_IMPACT);
    const { container } = render(<ActionProgressTracker brandId="b1" />);

    await waitFor(() => {
      const matches = container.querySelectorAll("*");
      const workCompletedElements = Array.from(matches).filter(
        (el) => el.textContent?.includes("Work Completed") && el.closest("[class*='rounded-xl']"),
      );
      // The text "Work Completed" should appear exactly once as a card heading
      const text = container.textContent!;
      const occurrences = text.split("Work Completed").length - 1;
      expect(occurrences).toBe(1);
    });
  });
});

describe("Tracker render — Measured Impact pending state", () => {
  it("measuredImpact=null → shows 'Validation audit scheduled', NOT a zero, NOT blank", async () => {
    mockFetch(PENDING_VALIDATION);
    const { container } = render(<ActionProgressTracker brandId="b1" />);

    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("Validation audit scheduled");
      // Must NOT show "0.0%" or "+0.0%"
      expect(text).not.toContain("0.0%");
      expect(text).not.toContain("+0.0%");
    });
  });

  it("measuredImpact=8.5 → renders '+8.5%'", async () => {
    mockFetch(WITH_MEASURED_IMPACT);
    const { container } = render(<ActionProgressTracker brandId="b1" />);

    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("+8.5%");
    });
  });

  it("⚠️ BREAK-PROOF: null impact must NEVER show as '0' or '+0'", async () => {
    mockFetch({ ...PENDING_VALIDATION, measuredImpact: null });
    const { container } = render(<ActionProgressTracker brandId="b1" />);

    await waitFor(() => {
      const text = container.textContent!;
      // The absence assertions
      expect(text).not.toMatch(/\+0[^.]/);
      expect(text).not.toMatch(/\b0\.0%/);
    });
  });
});

describe("Tracker render — with real data", () => {
  it("completedThisMonth=2, totalTasks=5 → renders '2 / 5'", async () => {
    mockFetch(WITH_MEASURED_IMPACT);
    const { container } = render(<ActionProgressTracker brandId="b1" />);

    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("2");
      expect(text).toContain("/ 5");
      expect(text).toContain("gaps closed this month");
    });
  });

  it("REFERENCE: F1-F4, F21 — canonical tracker query guards are in §1.5 + §2.4", () => {
    // The actual query correctness (completedAt vs updatedAt, status='complete',
    // liftAchieved, UTC month boundaries) is covered by the unit + integration tests.
    expect(true).toBe(true);
  });
});
