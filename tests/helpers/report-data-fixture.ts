/**
 * ReportData shaped like production's Audit #37 (Claude failed, 5 of 30)
 * and #39 (every engine, 7 of 40), with no database: for unit tests of the
 * report's sentences, findings and pages. Counts match tests/helpers/
 * report-fixture.ts; the CI comes from the same wilsonCI the resolver uses.
 */
import type { ReportData, ReportEngineRow, ReportMatrixRow } from "@/lib/reports/report-data";
import { ALL_REPORT_SECTIONS } from "@/lib/reports/report-sections";
import { wilsonCI } from "@/lib/scoring/wilson";
import { EVERYDAY_QUESTIONS } from "@/tests/helpers/report-fixture";

const ENGINE_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};
const MODELS: Record<string, string> = {
  chatgpt: "gpt-4o-search-preview",
  claude: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar",
};
const SPEND_LIMIT = "Provider spend limit reached (a monthly limit set in the provider's console)";

function engines(
  mentions: Record<string, number[]>,
  failed: string[],
): { rows: ReportEngineRow[]; matrix: ReportMatrixRow[] } {
  const ids = ["chatgpt", "claude", "gemini", "perplexity"];
  const rows = ids.map((engine) => {
    const isFailed = failed.includes(engine);
    return {
      engine,
      name: ENGINE_NAMES[engine],
      sampleCount: isFailed ? 0 : 10,
      mentionedCount: isFailed ? 0 : (mentions[engine] ?? []).length,
      failedEverydayCount: isFailed ? 10 : 0,
      failedCount: isFailed ? 13 : 0,
      fullyFailed: isFailed,
      failureReason: isFailed ? SPEND_LIMIT : null,
      models: isFailed ? [] : [MODELS[engine]],
    };
  });
  const matrix = EVERYDAY_QUESTIONS.map((question, i) => ({
    index: i + 1,
    question,
    cells: Object.fromEntries(
      ids.map((engine) => [
        engine,
        failed.includes(engine)
          ? ("error" as const)
          : (mentions[engine] ?? []).includes(i + 1)
            ? ("mentioned" as const)
            : ("not_mentioned" as const),
      ]),
    ),
  }));
  return { rows, matrix };
}

const W44_DIRECTORY_ROWS = [
  { key: "hipages", name: "hipages", citedCount: 9 },
  { key: "word_of_mouth", name: "Word of Mouth", citedCount: 8 },
  { key: "localsearch", name: "Localsearch", citedCount: 7 },
  { key: "airtasker", name: "Airtasker", citedCount: 5 },
  { key: "yellow_pages_au", name: "Yellow Pages", citedCount: 5 },
  { key: "product_review", name: "ProductReview", citedCount: 1 },
  { key: "true_local", name: "True Local", citedCount: 1 },
];

const TREND = [
  {
    auditId: "a37",
    auditNumber: 37,
    completedAt: "2026-10-30T23:00:00.000Z",
    k: 5,
    n: 30,
    partial: true,
  },
  {
    auditId: "a38",
    auditNumber: 38,
    completedAt: "2026-10-31T22:00:00.000Z",
    k: 9,
    n: 40,
    partial: false,
  },
  {
    auditId: "a39",
    auditNumber: 39,
    completedAt: "2026-11-01T07:30:00.000Z",
    k: 7,
    n: 40,
    partial: false,
  },
];

/** "37" -> a report based on #37; "39" -> on #39. */
export function reportDataFixture(basis: "37" | "39"): ReportData {
  const is37 = basis === "37";
  const k = is37 ? 5 : 7;
  const n = is37 ? 30 : 40;
  const { rows, matrix } = is37
    ? engines({ chatgpt: [1, 4], gemini: [], perplexity: [1, 3, 6] }, ["claude"])
    : engines({ chatgpt: [1, 2, 3, 4], claude: [], gemini: [], perplexity: [1, 2, 5] }, []);
  const point = TREND.find((p) => p.auditNumber === Number(basis));
  return {
    organizationId: "org-fixture",
    generatedAt: "2026-11-01T07:59:00.000Z",
    brand: {
      id: "brand-fixture",
      name: "Omega Services",
      domain: "omegaservices.example.com.au",
      locality: "Castle Hill",
      state: "NSW",
      vertical: "General trades",
    },
    agency: { name: "Splice Marketing", logoUrl: null, contactLine: null, footerText: null },
    period: { type: "weekly", label: "2026-W44" },
    basis: {
      auditId: point?.auditId ?? "a39",
      auditNumber: Number(basis),
      completedAt: point?.completedAt ?? "2026-11-01T07:30:00.000Z",
      startedAt: is37 ? "2026-10-30T22:57:05.000Z" : "2026-11-01T07:27:05.000Z",
      reason: is37 ? "report_audit" : "latest_full_in_period",
      methodology: "web-grounded (v2)",
    },
    headline: { status: "scored", value: (k / n) * 100, ci: wilsonCI(k, n) },
    mentionedCount: k,
    sampleCount: n,
    rankedCount: k,
    medianPosition: 1,
    sourcedCount: k,
    coverage: is37
      ? {
          enginesPlanned: 4,
          enginesAnswered: 3,
          label: "3 of 4 engines",
          note: `Based on 3 of 4 engines. Claude returned an error for every question: ${SPEND_LIMIT}.`,
        }
      : { enginesPlanned: 4, enginesAnswered: 4, label: null, note: null },
    engines: rows,
    questions: { everyday: 10, branded: 3, perEngine: 13 },
    answers: is37
      ? { planned: 52, answered: 39, failed: 13 }
      : { planned: 52, answered: 52, failed: 0 },
    matrix,
    directories: {
      totalAnswers: n,
      rows: (is37
        ? W44_DIRECTORY_ROWS
        : [
            { key: "hipages", name: "hipages", citedCount: 8 },
            { key: "word_of_mouth", name: "Word of Mouth", citedCount: 6 },
            { key: "localsearch", name: "Localsearch", citedCount: 5 },
          ]
      ).map((r) => ({
        ...r,
        ownerProfileLinked: false,
        ownerProfileCitedCount: 0,
        ownerStatus: null,
      })),
    },
    competitors: { configured: false, rows: [] },
    trend: {
      points: TREND.map((p) => ({
        auditId: p.auditId,
        auditNumber: p.auditNumber,
        completedAt: p.completedAt,
        value: (p.k / p.n) * 100,
        ci: wilsonCI(p.k, p.n),
        mentionedCount: p.k,
        sampleCount: p.n,
        enginesPlanned: 4,
        enginesAnswered: p.partial ? 3 : 4,
        partial: p.partial,
        earlierMethodology: false,
        methodologyChange: null,
        failedEngines: p.partial ? [{ name: "Claude", reason: SPEND_LIMIT }] : [],
        comparable: !p.partial,
        isBasis: p.auditNumber === Number(basis),
        inPeriod: true,
      })),
      comparableCount: 2,
      minimum: 3,
      change: null,
      leftOut: 0,
    },
    residency: {
      accountData: "AWS ap-southeast-2 (Sydney)",
      reportStorage: "AWS ap-southeast-2 (Sydney)",
    },
    sections: { ...ALL_REPORT_SECTIONS },
  };
}
