// @vitest-environment jsdom
/**
 * SECTION 4.5 — prompt-trend-sparkline.tsx (§6U.5)
 *
 * Mounted via PromptTrendSection on the Autopilot page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";

// Mock recharts — jsdom can't render SVG chart internals
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => <div data-testid="line-chart" data-points={data?.length}>{children}</div>,
  Line: ({ stroke }: { stroke: string }) => <div data-testid="line" data-stroke={stroke} />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

import { PromptTrendSparkline } from "@/components/domain/autopilot/prompt-trend-sparkline";

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchTrend(trend: { week: string; mentionRate: number }[], message?: string) {
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
      mockFetchTrend([{ week: "2026-06-01", mentionRate: 0.08 }]);
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
    it("renders a muted dash '—' on fetch error — no error boundary", async () => {
      mockFetchError();
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        expect(container.textContent).toContain("—");
      });
    });

    it("no Error text or red state on error — just a quiet dash", async () => {
      mockFetchError();
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        expect(container.textContent).not.toContain("Error");
        expect(container.textContent).not.toContain("error");
      });
    });
  });

  describe("data state (trend renders)", () => {
    const TREND_DATA = [
      { week: "2026-04-07", mentionRate: 0.08 },
      { week: "2026-04-14", mentionRate: 0.12 },
      { week: "2026-04-21", mentionRate: 0.22 },
      { week: "2026-04-28", mentionRate: 0.34 },
    ];

    it("renders a LineChart when >=2 data points", async () => {
      mockFetchTrend(TREND_DATA);
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        const chart = container.querySelector("[data-testid='line-chart']");
        expect(chart).not.toBeNull();
      });
    });

    it("improving trend (latest >= first) → success stroke color", async () => {
      mockFetchTrend(TREND_DATA); // 8% → 34%, improving
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        const line = container.querySelector("[data-testid='line']");
        expect(line?.getAttribute("data-stroke")).toContain("success");
      });
    });

    it("declining trend (latest < first) → danger stroke color", async () => {
      const declining = [
        { week: "2026-04-07", mentionRate: 0.34 },
        { week: "2026-04-14", mentionRate: 0.22 },
        { week: "2026-04-21", mentionRate: 0.12 },
      ];
      mockFetchTrend(declining);
      const { container } = render(<PromptTrendSparkline brandId="b1" promptId="p1" />);
      await waitFor(() => {
        const line = container.querySelector("[data-testid='line']");
        expect(line?.getAttribute("data-stroke")).toContain("danger");
      });
    });
  });

  describe("responsive layout", () => {
    it("⚠️ WEAK (CSS-class): on <sm moves below (block), on sm+ inline (sm:inline-block)", () => {
      // WEAK: CSS-class assertion — real viewport test needs Playwright
      const { readFileSync } = require("fs");
      const source = readFileSync("components/domain/autopilot/prompt-trend-sparkline.tsx", "utf-8");
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
