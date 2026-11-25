/**
 * S01C part 4 (LLD amendment 63; contract v1.6 P07.beyond, P09.beyond, P09.method): "Beyond AI answers" says what
 * each check measured. Quoted from the real Enhanced report: the page was headed "What AI can read about you
 * elsewhere"; the crawlers tile printed "4 of 4 · checked 21 Nov 2026"; the technical tile "40 of 74 · checked 21 Nov
 * 2026 · v4 scoring"; the directory tile mixed "linked · cited in 15 answers" with "not linked (cited in 17
 * answers)" and listed 6 of 13 without saying so.
 *
 * Two invented businesses seeded as real audits, their Enhanced reports by the real path: Waratah (shaped like the
 * real audit #54: technical 40 of 74, structured data its weakest area at 4 of 16, 13 directories) and Bluegum (no
 * area scores stored, 4 directories). The audit page card reads the same tiles (tests/unit/components/
 * beyond-ai-card.test.tsx).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BLUEGUM,
  type SeededReportBrand,
  seedReportBrand,
  WARATAH,
} from "@/tests/helpers/report-seeds";
import { type RenderedReport, renderSeededReport } from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => {}, youtube: async () => {} }),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const seeds: SeededReportBrand[] = [];
let waratah: RenderedReport;
let bluegum: RenderedReport;
const DATE = String.raw`\d{1,2} [A-Z][a-z]{2} \d{4}`;

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const w = await seedReportBrand(sql, WARATAH);
  const b = await seedReportBrand(sql, BLUEGUM);
  seeds.push(w, b);
  waratah = await renderSeededReport(sql, w, "enhanced");
  bluegum = await renderSeededReport(sql, b, "enhanced");
}, 300_000);

afterAll(async () => {
  for (const seed of seeds) await seed.cleanup();
  await sql.end();
});

describe("the Enhanced PDF's Beyond AI answers page", () => {
  it("is headed 'What else we checked about your business'", () => {
    for (const r of [waratah, bluegum]) {
      expect(r.text).toContain("\nWhat else we checked about your business\n");
      expect(r.text).not.toContain("What AI can read about you elsewhere");
    }
  });

  it("AI crawlers: '{allowed} of {total} AI search crawlers allowed · checked {date}'", () => {
    for (const r of [waratah, bluegum]) {
      expect(r.text).toMatch(
        new RegExp(`\\n4 of 4 AI search crawlers allowed · checked ${DATE}\\n`),
      );
      expect(r.text).not.toMatch(new RegExp(`\\n4 of 4 · checked ${DATE}\\n`));
    }
  });

  it("Website technical: points, the date, the weakest area in plain words; no scoring version on the tile", () => {
    expect(waratah.text).toMatch(/\n40 of 74 points\n/);
    expect(waratah.text).toMatch(
      new RegExp(`\\nchecked ${DATE}\\nWeakest: structured data, 4 of 16 points\\n`),
    );
    expect(bluegum.text).toMatch(/\n48 of 74 points\n/);
    for (const r of [waratah, bluegum])
      expect(r.text).not.toMatch(new RegExp(`checked ${DATE} · v4 scoring`));
  });

  it("the scoring version is on Method's 'Checks outside AI answers' line instead", () => {
    for (const r of [waratah, bluegum])
      expect(r.text).toMatch(new RegExp(`technical ${DATE}, v4 scoring`));
  });

  it("Your directory profiles: linked of cited, the top 6 in one form, then how many more and where", () => {
    expect(waratah.text).toContain(
      "\nLinked 1 of 13 directories AI cites for your questions.\nYellow Pages · cited in 17 of 40 answers · not linked yet\nLocalsearch · cited in 8 of 40 answers · linked\nhipages · cited in 7 of 40 answers · not linked yet\n",
    );
    expect(waratah.text).toContain("\n+ 7 more in section 04\n");
    expect(bluegum.text).toContain("\nLinked 1 of 4 directories AI cites for your questions.\n");
    expect(bluegum.text).not.toMatch(/\n\+ \d+ more/);
    for (const r of [waratah, bluegum]) {
      expect(r.text).not.toMatch(/: linked · cited in \d+ answers?/);
      expect(r.text).not.toMatch(/: not linked \(cited in/);
    }
  });
});
