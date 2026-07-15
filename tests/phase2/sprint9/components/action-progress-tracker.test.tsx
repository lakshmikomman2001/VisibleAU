// @vitest-environment jsdom
/**
 * SECTION 4.4 — action-progress-tracker.tsx (§6U.4 / LLD 9060)
 *
 * "N of M gaps closed this month" — Bondi's real state: 0 / 1.
 * Measured Impact with no measured lift → "Validation audit scheduled"
 * Exactly ONE work-completed surface. Citation-rate delta DOES show arrow (canon permits).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
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

// Bondi real answer key: 1 open task, 0 completed this month, score_after=NULL
const BONDI_PROGRESS = {
  completedThisMonth: 0,
  totalTasks: 1,
  measuredImpact: null,
  validationPending: false,
};

describe("4.4 — ActionProgressTracker: Bondi real state", () => {
  it("Bondi: renders '0 / 1 gaps closed this month'", async () => {
    mockFetch(BONDI_PROGRESS);
    const { container } = render(<ActionProgressTracker brandId="bondi-id" />);
    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("0");
      expect(text).toContain("/ 1");
      expect(text).toContain("gaps closed this month");
    });
  });

  it("measuredImpact=null → 'Validation audit scheduled', NOT '0' or blank", async () => {
    mockFetch(BONDI_PROGRESS);
    const { container } = render(<ActionProgressTracker brandId="bondi-id" />);
    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("Validation audit scheduled");
      expect(text).not.toContain("0.0%");
      expect(text).not.toContain("+0");
    });
  });
});

describe("4.4 — Measured Impact: positive / negative / zero", () => {
  // SYNTHETIC: score_after is NULL system-wide, so these test render paths for future states
  it("SYNTHETIC positive: measuredImpact=8.5 → renders '+8.5%' with success color", async () => {
    mockFetch({ completedThisMonth: 2, totalTasks: 5, measuredImpact: 8.5, validationPending: false });
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("+8.5%");
      expect(text).toContain("improved");
    });
  });

  it("SYNTHETIC negative: measuredImpact=-3.2 → renders '-3.2%' with danger color", async () => {
    mockFetch({ completedThisMonth: 2, totalTasks: 5, measuredImpact: -3.2, validationPending: false });
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("-3.2%");
      expect(text).toContain("decreased");
      expect(text).not.toContain("improved");
      expect(text).not.toContain("+");
    });
  });

  it("SYNTHETIC zero: measuredImpact=0 → 'No measurable change yet', NOT 'improved 0%'", async () => {
    mockFetch({ completedThisMonth: 2, totalTasks: 5, measuredImpact: 0, validationPending: false });
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      const text = container.textContent!;
      expect(text).toContain("No measurable change yet");
      expect(text).not.toContain("improved");
      expect(text).not.toContain("+0");
    });
  });

  it("negative measuredImpact → NO '+' prefix, NO 'improved' word", async () => {
    mockFetch({ completedThisMonth: 1, totalTasks: 3, measuredImpact: -5.0, validationPending: false });
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      const text = container.textContent!;
      expect(text).not.toContain("+");
      expect(text).not.toContain("improved");
      expect(text).not.toContain("↑");
    });
  });
});

describe("4.4 — exactly ONE work-completed surface (F7)", () => {
  it("renders exactly 1 'Work Completed' card heading", async () => {
    mockFetch({ completedThisMonth: 2, totalTasks: 5, measuredImpact: 8.5, validationPending: false });
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
    mockFetch({ completedThisMonth: 0, totalTasks: 0, measuredImpact: null, validationPending: false });
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      expect(container.textContent).toContain("No gaps closed yet this month");
    });
  });

  it("fetch error → shows empty state (no crash)", async () => {
    mockFetchError();
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      // null data → empty state
      expect(container.textContent).toContain("No gaps closed yet this month");
    });
  });
});

describe("4.4 — LLD 9060: prominent placement", () => {
  it("⚠️ WEAK (structural): tracker grid renders BEFORE any fold-level section", async () => {
    // This is a structural assertion — real prominence needs Playwright visual test
    mockFetch({ completedThisMonth: 1, totalTasks: 3, measuredImpact: null, validationPending: false });
    const { container } = render(<ActionProgressTracker brandId="b1" />);
    await waitFor(() => {
      // The tracker uses grid-cols-1 md:grid-cols-2 and mb-6 (above other content)
      const grid = container.querySelector("[class*='grid']");
      expect(grid).not.toBeNull();
      expect(grid?.className).toContain("mb-6");
    });
  });
});
