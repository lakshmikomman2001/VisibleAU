import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type postgres from "postgres";

/**
 * S02 part 4: a workspace's question set version 1, made by prod-fix 0155 run2's own backfill SQL (the BACKFILL
 * section, limited to the one workspace), so a test's set is exactly what production's will be. For vitest and
 * Playwright alike: no vitest import here. The SQL runs in one transaction (its temp table drops on commit).
 */
const RUN2 = "db/prod-fixes/0155-s02-run2-apply.sql";
const BEGIN = "-- ==== BACKFILL (begin) ====";
const END = "-- ==== BACKFILL (end) ====";
const FILTER = "  AND NOT EXISTS (SELECT 1 FROM brand_question_sets s WHERE s.brand_id = b.id);";

export function backfillSectionFor(orgId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(orgId)) {
    throw new Error(`not a workspace id: ${orgId}`);
  }
  const run2 = readFileSync(resolve(process.cwd(), RUN2), "utf8").replace(/\r\n/g, "\n");
  const start = run2.indexOf(BEGIN);
  const end = run2.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${RUN2} has no BACKFILL section`);
  const section = run2.slice(start, end);
  if (section.split(FILTER).length !== 2)
    throw new Error(`${RUN2}'s BACKFILL section changed: no brand filter`);
  return section.replace(FILTER, FILTER.replace(";", ` AND b.organization_id = '${orgId}';`));
}

export async function backfillQuestionSets(sql: postgres.Sql, orgId: string): Promise<void> {
  const section = backfillSectionFor(orgId);
  await sql.begin((tx) => tx.unsafe(section));
}
