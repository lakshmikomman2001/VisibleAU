/**
 * 14 Nov (Sri approved): one order for an audit's open action items -- priority (expected impact: high, medium,
 * low), then the date it was made (oldest first), then title -- used by the PDF's Action Plan (the export route)
 * and the audit page's general advice, so the two match (lib/recommendations/action-order.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareActionItems } from "@/lib/recommendations/action-order";

const item = (title: string, expectedImpactScore: string, createdAt: string) => ({
  title,
  expectedImpactScore,
  createdAt: new Date(createdAt),
});

describe("compareActionItems", () => {
  it("priority first, then oldest first, then title", () => {
    const items = [
      item("Zebra advice", "low", "2026-11-13T10:00:00Z"),
      item("Beta advice", "high", "2026-11-13T10:05:00Z"),
      item("Alpha advice", "high", "2026-11-13T10:05:00Z"),
      item("Mid advice", "medium", "2026-11-13T09:00:00Z"),
      item("Older high", "high", "2026-11-13T09:00:00Z"),
      item("Unknown priority", "someday", "2026-11-13T08:00:00Z"),
    ];
    expect([...items].sort(compareActionItems).map((i) => i.title)).toEqual([
      "Older high",
      "Alpha advice",
      "Beta advice",
      "Mid advice",
      "Zebra advice",
      "Unknown priority",
    ]);
  });

  it("an ISO string date compares as the same moment", () => {
    const a = { title: "A", expectedImpactScore: "medium", createdAt: "2026-11-13T09:00:00.000Z" };
    const b = item("B", "medium", "2026-11-13T09:00:00Z");
    expect(compareActionItems(a, b)).toBeLessThan(0);
  });

  it("the export route and the audit page both sort with it", () => {
    const root = join(__dirname, "../../..");
    const route = readFileSync(join(root, "app/api/audits/[auditId]/export/route.ts"), "utf8");
    const page = readFileSync(join(root, "app/(auth)/audits/[auditId]/page.tsx"), "utf8");
    expect(route).toMatch(/\.sort\(compareActionItems\)/);
    expect(page).toMatch(/\.sort\(compareActionItems\)/);
  });
});
