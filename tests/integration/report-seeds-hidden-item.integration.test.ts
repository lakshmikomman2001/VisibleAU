/**
 * S04 part 0i (LLD amendment 91): the seeded agency hides the open item that comes first by title -- the same one on
 * every run, whatever ids the audit's items got (they share one created_at) -- so OTHER ACTIONS FROM THIS AUDIT always
 * holds the items it expects. The query itself is pinned by tests/unit/e2e/fixture-timeouts.test.ts.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BLUEGUM, type SeededReportBrand, seedReportBrand } from "@/tests/helpers/report-seeds";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let seed: SeededReportBrand;

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  seed = await seedReportBrand(sql, BLUEGUM);
}, 300_000);

afterAll(async () => {
  await seed?.cleanup();
  await sql.end();
});

describe("the hidden item", () => {
  it("is the basis audit's first open item by title (other than the directory item), and the only one hidden", async () => {
    const items = await sql<{ title: string }[]>`
      SELECT title FROM action_items
      WHERE audit_id = ${seed.basisAuditId} AND status = 'open' AND recommendation_key <> 'directory-visibility'
      ORDER BY title COLLATE "C", id`;
    expect(items.length).toBeGreaterThan(0);
    expect(seed.hiddenActionTitle).toBe(items[0].title);
    const hidden = await sql<{ title: string }[]>`
      SELECT a.title FROM report_action_choices c JOIN action_items a ON a.id = c.action_item_id
      WHERE c.brand_id = ${seed.brandId} AND c.included = false`;
    expect(hidden).toEqual([{ title: items[0].title }]);
  });
});
