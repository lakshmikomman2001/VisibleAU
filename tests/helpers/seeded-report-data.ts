/**
 * S03 part 0 (LLD amendment 77): the report data a test of the report's sentences, findings and pages starts from --
 * an invented business seeded as real audits in the integration database and turned into a report by the real path
 * (LLD amendment 51: the generator, then loadReportRenderData; tests/helpers/seeded-report-render.tsx), never
 * hand-composed ReportData. It replaces the report-data fixture S03 part 0 retired, which composed ReportData shaped
 * like two old audits: #37 (Claude failed, 5 of 30) and #39 (every engine, 7 of 40). The same two shapes, seeded:
 * - IRONSTONE_ALL_ENGINES (the old #39): Ironstone over audits #37-#39 -- #37 as IRONSTONE's own audit (Claude out of
 *   credit, 5 of 30), #38 every engine (9 of 40) and the basis #39 every engine (7 of 40: ChatGPT 4, Perplexity 3,
 *   Claude and Gemini none), with hipages, Word of Mouth and Localsearch cited in 8, 6 and 5 of its 40 answers (all
 *   Perplexity's), none of them linked, and no competitors set;
 * - IRONSTONE as seeded (the old #37): audit #55, Claude out of credit for the whole audit, 5 of 30, seven directories.
 * Each report is today's (report_v2 off), as the old fixture's ReportData was. Its directory rows are the real ones:
 * every cited directory and the brand's type's usual directories that weren't cited (citedCount 0), with each one's
 * kind and per-engine citations.
 *
 * A test file calls `seededReportData` once, at its top level: its beforeAll seeds and renders each spec, its afterAll
 * removes every row it made. The getter it returns gives a fresh copy each call, so a test can change one freely.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, vi } from "vitest";
import type { ReportData } from "@/lib/reports/report-data";
import type { ReportDataV2 } from "@/lib/reports/report-snapshot";
import {
  IRONSTONE,
  type SeededReportBrand,
  type SeedSpec,
  seedReportBrand,
} from "@/tests/helpers/report-seeds";
import { type RenderedReport, renderSeededReport } from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const THREE_DIRECTORIES = {
  "hipages.com.au": 8,
  "wordofmouth.com.au": 6,
  "localsearch.com.au": 5,
};
/**
 * The three directories are cited in Perplexity's answers (answers 30-39, the fourth engine's), so the engines that
 * never name the business (Claude and Gemini) cited none, and rule b has no directory action -- as the old fixture's
 * rows, which carried no per-engine citations, had it. Tests that swap in their own engine rows keep Perplexity
 * answering, so their silent engines cited none either.
 */
const ON_PERPLEXITY = Object.fromEntries(Object.keys(THREE_DIRECTORIES).map((d) => [d, 30]));

/** Ironstone over three audits, every engine answering the basis #39 (see above). */
export const IRONSTONE_ALL_ENGINES: SeedSpec = {
  ...IRONSTONE,
  competitors: [],
  audits: [
    { ...IRONSTONE.audits[0], number: 37, completedAt: "2026-11-17T23:00:00.000Z" },
    {
      number: 38,
      completedAt: "2026-11-18T22:00:00.000Z",
      mentions: { chatgpt: [1, 2, 3, 4], claude: [1, 2], gemini: [], perplexity: [1, 2, 5] },
      directories: THREE_DIRECTORIES,
      directoryStart: ON_PERPLEXITY,
    },
    {
      number: 39,
      completedAt: "2026-11-20T02:00:00.000Z",
      mentions: { chatgpt: [1, 2, 3, 4], claude: [], gemini: [], perplexity: [1, 2, 5] },
      directories: THREE_DIRECTORIES,
      directoryStart: ON_PERPLEXITY,
    },
  ],
};

/**
 * Seeds and renders each spec before the file's tests (today's report, report_v2 off) and removes them after; the
 * getter returns a copy of that report's data.
 */
export function seededReportData<K extends string>(
  specs: Record<K, SeedSpec>,
): (key: K) => ReportDataV2 {
  const sql = postgres(getTestDatabaseUrl(), { max: 1 });
  const seeds: SeededReportBrand[] = [];
  const reports = new Map<K, RenderedReport>();

  beforeAll(async () => {
    process.env.DATABASE_URL = getTestDatabaseUrl();
    process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      for (const [key, spec] of Object.entries(specs) as Array<[K, SeedSpec]>) {
        const seed = await seedReportBrand(sql, spec);
        seeds.push(seed);
        reports.set(key, await renderSeededReport(sql, seed, "today", { pdf: false }));
      }
    } finally {
      info.mockRestore();
    }
  }, 600_000);

  afterAll(async () => {
    for (const seed of seeds) await seed.cleanup();
    await sql.end();
  });

  return (key) => {
    const report = reports.get(key);
    if (!report)
      throw new Error(`seededReportData: "${key}" isn't seeded (use it in a test or hook)`);
    return structuredClone(report.data);
  };
}

/**
 * One Share of Voice (7 Nov): a report's competitors section as lib/visibility/share-of-voice.ts counts it -- the
 * brand's verified mentions (the report's own headline count) against these competitors'.
 */
export function withCompetitors(
  data: ReportData,
  rows: Array<{ name: string; mentions: number }>,
): ReportData["competitors"] {
  const total = rows.reduce((sum, row) => sum + row.mentions, data.mentionedCount);
  const share = (n: number) => (total > 0 ? (n / total) * 100 : null);
  return {
    configured: true,
    state: total > 0 ? "measured" : "no_mentions",
    stateDetail: "",
    brandMentions: data.mentionedCount,
    brandSharePct: share(data.mentionedCount),
    totalMentions: total,
    smallSample: total > 0 && total < 5,
    rows: rows.map((row) => ({ ...row, sharePct: share(row.mentions) })),
    note: null,
  };
}
