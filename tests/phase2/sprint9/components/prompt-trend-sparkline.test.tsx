// @vitest-environment jsdom
/**
 * SECTION 4.5 — prompt-trend-sparkline.tsx (§6U.5)
 *
 * Mounted via PromptTrendSection on the Autopilot page.
 */

import { render, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock recharts — jsdom can't render SVG chart internals
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="line-chart" data-points={data?.length}>
      {children}
    </div>
  ),
  Line: ({ stroke }: { stroke: string }) => <div data-testid="line" data-stroke={stroke} />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

import { PromptTrendSparkline } from "@/components/domain/autopilot/prompt-trend-sparkline";

beforeEach(() => {
  vi.restoreAllMocks();
});

// 17 Nov, part 3: one point per audit, with its counts (lib/visibility/question-trend.ts).
type Point = {
  auditNumber: number;
  completedAt: string | null;
  mentioned: number;
  answers: number;
};
function mockFetchTrend(trend: Point[], message?: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ trend, message }),
  });
}

function mockFetchError() {
  global.fetch = vi.fn().mockRejectedValue(new Error("network"));
}

describe("4.5 — PromptTrendSparkline: declared states", () => {
  describe("loading state", () => {
    it("renders a shimmer (animate-pulse) while fetching", () => {
      global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      const shimmer = container.querySelector("[class*='animate-pulse']");
      expect(shimmer).not.toBeNull();
    });

    it("shimmer has fixed width (w-24) for inline cell layout", () => {
      global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      const shimmer = container.querySelector("[class*='animate-pulse']");
      expect(shimmer?.className).toContain("w-24");
    });
  });

  describe("empty (<2 weeks of data)", () => {
    it("renders 'Not enough history yet' — NOT a flat zero line", async () => {
      mockFetchTrend([]);
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        expect(container.textContent).toContain("Not enough history yet");
      });
    });

    it("1 data point → also shows message (need >=2 for trend)", async () => {
      mockFetchTrend([{ auditNumber: 1, completedAt: null, mentioned: 1, answers: 4 }]);
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        expect(container.textContent).toContain("Not enough history yet");
      });
    });

    it("server message overrides default text", async () => {
      mockFetchTrend([], "Custom server message");
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        expect(container.textContent).toContain("Custom server message");
      });
    });
  });

  describe("error state", () => {
    // Stale since the af8de42..d1eb5a1 follow-ups (part 1): a failed fetch was a quiet "—" (or "Not enough
    // history yet", a claim about the data made from no answer). It says it couldn't load, with Try again.
    it("says it couldn't load the trend on fetch error, with Try again — no error boundary", async () => {
      mockFetchError();
      const { container, getByRole } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        expect(container.textContent).toContain("Couldn't load the trend.");
      });
      expect(getByRole("button", { name: "Try again" })).toBeTruthy();
    });

    it("never 'Not enough history yet' or a raw error on a failed fetch", async () => {
      mockFetchError();
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => expect(container.textContent).toContain("Couldn't load"));
      expect(container.textContent).not.toContain("Not enough history yet");
      expect(container.textContent).not.toContain("Error");
    });
  });

  describe("data state (trend renders)", () => {
    const TREND_DATA: Point[] = [
      { auditNumber: 47, completedAt: null, mentioned: 0, answers: 4 },
      { auditNumber: 48, completedAt: null, mentioned: 1, answers: 4 },
      { auditNumber: 49, completedAt: null, mentioned: 2, answers: 4 },
      { auditNumber: 50, completedAt: null, mentioned: 3, answers: 4 },
    ];

    it("renders a LineChart when >=2 data points", async () => {
      mockFetchTrend(TREND_DATA);
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        const chart = container.querySelector("[data-testid='line-chart']");
        expect(chart).not.toBeNull();
      });
    });

    // 17 Nov, part 3: a neutral line -- it was green or red from the first and last points alone, a verdict from
    // a few answers.
    it("the line is neutral whichever way it goes: no green/red verdict", async () => {
      for (const trend of [TREND_DATA, [...TREND_DATA].reverse()]) {
        mockFetchTrend(trend);
        const { container, unmount } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
        await waitFor(() => {
          const line = container.querySelector("[data-testid='line']");
          expect(line?.getAttribute("data-stroke")).toBe("var(--accent-blue)");
        });
        unmount();
      }
    });
  });

  describe("responsive layout", () => {
    it("⚠️ WEAK (CSS-class): on <sm moves below (block), on sm+ inline (sm:inline-block)", () => {
      // WEAK: CSS-class assertion — real viewport test needs Playwright
      const { readFileSync } = require("fs");
      const source = readFileSync(
        "components/domain/autopilot/prompt-trend-sparkline.tsx",
        "utf-8",
      );
      expect(source).toContain("sm:inline-block");
      expect(source).toContain("block");
      expect(source).toContain("sm:w-24");
      expect(source).toContain("w-full");
    });
  });

  describe("F12: mount status — component IS mounted", () => {
    it("component file exists and exports PromptTrendSparkline", () => {
      const { existsSync } = require("fs");
      expect(existsSync("components/domain/autopilot/prompt-trend-sparkline.tsx")).toBe(true);
    });

    it("PromptTrendSparkline is imported by prompt-trend-section (which is mounted on autopilot page)", () => {
      const { readFileSync } = require("fs");
      const section = readFileSync("components/domain/autopilot/prompt-trend-section.tsx", "utf-8");
      expect(section).toContain("PromptTrendSparkline");
    });
  });
});
