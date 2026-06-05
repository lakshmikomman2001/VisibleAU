import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db } from "../../shared/db";

test.describe("F02: Research seed — 12 citations across 11 action types", () => {
  test("F02-01: recommendation_research has at least 11 rows (one per universal type)", async () => {
    const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM recommendation_research`);
    const count = (result as unknown as { count: number }[])[0].count;
    expect(count).toBeGreaterThanOrEqual(11);
  });

  test("F02-02: All 11 universal action type keys have at least 1 research citation", async () => {
    const result = await db.execute(sql`
      SELECT recommendation_key, COUNT(*)::int AS count
      FROM recommendation_research GROUP BY recommendation_key
    `);
    const rows = result as unknown as { recommendation_key: string; count: number }[];
    const keyMap = new Map(rows.map((r) => [r.recommendation_key, r.count]));
    const expected = [
      "wikipedia-article", "au-local-citations", "faq-content", "expert-quotes",
      "cited-statistics", "stale-content", "comparison-article", "reddit-absence",
      "medium-presence", "linkedin-presence", "press-mentions",
    ];
    for (const key of expected) {
      expect(keyMap.has(key), `Missing research citation for ${key}`).toBe(true);
      expect(keyMap.get(key)!, `${key} has 0 citations`).toBeGreaterThanOrEqual(1);
    }
  });

  test("F02-03: All research rows have non-null source and summary", async () => {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM recommendation_research
      WHERE source IS NULL OR source = '' OR summary IS NULL OR summary = ''
    `);
    expect((result as unknown as { count: number }[])[0].count).toBe(0);
  });

  test("F02-04: All research rows have valid confidence_level", async () => {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM recommendation_research
      WHERE confidence_level NOT IN ('confirmed', 'likely', 'hypothesis')
    `);
    expect((result as unknown as { count: number }[])[0].count).toBe(0);
  });

  test("F02-05: Seed is idempotent — no duplicate recommendation_key+source pairs", async () => {
    const result = await db.execute(sql`
      SELECT recommendation_key, source, COUNT(*)::int AS cnt
      FROM recommendation_research
      GROUP BY recommendation_key, source
      HAVING COUNT(*) > 1
    `);
    expect((result as unknown[]).length, "Duplicate research rows found").toBe(0);
  });
});
