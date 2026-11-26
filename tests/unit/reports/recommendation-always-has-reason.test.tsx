/**
 * 15 Nov, part 1 (Sri, audit #50, Wren Home Services): on the audit page the High card "Gemini didn't name you in
 * any of 10 answers" showed a title and nothing under it, and the PDF's "Recommended next" item 2 the same. The
 * silent-engine template (lib/reports/report-findings.ts, cb75ccf/dc7010c) gave no reason when no silent engine
 * kept its search results -- only Claude's stored answers do -- so Gemini alone, or Gemini and ChatGPT, had none.
 *
 * The guard: every template, in its single- and multi-engine (or one- and several-directory) cases, gives a
 * recommendation whose reason is a sentence of its own, and the PDF prints it under the title. (The audit page
 * prints the same list: tests/integration/audit-actions-evidence.integration.test.tsx renders it.)
 */
import { describe, expect, it } from "vitest";
import { ReportDocument } from "@/lib/reports/pdf/report-document";
import type { ReportData, ReportEngineRow } from "@/lib/reports/report-data";
import {
  type Finding,
  type FindingRule,
  reportFindings,
  withAction,
} from "@/lib/reports/report-findings";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import { reportDataFixture, withCompetitors } from "@/tests/helpers/report-data-fixture";

const NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

/** An answered engine named in `mentioned` of 10 answers; `seen` = Claude's stored search results. */
const answered = (engine: string, mentioned: number, seen?: number): ReportEngineRow => ({
  engine,
  name: NAMES[engine],
  sampleCount: 10,
  mentionedCount: mentioned,
  failedEverydayCount: 0,
  failedCount: 0,
  fullyFailed: false,
  failureReason: null,
  models: [],
  ...(seen === undefined ? {} : { searchResults: { answers: 10, withYourSite: seen } }),
});

const failed = (engine: string): ReportEngineRow => ({
  ...answered(engine, 0),
  sampleCount: 0,
  failedEverydayCount: 10,
  failedCount: 13,
  fullyFailed: true,
  failureReason: "Provider spend limit reached",
});

function withEngines(engines: ReportEngineRow[]): ReportData {
  return { ...reportDataFixture("39"), engines };
}

/** [label, data, the rule it must produce] -- every template, one thing and several things in its title. */
const CASES: Array<[string, ReportData, FindingRule]> = [
  // b: silent engines -- unmeasured (Gemini, ChatGPT), measured (Claude), and mixed; one and several.
  [
    "b: Gemini alone, no search results (Sri's #50)",
    withEngines([answered("chatgpt", 4), answered("claude", 3), answered("gemini", 0)]),
    "b",
  ],
  [
    "b: Gemini and ChatGPT, neither with search results",
    withEngines([answered("chatgpt", 0), answered("claude", 3), answered("gemini", 0)]),
    "b",
  ],
  [
    "b: Claude alone, measured",
    withEngines([answered("chatgpt", 4), answered("claude", 0, 0), answered("gemini", 2)]),
    "b",
  ],
  [
    "b: Claude and Gemini, Claude measured",
    withEngines([answered("chatgpt", 4), answered("claude", 0, 3), answered("gemini", 0)]),
    "b",
  ],
  [
    "b: three silent, one other engine",
    withEngines([
      answered("chatgpt", 0),
      answered("claude", 0),
      answered("gemini", 0),
      answered("perplexity", 2),
    ]),
    "b",
  ],
  // c: engines that couldn't be measured.
  [
    "c: one failed engine",
    withEngines([answered("chatgpt", 4), failed("claude"), answered("gemini", 2)]),
    "c",
  ],
  [
    "c: two failed engines",
    withEngines([failed("chatgpt"), answered("claude", 3), failed("gemini")]),
    "c",
  ],
  // a: directories -- not linked (none / some suggested), and linked but not cited.
  ["a: three directories, none linked", reportDataFixture("39"), "a"],
  [
    "a: one directory, a suggested page",
    (() => {
      const d = reportDataFixture("39");
      d.directories.rows = d.directories.rows.slice(0, 1).map((r) => ({
        ...r,
        suggestedProfileUrl: "https://www.hipages.com.au/connect/yabbyservices",
      }));
      return d;
    })(),
    "a",
  ],
  [
    "a: linked and not cited (Complete)",
    (() => {
      const d = reportDataFixture("39");
      d.directories.rows = d.directories.rows.map((r) => ({
        ...r,
        ownerProfileLinked: true,
        ownerProfileCitedCount: 0,
      }));
      return d;
    })(),
    "a",
  ],
  // e, f, d: one competitor, Reddit, the strength.
  [
    "e: a competitor named more often",
    (() => {
      const d = reportDataFixture("39");
      d.competitors = withCompetitors(d, [{ name: "Rival Co", mentions: 12 }]);
      return d;
    })(),
    "e",
  ],
  [
    "f: Reddit cited",
    (() => {
      const d = withEngines([answered("chatgpt", 4), answered("claude", 3)]);
      d.directories.rows = [];
      d.sources = { ...d.sources, reddit: 6 };
      return d;
    })(),
    "f",
  ],
  ["d: the strength", reportDataFixture("37"), "d"],
];

function expectReason(f: Finding, label: string): void {
  const { title, detail } = f.recommendation;
  expect(typeof detail, `${label} (${f.rule}): "${title}"`).toBe("string");
  expect(detail.trim().length, `${label} (${f.rule}): "${title}" has no reason`).toBeGreaterThan(0);
  expect(detail, `${label} (${f.rule}): the reason repeats the title`).not.toBe(title);
  expect(detail, `${label} (${f.rule}): a sentence`).toMatch(/[.]$/);
}

describe("every recommendation has a reason", () => {
  it.each(CASES)("%s", (label, data, rule) => {
    const findings = reportFindings(data);
    expect(
      findings.map((f) => f.rule),
      label,
    ).toContain(rule);
    for (const f of findings) expectReason(f, label);
  });

  // S01C part 2b, LLD amendment 60: "If the engine cited no directory: no action, and Recommended next leaves the
  // item out." These hand-made rows carry no per-engine citations, so their silent engines cited none.
  it.each(CASES)("the PDF prints it under the title: %s", (_label, data) => {
    const lines = collectPdfText(<ReportDocument data={data} />);
    for (const f of reportFindings(data).filter((x) => x.noAction)) {
      expect(lines, `"${f.recommendation.title}" left out`).not.toContain(f.recommendation.title);
    }
    for (const f of withAction(reportFindings(data))) {
      const at = lines.indexOf(f.recommendation.title);
      expect(at, `"${f.recommendation.title}" in Recommended next`).toBeGreaterThan(-1);
      expect(lines[at + 1]).toBe(f.recommendation.detail);
    }
  });
});

describe("Gemini alone (Sri's #50): what was measured, and what we can't see", () => {
  it("names the engines that did name you, most first, then says why there's no measured reason", () => {
    const rec = reportFindings(
      withEngines([
        answered("chatgpt", 3),
        answered("claude", 4),
        answered("gemini", 0),
        answered("perplexity", 2),
      ]),
    ).find((f) => f.rule === "b")?.recommendation;
    expect(rec).toEqual({
      title: "Gemini didn't name you in any of 10 answers",
      detail:
        "Claude named you in 4 of 10 answers to the same questions, ChatGPT in 3 of 10 and Perplexity in 2 of 10. We can see the pages Gemini cited, but not what it searched, so we can't say why.",
    });
  });

  it("two silent engines without search results: 'they'", () => {
    const rec = reportFindings(
      withEngines([answered("chatgpt", 0), answered("claude", 3), answered("gemini", 0)]),
    ).find((f) => f.rule === "b")?.recommendation;
    expect(rec).toEqual({
      title: "ChatGPT and Gemini didn't name you in any of 20 answers",
      detail:
        "Claude named you in 3 of 10 answers to the same questions. We can see the pages ChatGPT and Gemini cited, but not what they searched, so we can't say why.",
    });
  });
});
