/**
 * 14 Nov, part 3 (Sri's review of audit #48): the report PDF's page 4 ("Google AI Overviews and AI Mode") had two
 * lines on a mostly blank page and no section number (the others were 01-07). Now:
 * - it's numbered in order (03, after the engines), and the sections after it move up one;
 * - it shows what the audit page's block shows, in the same words (lib/audit/google-surfaces/summary.ts): each
 *   surface's line, the questions naming you (3 of 3), the directories Google cited, and each question's outcome;
 * - it starts the directories page and flows into that section, so it's never a page of its own;
 * - when Google answered nothing, the one line saying why, as on the audit page;
 * - a report without Google has no Google section and its old numbering.
 * The section's text is compared with tests/unit/reports/__golden__/pdf-google-section.txt (UPDATE_GOLDEN=1 writes
 * it; say why in the commit).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type GoogleQuestionResult,
  type GoogleSurfaceSummary,
  googleSurfaceBlock,
  summarizeGoogleSurface,
} from "@/lib/audit/google-surfaces/summary";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import type { ReportData } from "@/lib/reports/report-data";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

const GOLDEN = join(__dirname, "__golden__", "pdf-google-section.txt");

const PROMPTS = [
  "Handyman in Yennora, NSW — who do locals trust?",
  "Best handyman for small repairs in Yennora, NSW?",
  "Reliable handyman available on weekends in Yennora, NSW?",
  "Is Omega Services a good choice for a handyman in Yennora, NSW?",
  "What are the best alternatives to Omega Services in Yennora, NSW?",
  "Is Omega Services popular in Yennora, NSW?",
];

function result(i: number, over: Partial<GoogleQuestionResult>): GoogleQuestionResult {
  return {
    promptIndex: i,
    prompt: PROMPTS[i],
    isBranded: i >= 3,
    outcome: "shown",
    reason: null,
    mentioned: false,
    verified: false,
    links: 3,
    googleLinks: 0,
    ...over,
  };
}

function checkedSummary(): GoogleSurfaceSummary {
  const overviews = [
    result(0, { outcome: "shown" }),
    result(1, { outcome: "not_shown", links: 0 }),
    result(2, { outcome: "shown", mentioned: true, verified: true }),
    result(3, { mentioned: true, verified: true }),
    result(4, { mentioned: true, verified: true }),
    result(5, { mentioned: true, verified: true, googleLinks: 2 }),
  ];
  const mode = PROMPTS.map((_, i) =>
    i === 1
      ? result(i, { outcome: "not_shown", links: 0 })
      : result(i, { mentioned: i >= 3, verified: i >= 3 }),
  );
  return {
    status: "complete",
    statusReason: null,
    location: { code: 9071744, label: "2161 NSW", kind: "postcode", precise: true, note: null },
    device: "desktop",
    labelLine: "2161 NSW · desktop · 14 Nov 2026",
    locationNote: null,
    countInHeadline: false,
    provider: "dataforseo",
    ranAt: "2026-11-14T00:00:00.000Z",
    rows: [
      summarizeGoogleSurface({
        surface: "google_ai_overviews",
        results: overviews,
        directories: ["hipages", "Localsearch"],
        status: "complete",
      }),
      summarizeGoogleSurface({
        surface: "google_ai_mode",
        results: mode,
        directories: ["Yellow Pages"],
        status: "complete",
      }),
    ],
  };
}

function withGoogle(summary: GoogleSurfaceSummary | null): ReportData {
  const data = reportDataFixture("39");
  if (summary) data.google = googleSurfaceBlock(summary);
  else delete data.google;
  return data;
}

const pages = (data: ReportData) => collectPdfPages(<ReportDocument data={data} />);

/** The lines from "NN · Google Search AI" up to the next section's eyebrow. */
function googleSectionText(data: ReportData): string[] {
  const page = pages(data).find((p) => p.some((line) => / · Google Search AI$/.test(line))) ?? [];
  const start = page.findIndex((line) => / · Google Search AI$/.test(line));
  const end = page.findIndex((line, i) => i > start && / · Where AI looks$/.test(line));
  return start < 0 ? [] : page.slice(start, end < 0 ? undefined : end);
}

const eyebrows = (data: ReportData) =>
  pages(data)
    .flat()
    .filter((line) => /^\d\d · [A-Z]/.test(line))
    .filter((line, i, all) => all.indexOf(line) === i);

describe("the report PDF's Google section", () => {
  it("matches the golden: each surface, the questions naming you, the directories, each question", () => {
    const text = `${googleSectionText(withGoogle(checkedSummary())).join("\n")}\n`;
    if (process.env.UPDATE_GOLDEN === "1") {
      mkdirSync(dirname(GOLDEN), { recursive: true });
      writeFileSync(GOLDEN, text);
    }
    expect(existsSync(GOLDEN), "golden missing: run once with UPDATE_GOLDEN=1").toBe(true);
    expect(text).toBe(readFileSync(GOLDEN, "utf8"));
    expect(text).toContain("questions naming you: mentioned in 3 of 3");
    expect(text).toContain("Directories cited: Localsearch, hipages");
    expect(text).toContain("Shown · mentioned");
    expect(text).toContain("No answer");
  }, 30_000);

  it("numbered in order, the sections after it moved up one", () => {
    expect(eyebrows(withGoogle(checkedSummary())).slice(0, 4)).toEqual([
      "01 · Executive summary",
      "02 · Engine by engine",
      "03 · Google Search AI",
      "04 · Where AI looks",
    ]);
  }, 30_000);

  it("never a page of its own: it starts the directories page and flows into it", () => {
    const page = pages(withGoogle(checkedSummary())).find((p) =>
      p.includes("03 · Google Search AI"),
    );
    expect(page).toContain("04 · Where AI looks");
  }, 30_000);

  it("when Google answered nothing: the one line saying why, and no table", () => {
    const summary: GoogleSurfaceSummary = {
      ...checkedSummary(),
      statusReason: "Google was skipped: today's spend limit was reached",
      rows: checkedSummary().rows.map((r) =>
        summarizeGoogleSurface({
          surface: r.surface,
          results: r.results.map((x) => ({ ...x, outcome: "skipped", links: 0 })),
          directories: [],
          status: "complete",
        }),
      ),
    };
    const text = googleSectionText(withGoogle(summary));
    expect(text).toContain(
      "Google couldn't be checked for this audit: Google was skipped: today's spend limit was reached",
    );
    expect(text.join("\n")).not.toMatch(/Shown|No answer|Question/);
  }, 30_000);

  it("a report without Google: no Google section, the old numbering", () => {
    const data = withGoogle(null);
    expect(googleSectionText(data)).toEqual([]);
    expect(eyebrows(data).slice(0, 3)).toEqual([
      "01 · Executive summary",
      "02 · Engine by engine",
      "03 · Where AI looks",
    ]);
  }, 30_000);
});
