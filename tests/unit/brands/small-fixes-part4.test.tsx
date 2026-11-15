// @vitest-environment jsdom
/**
 * Leftovers task, part 4 (17 Nov): Autopilot step 2's priority, the brands list's Business pill, and /portfolio.
 *
 * - Step 2 said "Priority: 5000" -- remediation_tasks.priority, an internal score (impact x confidence x effort x 100)
 *   -- and its task was the brand's LEAST urgent (the page sorted low first; rankTasks ranks high first). It's the most
 *   urgent open task now, said in words: "Top priority of 3 open tasks".
 * - Omega's "Plumbing · Electrical · General trades" pill wrapped onto two lines beside the Region column: two types
 *   and "+N" at most, on one line, the full list in its tooltip.
 * - /portfolio, linked from nowhere and showing "↑ from 25%" with no counts or audits, is gone (the agency page shows
 *   the same brands' measured changes).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import {
  AutopilotLoop,
  type AutopilotLoopData,
  mostUrgentTask,
  openTaskPriority,
} from "@/components/domain/autopilot/autopilot-loop";
import { brandBusinessLabel, brandBusinessPill } from "@/lib/brands/business-label";

describe("Autopilot step 2: the most urgent open task, in words", () => {
  it("picks the highest priority score, never the lowest", () => {
    const tasks = [
      { id: "low", priority: 50 },
      { id: "high", priority: 5000 },
      { id: "mid", priority: 900 },
    ];
    expect(mostUrgentTask(tasks)?.id).toBe("high");
    expect(mostUrgentTask([])).toBeNull();
  });

  it("says its place among the brand's open tasks", () => {
    expect(openTaskPriority(3)).toBe("Top priority of 3 open tasks");
    expect(openTaskPriority(1)).toBe("Your only open task");
  });

  it("the loop shows the words, never the internal score", () => {
    const data = {
      audit: {
        scoreComposite: 33,
        engineCount: 4,
        promptsCount: 10,
        completedAt: "2026-11-15T03:00:00Z",
        auditNumber: 50,
      },
      topGap: null,
      topTask: {
        id: "t1",
        title: "Update local directory listings",
        status: "open",
        priority: 5000,
        description: null,
      },
      openTaskCount: 3,
      explainability: null,
      draft: null,
      brandId: "b1",
      brandName: "Hero Home Services",
    } as unknown as AutopilotLoopData;
    render(<AutopilotLoop data={data} />);
    expect(screen.getAllByText("Top priority of 3 open tasks").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Priority: 5000|5000/);
  });
});

describe("the brands list's Business pill", () => {
  const confirmed = { categoryConfirmedAt: "2026-11-01T00:00:00Z" };

  it("two types at most, then +N, with every type in the tooltip", () => {
    expect(
      brandBusinessPill({
        vertical: "tradies",
        categories: ["trades_plumbing", "trades_electrical", "trades_general"],
        ...confirmed,
      }),
    ).toEqual({
      label: `${brandBusinessLabel({ vertical: "tradies", categories: ["trades_plumbing", "trades_electrical"], ...confirmed })} +1`,
      full: brandBusinessLabel({
        vertical: "tradies",
        categories: ["trades_plumbing", "trades_electrical", "trades_general"],
        ...confirmed,
      }),
    });
  });

  it("one or two types: as they are, no tooltip; unconfirmed: the vertical", () => {
    expect(brandBusinessPill({ vertical: "tradies", categories: ["cafe"], ...confirmed })).toEqual({
      label: brandBusinessLabel({ vertical: "tradies", categories: ["cafe"], ...confirmed }),
      full: null,
    });
    expect(
      brandBusinessPill({ vertical: "tradies", categories: [], categoryConfirmedAt: null }),
    ).toEqual({
      label: "Tradies",
      full: null,
    });
  });

  it("the list draws it on one line, with the full list as its title", () => {
    const page = readFileSync(join(process.cwd(), "app/(auth)/brands/page.tsx"), "utf8");
    expect(page).toContain("brandBusinessPill(brand)");
    expect(page).toMatch(/title=\{pill\.full \?\? undefined\}/);
    expect(page).toMatch(/whiteSpace: "nowrap"/);
  });
});

describe("/portfolio is gone", () => {
  it("no page, and nothing links to it", () => {
    expect(existsSync(join(process.cwd(), "app/(auth)/portfolio"))).toBe(false);
    for (const file of ["components/domain/app-sidebar.tsx", "lib/navigation/breadcrumbs.ts"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8"), file).not.toMatch(/["'`]\/portfolio/);
    }
  });
});
