/**
 * S02 part 0B (LLD amendment 68; contract v1.7 P09.next): OTHER ACTIONS FROM THIS AUDIT, in Standard and Enhanced, on
 * the Waratah seed (tests/helpers/report-seeds.ts), whose two other actions are rule j's (Medium) and the Wikipedia
 * check's item (Low):
 * - with no order saved, High, Medium, Low, then newest first: rule j, then the Wikipedia item (S01C part 3b);
 * - when the agency saved an order for the group in the report contents panel (report_action_choices.position), that
 *   order wins: the Wikipedia item first, though it's Low.
 * Each report is generated and rendered by the real path (renderSeededReport).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type SeededReportBrand, seedReportBrand, WARATAH } from "@/tests/helpers/report-seeds";
import { type RenderedReport, renderSeededReport } from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => undefined, youtube: async () => undefined }),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let seed: SeededReportBrand;
const JOB = "Add your ABN and link your Google Business Profile";
const WIKI = "Get covered in local press or on community sites";
const reports: Record<
  "default" | "saved",
  Partial<Record<"standard" | "enhanced", RenderedReport>>
> = {
  default: {},
  saved: {},
};

/** The OTHER ACTIONS group's text, from its label to the next group's (or the page's end). */
function otherActions(r: RenderedReport): string {
  const start = r.text.indexOf("OTHER ACTIONS FROM THIS AUDIT");
  expect(start).toBeGreaterThan(-1);
  return r.text.slice(start);
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  seed = await seedReportBrand(sql, WARATAH);
  for (const tier of ["standard", "enhanced"] as const) {
    reports.default[tier] = await renderSeededReport(sql, seed, tier);
  }
  // The agency's saved order, as the panel saves it: every measured item with an Action Center item gets its place.
  const items = await sql<{ id: string; title: string; action: string }[]>`
    SELECT id, title, action FROM action_items WHERE audit_id = ${seed.basisAuditId}`;
  const rank = (i: { title: string; action: string }) =>
    `${i.title} ${i.action}`.includes("Wikipedia")
      ? 0
      : /ABN|Business Profile/.test(i.title)
        ? 1
        : 2;
  const ordered = [...items].sort((a, b) => rank(a) - rank(b));
  for (const [position, item] of ordered.entries()) {
    await sql`
      INSERT INTO report_action_choices (organization_id, brand_id, action_item_id, included, position)
      VALUES (${seed.orgId}, ${seed.brandId}, ${item.id}, true, ${position})`;
  }
  for (const tier of ["standard", "enhanced"] as const) {
    reports.saved[tier] = await renderSeededReport(sql, seed, tier);
  }
}, 600_000);

afterAll(async () => {
  await sql`DELETE FROM report_action_choices WHERE brand_id = ${seed.brandId}`;
  await seed.cleanup();
  await sql.end();
});

describe("OTHER ACTIONS FROM THIS AUDIT's order (amendment 68)", () => {
  it.each([
    "standard",
    "enhanced",
  ] as const)("%s, no order saved: High, Medium, Low, then newest -- rule j (Medium), then the Wikipedia item (Low)", (tier) => {
    const group = otherActions(reports.default[tier] as RenderedReport);
    expect(group.indexOf(JOB)).toBeGreaterThan(-1);
    expect(group.indexOf(WIKI)).toBeGreaterThan(group.indexOf(JOB));
  });

  it.each([
    "standard",
    "enhanced",
  ] as const)("%s, the agency's saved order: the Wikipedia item first, though it's Low", (tier) => {
    const group = otherActions(reports.saved[tier] as RenderedReport);
    expect(group.indexOf(WIKI)).toBeGreaterThan(-1);
    expect(group.indexOf(JOB)).toBeGreaterThan(group.indexOf(WIKI));
  });

  it("the saved places are in the report's own contents (its snapshot), so Try again prints the same order", () => {
    const measured =
      (reports.saved.standard as RenderedReport).data.v2?.whatToDoNext?.measured ?? [];
    expect(measured.some((m) => typeof m.position === "number")).toBe(true);
    const defaults =
      (reports.default.standard as RenderedReport).data.v2?.whatToDoNext?.measured ?? [];
    expect(defaults.every((m) => m.position === null || m.position === undefined)).toBe(true);
  });
});
