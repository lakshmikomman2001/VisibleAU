/**
 * 13 Nov, part 3 (Sri's live check): "Claude and Gemini didn't name you in any of 20 answers" gave the reason
 * "Your site didn't appear in Claude's search results in any of 10 answers" -- Gemini missing. A recommendation's
 * reason (its subtitle, lib/reports/report-findings.ts) must cover everything its title names. The templates that
 * name several things in a title, each tested here:
 * - silent engines ("Claude and Gemini didn't name you…"): every engine, measured or said to have no measured
 *   reason (only Claude's stored answers keep their search results);
 * - directories ("Link your hipages, Word of Mouth and Localsearch profiles", "Complete your …"): each by name
 *   with its own count, and what to do for the ones with no suggested page;
 * - unmeasured engines ("Re-run with all four engines"): each engine that wasn't measured.
 * And one property over all of them: every engine or directory named in a title is named in its reason.
 */
import { describe, expect, it } from "vitest";
import { namedCitedInAnswersList } from "@/lib/directories/cited-in-answers";
import type { ReportEngineRow } from "@/lib/reports/report-data";
import { type Finding, reportFindings } from "@/lib/reports/report-findings";
import { reportDataFixture } from "../../helpers/report-data-fixture";

const row = (
  engine: string,
  name: string,
  mentionedCount: number,
  extra: Partial<ReportEngineRow> = {},
): ReportEngineRow => ({
  engine,
  name,
  sampleCount: 10,
  mentionedCount,
  failedEverydayCount: 0,
  failedCount: 0,
  fullyFailed: false,
  failureReason: null,
  models: [],
  ...extra,
});

const findingFor = (rule: Finding["rule"], engines: ReportEngineRow[]) =>
  reportFindings({ ...reportDataFixture("39"), engines }).find((f) => f.rule === rule);

describe("silent engines: the reason covers every engine in the title", () => {
  it("Sri's case: Claude's measured reason, and Gemini's lack of one, both said", () => {
    const action = findingFor("b", [
      row("chatgpt", "ChatGPT", 4),
      row("claude", "Claude", 0, { searchResults: { answers: 10, withYourSite: 0 } }),
      row("gemini", "Gemini", 0),
    ])?.recommendation;
    expect(action).toEqual({
      title: "Claude and Gemini didn't name you in any of 20 answers",
      detail:
        "Your site didn't appear in Claude's search results in any of 10 answers. Only the pages Gemini cited are stored, not the search results it read, so there's no measured reason for its 10 answers.",
    });
  });

  it("three engines, Claude's site seen in 3 of 10: each engine is in the reason", () => {
    const action = findingFor("b", [
      row("perplexity", "Perplexity", 2),
      row("chatgpt", "ChatGPT", 0),
      row("claude", "Claude", 0, { searchResults: { answers: 10, withYourSite: 3 } }),
      row("gemini", "Gemini", 0),
    ])?.recommendation;
    expect(action?.title).toBe("ChatGPT, Claude and Gemini didn't name you in any of 30 answers");
    expect(action?.detail).toBe(
      "Your site was in Claude's search results in 3 of 10 answers, and Claude still didn't name you. Only the pages ChatGPT and Gemini cited are stored, not the search results they read, so there's no measured reason for their 20 answers.",
    );
  });

  it("no engine with a measured reason: no reason at all (unchanged), never a partial one", () => {
    const action = findingFor("b", [
      row("chatgpt", "ChatGPT", 4),
      row("claude", "Claude", 0),
      row("gemini", "Gemini", 0),
    ])?.recommendation;
    expect(action).toEqual({ title: "Claude and Gemini didn't name you in any of 20 answers" });
  });

  it("Claude alone: its reason, as before", () => {
    const action = findingFor("b", [
      row("chatgpt", "ChatGPT", 4),
      row("claude", "Claude", 0, { searchResults: { answers: 10, withYourSite: 0 } }),
    ])?.recommendation;
    expect(action).toEqual({
      title: "Claude didn't name you in any of 10 answers",
      detail: "Your site didn't appear in Claude's search results in any of 10 answers.",
    });
  });
});

describe("directories: each named with its own count", () => {
  it("the formatter: one, two, three", () => {
    expect(namedCitedInAnswersList([{ name: "hipages", citedCount: 8 }], 40)).toBe(
      "hipages is cited in 8 of 40 answers",
    );
    expect(
      namedCitedInAnswersList(
        [
          { name: "hipages", citedCount: 8 },
          { name: "Word of Mouth", citedCount: 6 },
        ],
        40,
      ),
    ).toBe("hipages is cited in 8 and Word of Mouth in 6 of 40 answers");
    expect(
      namedCitedInAnswersList(
        [
          { name: "hipages", citedCount: 8 },
          { name: "Word of Mouth", citedCount: 6 },
          { name: "Localsearch", citedCount: 5 },
        ],
        40,
      ),
    ).toBe("hipages is cited in 8, Word of Mouth in 6 and Localsearch in 5 of 40 answers");
  });

  it("Link: one suggested page, and the other two still named with what to do", () => {
    const data = reportDataFixture("39");
    data.directories.rows = data.directories.rows.map((r, i) =>
      i === 0
        ? { ...r, suggestedProfileUrl: "https://www.hipages.com.au/connect/omegaservices" }
        : r,
    );
    const n = data.directories.totalAnswers;
    const action = reportFindings(data).find((f) => f.rule === "a")?.recommendation;
    expect(action?.title).toBe("Link your hipages, Word of Mouth and Localsearch profiles");
    expect(action?.detail).toBe(
      `hipages is cited in 8, Word of Mouth in 6 and Localsearch in 5 of ${n} answers. AI cited what looks like yours: hipages.com.au/connect/omegaservices looks like your hipages profile. Link it under Directories AI cited, so we can match it with what AI cites. Add your Word of Mouth and Localsearch profile links in brand settings.`,
    );
  });

  it("Complete: each directory by name", () => {
    const data = reportDataFixture("39");
    // Linked, and none of the linked profiles cited: complete them.
    data.directories.rows = data.directories.rows.map((r) => ({
      ...r,
      ownerProfileLinked: true,
      ownerProfileCitedCount: 0,
    }));
    const n = data.directories.totalAnswers;
    const action = reportFindings(data).find((f) => f.rule === "a")?.recommendation;
    expect(action).toEqual({
      title: "Complete your hipages, Word of Mouth and Localsearch profiles",
      detail: `hipages is cited in 8, Word of Mouth in 6 and Localsearch in 5 of ${n} answers; none linked you.`,
    });
  });
});

describe("unmeasured engines: Re-run names each one", () => {
  it("'Re-run with all four engines': Gemini and ChatGPT weren't measured", () => {
    const action = findingFor("c", [
      row("chatgpt", "ChatGPT", 0, { sampleCount: 0, fullyFailed: true, failedCount: 10 }),
      row("claude", "Claude", 3),
      row("gemini", "Gemini", 0, { sampleCount: 0, fullyFailed: true, failedCount: 10 }),
      row("perplexity", "Perplexity", 2),
    ])?.recommendation;
    expect(action?.title).toMatch(/^Re-run with all \w+ engines$/);
    expect(action?.detail).toContain("ChatGPT");
    expect(action?.detail).toContain("Gemini");
  });
});

describe("the property: whatever a title names, its reason names", () => {
  const ENGINES = ["ChatGPT", "Claude", "Gemini", "Perplexity"];
  const DIRECTORIES = reportDataFixture("39").directories.rows.map((r) => r.name);
  const cases: Array<[string, ReportEngineRow[]]> = [
    [
      "two silent, Claude measured",
      [
        row("chatgpt", "ChatGPT", 4),
        row("claude", "Claude", 0, { searchResults: { answers: 9, withYourSite: 0 } }),
        row("gemini", "Gemini", 0),
      ],
    ],
    [
      "three silent, Claude measured",
      [
        row("perplexity", "Perplexity", 1),
        row("chatgpt", "ChatGPT", 0),
        row("claude", "Claude", 0, { searchResults: { answers: 10, withYourSite: 2 } }),
        row("gemini", "Gemini", 0),
      ],
    ],
    [
      "two failed",
      [
        row("chatgpt", "ChatGPT", 0, { sampleCount: 0, fullyFailed: true, failedCount: 10 }),
        row("claude", "Claude", 3),
        row("gemini", "Gemini", 0, { sampleCount: 0, fullyFailed: true, failedCount: 10 }),
      ],
    ],
  ];
  it.each(cases)("%s", (_label, engines) => {
    const findings = reportFindings({ ...reportDataFixture("39"), engines });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      const { title, detail } = f.recommendation;
      if (detail === undefined) continue;
      for (const name of [...ENGINES, ...DIRECTORIES]) {
        if (new RegExp(`\\b${name}\\b`).test(title)) {
          expect(detail, `${f.rule}: "${title}"`).toMatch(new RegExp(`\\b${name}\\b`));
        }
      }
    }
  });
});
