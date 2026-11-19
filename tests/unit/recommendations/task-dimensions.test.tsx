// @vitest-environment jsdom
/**
 * 20 Nov (Sri's decision, part 8): Sentiment and Context aren't measured, so no page, PDF, email, portal or export shows
 * either as a task's dimension. Production has 15 action_items tagged "context" (14 dismissed, 1 open) from before the
 * triggers stopped writing it; they keep their tag (no production write) and show under the measured group their
 * recommendation fits -- faq-content under "Website content" -- or under none. No code path can write a new task with
 * either tag. And recommendation_research, empty on production, gets only verified sources from
 * db/prod-fixes/data-recommendation-research-verified-run2-apply.sql.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { DimensionGroup } from "@/components/domain/action-center/dimension-group";
import { deriveSourceType, VERIFIED_CITATIONS } from "@/lib/methodology/verified-citations";
import {
  ACTION_GROUP_LABELS,
  ACTION_GROUP_ORDER,
  assertMeasuredTaskDimension,
  taskDimensionLabel,
  taskDisplayDimension,
} from "@/lib/scoring/dimension-labels";

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

afterEach(() => cleanup());

describe("a task's dimension is never Context or Sentiment", () => {
  it("a stored 'context' faq-content item shows under Website content; any other unmeasured tag shows none", () => {
    expect(taskDisplayDimension("context", "faq-content")).toBe("content");
    expect(taskDimensionLabel("context", "faq-content")).toBe("Website content");
    expect(taskDimensionLabel("context", "press-mentions")).toBeNull();
    expect(taskDimensionLabel("sentiment", "faq-content")).toBe("Website content");
    expect(taskDimensionLabel("sentiment", "reddit-absence")).toBeNull();
    // A measured tag is shown as it is.
    expect(taskDimensionLabel("frequency", "reddit-absence")).toBe("Frequency");
    expect(taskDimensionLabel("accuracy", "expert-quotes")).toBe("Source citation");
  });

  it("the Action Center has no Context or Sentiment group", () => {
    expect(ACTION_GROUP_ORDER).not.toContain("context");
    expect(ACTION_GROUP_ORDER).not.toContain("sentiment");
    expect(Object.values(ACTION_GROUP_LABELS)).not.toContain("Context");
    expect(Object.values(ACTION_GROUP_LABELS)).not.toContain("Sentiment");
  });

  it("renders a stored 'context' item under Website content, and one with no fitting group under Other", () => {
    const item = (id: string, recommendationKey: string) => ({
      id,
      title: `Title ${id}`,
      action: "Do the thing.",
      confidenceLabel: "likely",
      expectedImpactScore: "medium",
      evidenceRefs: [],
      dimension: "context",
      confidenceBasis: null,
      recommendationKey,
      createdAt: "2026-11-10T00:00:00Z",
      displayBasis: "unverified" as const,
    });
    const { container } = render(
      <DimensionGroup
        items={[item("a", "faq-content"), item("b", "press-mentions")]}
        isFree={false}
      />,
    );
    const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings.join(" ")).not.toMatch(/Context|Sentiment/);
    expect(screen.getByText("Website content")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("the detail page, the client portal and the task cards read the mapped label", () => {
    const detail = strip(readFileSync("app/(auth)/action-center/[id]/page.tsx", "utf8"));
    expect(detail).toContain("taskDimensionLabel(item.dimension, item.recommendationKey)");
    expect(detail).not.toContain("actionGroupLabel(item.dimension)");
    const portal = strip(readFileSync("app/client-portal/[inviteToken]/page.tsx", "utf8"));
    expect(portal).toContain(
      "dimensionLabel: taskDimensionLabel(r.dimension, r.recommendationKey)",
    );
    expect(portal).not.toContain("dimensionLabel(item.dimension)");
    const tasks = strip(
      readFileSync("app/(auth)/brands/[brandId]/workflow/tasks/page.tsx", "utf8"),
    );
    expect(tasks).toContain("dimension: taskDimensionLabel(t.dimension, t.recommendationKey)");
  });
});

describe("no code path writes a new task tagged Context or Sentiment", () => {
  it("the writers refuse it", () => {
    expect(() => assertMeasuredTaskDimension("context")).toThrow("isn't a measured dimension");
    expect(() => assertMeasuredTaskDimension("sentiment")).toThrow();
    expect(() => assertMeasuredTaskDimension("content")).not.toThrow();
    expect(() => assertMeasuredTaskDimension(undefined)).not.toThrow();
    expect(strip(readFileSync("lib/workflow/task-manager.ts", "utf8"))).toContain(
      "assertMeasuredTaskDimension(input.dimension);",
    );
    expect(strip(readFileSync("lib/recommendations/persist.ts", "utf8"))).toContain(
      "for (const rec of toInsert) assertMeasuredTaskDimension(rec.dimension);",
    );
  });

  it("an old 'context' item turned into a task takes the mapped group, not the tag", () => {
    expect(strip(readFileSync("lib/workflow/task-manager.ts", "utf8"))).toContain(
      "dimension: taskDisplayDimension(rec.dimension, rec.recommendationKey) ?? undefined,",
    );
  });

  it("no task writer or trigger names either tag", () => {
    const writers = [
      "lib/recommendations/triggers.ts",
      "lib/recommendations/persist.ts",
      "lib/workflow/task-manager.ts",
      "lib/agent-analytics/task-emitter.ts",
      "inngest/functions/check-cross-platform-consensus.ts",
    ];
    for (const file of writers) {
      expect(strip(readFileSync(file, "utf8")), file).not.toMatch(
        /dimension:\s*["'](context|sentiment)["']/,
      );
    }
  });
});

describe("recommendation_research: verified sources only", () => {
  const run2 = readFileSync(
    "db/prod-fixes/data-recommendation-research-verified-run2-apply.sql",
    "utf8",
  );
  // Each VALUES row: key, source, url, summary, confidence.
  const rows = [...run2.matchAll(/\('([a-z-]+)',\s*'([^']*)',\s*'([^']*)',/g)].map((m) => ({
    key: m[1],
    source: m[2],
    url: m[3],
  }));

  it("run2 inserts three rows, each a verified citation's exact name and URL", () => {
    expect(rows.map((r) => r.key)).toEqual(["expert-quotes", "cited-statistics", "press-mentions"]);
    for (const row of rows) {
      expect(deriveSourceType(row.source, row.url), row.key).toBe("research");
    }
    expect(rows[0].source).toBe(VERIFIED_CITATIONS.aggarwalGEO.name);
    expect(rows[2].url).toBe(VERIFIED_CITATIONS.ahrefsBenchmark.url);
  });

  it("the set is complete: a read-only preview, the apply, a verify and a rollback", () => {
    for (const run of ["run1-preview", "run3-verify"]) {
      const sql = readFileSync(
        `db/prod-fixes/data-recommendation-research-verified-${run}.sql`,
        "utf8",
      );
      expect(sql).toContain("BEGIN TRANSACTION READ ONLY;");
      expect(sql).toContain("ROLLBACK;");
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    }
    const rollback = readFileSync(
      "db/prod-fixes/data-recommendation-research-verified-run4-rollback.sql",
      "utf8",
    );
    expect(rollback).toContain("DELETE FROM recommendation_research");
    expect(run2).toContain("WHERE NOT EXISTS");
  });
});
