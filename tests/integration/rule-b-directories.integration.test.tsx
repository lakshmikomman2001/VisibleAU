/**
 * S04 part 0g (LLD amendment 87, 8.1.5; amends 60): rule b -- an engine that never names the business -- on invented
 * brands seeded as real audits (tests/helpers/report-seeds.ts) and rendered through the real report path, every tier
 * and report_v2 off; live for everyone (N15 allows it). Shaped like the live audit #56: Claude names the business in
 * none of its 10 answers while the others do; Yellow Pages is both what Claude cited most and one of the directories
 * today's directory finding asks to link ("Link your Yellow Pages, hipages and Word of Mouth profiles").
 * - Rule b's action leaves out a directory the directory actions already name (#56 named Yellow Pages twice, both
 *   High), credits only the engines that cited the directories it lists, and its reason says why these directories:
 *   "Claude didn't name you in any of its 10 answers to everyday questions. These are the directories it cited most in
 *   them." -- {n} the per-engine panel's count (#56 printed "any of 9 answers": Claude's answers that kept their search
 *   results, lib/reports/search-results.ts).
 * - Two engines that never name it, only one of which cited the listed directory: only that one is credited.
 * - Nothing left once the named directories are out: the finding keeps its reason and has no action.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reportFindings, withAction } from "@/lib/reports/report-findings";
import {
  BLUEGUM,
  type SeededReportBrand,
  type SeedSpec,
  seedReportBrand,
} from "@/tests/helpers/report-seeds";
import {
  REPORT_VERSIONS,
  type RenderedReport,
  type ReportVersion,
  renderSeededReport,
} from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

/** Bluegum shaped like #56 on its basis audit: answers 10-19 are Claude's (engine order, ten each). */
function shapedLike56(name: string, over: { gemini?: number[]; localsearch?: number }): SeedSpec {
  return {
    ...BLUEGUM,
    brandName: name,
    linkedProfiles: undefined,
    audits: BLUEGUM.audits.map((a) =>
      a.number === 54
        ? {
            ...a,
            mentions: {
              chatgpt: [1, 4],
              claude: [],
              gemini: over.gemini ?? [2],
              perplexity: [1, 3, 6],
            },
            ownProfileCitations: {},
            directories: {
              // Claude's ten answers and Gemini's first two.
              "yellowpages.com.au": 12,
              "hipages.com.au": 6,
              "wordofmouth.com.au": 4,
              ...(over.localsearch ? { "localsearch.com.au": over.localsearch } : {}),
            },
            directoryStart: {
              "yellowpages.com.au": 10,
              "hipages.com.au": 0,
              "wordofmouth.com.au": 30,
              // One of Claude's answers.
              "localsearch.com.au": 15,
            },
          }
        : a,
    ),
  };
}

const ONE_SILENT = shapedLike56("Bluegum Home Services", { localsearch: 1 });
const TWO_SILENT = shapedLike56("Bluegum Home Services", { gemini: [], localsearch: 1 });
const NONE_LEFT = shapedLike56("Bluegum Home Services", {});

const LOCALSEARCH_ACTION =
  "Make sure your profile on Localsearch, the directory Claude cites most, is complete and linked in brand settings";
// S04B part 5 (LLD amendment 106): the action names one directory (Localsearch), so its reason says "This is the
// directory it cited most in them." (it said "These are the directories ...").
const CLAUDE_REASON =
  "Claude didn't name you in any of its 10 answers to everyday questions. This is the directory it cited most in them.";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const seeds: Record<"one" | "two" | "none", SeededReportBrand | null> = {
  one: null,
  two: null,
  none: null,
};
const reports = new Map<string, Record<ReportVersion, RenderedReport>>();

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const [key, spec] of [
    ["one", ONE_SILENT],
    ["two", TWO_SILENT],
    ["none", NONE_LEFT],
  ] as const) {
    const seed = await seedReportBrand(sql, spec);
    seeds[key] = seed;
    const byVersion: Partial<Record<ReportVersion, RenderedReport>> = {};
    for (const v of REPORT_VERSIONS) byVersion[v] = await renderSeededReport(sql, seed, v);
    reports.set(key, byVersion as Record<ReportVersion, RenderedReport>);
  }
}, 600_000);

afterAll(async () => {
  for (const seed of Object.values(seeds)) await seed?.cleanup();
  await sql.end();
});

const report = (key: keyof typeof seeds, v: ReportVersion) => {
  const r = reports.get(key)?.[v];
  if (!r) throw new Error(`${key} ${v} wasn't rendered`);
  return r;
};
const ruleOf = (r: RenderedReport, rule: string) =>
  reportFindings(r.data).find((f) => f.rule === rule);

describe.each(
  REPORT_VERSIONS.map((v) => [v === "today" ? "report_v2 off" : v, v] as const),
)("shaped like #56, %s", (_name, v) => {
  it("the panel says Claude 0 of 10; today's directory finding names Yellow Pages, hipages and Word of Mouth", () => {
    const r = report("one", v);
    const claude = r.data.engines.find((e) => e.engine === "claude");
    expect(claude).toMatchObject({ mentionedCount: 0, sampleCount: 10 });
    const a = ruleOf(r, "a");
    expect(a?.recommendation.title).toBe(
      "Link your Yellow Pages, hipages and Word of Mouth profiles",
    );
  });

  it("rule b's action leaves Yellow Pages out and its reason says why these directories", () => {
    const r = report("one", v);
    const b = ruleOf(r, "b");
    expect(b?.title).toBe("Claude doesn't mention you");
    expect(b?.fix).toBe(LOCALSEARCH_ACTION);
    expect(b?.recommendation).toEqual({ title: LOCALSEARCH_ACTION, detail: CLAUDE_REASON });
    expect(b?.noAction).toBeUndefined();
    // Yellow Pages is in one action only (rule a's), not twice as #56 printed it.
    const actions = withAction(reportFindings(r.data)).map((f) => f.fix);
    expect(actions.filter((fix) => fix.includes("Yellow Pages"))).toHaveLength(1);
    // What Claude cited most stays in the evidence, measured.
    expect(r.text).toContain("Claude cited most → ");
    expect(r.text).toContain("Yellow Pages (10), Localsearch (1)");
    expect(r.text).not.toContain("Yellow Pages, the director");
  });

  it("two engines never name it, only Claude cited the listed directory: only Claude is credited", () => {
    const r = report("two", v);
    const b = ruleOf(r, "b");
    expect(b?.title).toBe("Claude and Gemini don't mention you");
    expect(b?.fix).toBe(LOCALSEARCH_ACTION);
    expect(b?.recommendation.detail).toBe(CLAUDE_REASON);
    expect(b?.fix).not.toContain("Claude and Gemini cite");
  });

  it("nothing left once the named directories are out: the reason stays, the action goes", () => {
    const r = report("none", v);
    const b = ruleOf(r, "b");
    expect(b?.title).toBe("Claude doesn't mention you");
    expect(b?.noAction).toBe(true);
    expect(b?.fix).toBe("");
    expect(b?.recommendation.detail).toBe(CLAUDE_REASON);
    expect(withAction(reportFindings(r.data)).some((f) => f.rule === "b")).toBe(false);
    expect(r.text).not.toContain("the directory Claude cites most");
    expect(r.text).not.toContain("the directories Claude cites most");
  });
});
