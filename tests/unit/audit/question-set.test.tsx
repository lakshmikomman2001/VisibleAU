/**
 * 15 Nov, part 2 (Sri, Hero's #48 and #50): two audits that asked different everyday questions are never compared
 * (lib/audit/question-set.ts). The rule, the note's words, the movement label (portfolio and agency), and the report
 * PDF's chart: hollow, with no line across a change of questions, and the caption's note.
 */
import { describe, expect, it } from "vitest";
import {
  questionSetChange,
  questionSetChangeWords,
  questionsChangedNote,
  sameQuestionSet,
} from "@/lib/audit/question-set";
import { ReportDocument, trendSegments } from "@/lib/reports/pdf/report-document";
import type { ReportData } from "@/lib/reports/report-data";
import { trendLines, trendPointHollow } from "@/lib/reports/report-format";
import { latestMovement } from "@/lib/visibility/latest-movement";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

const NOTE =
  "Questions changed between #48 and #50 (one question removed), so these aren't compared.";

describe("the rule", () => {
  it("the stored question sets decide when both have one, whatever the pack versions say", () => {
    expect(
      sameQuestionSet(
        { questionSetHash: "v3", promptPackVersion: 1 },
        { questionSetHash: "v4", promptPackVersion: 1 },
      ),
    ).toBe(false);
    expect(
      sameQuestionSet(
        { questionSetHash: "v4", promptPackVersion: 1 },
        { questionSetHash: "v4", promptPackVersion: 2 },
      ),
    ).toBe(true);
  });

  it("without one, the pack versions decide (as before migration 0150)", () => {
    expect(
      sameQuestionSet(
        { questionSetHash: null, promptPackVersion: 1 },
        { questionSetHash: "v4", promptPackVersion: 1 },
      ),
    ).toBe(true);
    expect(
      sameQuestionSet(
        { questionSetHash: null, promptPackVersion: 1 },
        { questionSetHash: null, promptPackVersion: 2 },
      ),
    ).toBe(false);
    expect(
      sameQuestionSet(
        { questionSetHash: null, promptPackVersion: null },
        { questionSetHash: null, promptPackVersion: 1 },
      ),
    ).toBe(true);
  });
});

describe("what changed, in words", () => {
  const v3 = new Set(["a", "b", "c", "off-topic"]);
  const v4 = new Set(["a", "b", "c"]);

  it("Hero's #48 -> #50: one question removed", () => {
    expect(questionSetChange(v3, v4)).toEqual({ added: 0, removed: 1 });
    expect(questionsChangedNote(48, 50, questionSetChange(v3, v4))).toBe(NOTE);
  });

  it("added, removed, both, and nothing known", () => {
    expect(questionSetChangeWords({ added: 2, removed: 0 })).toBe("two questions added");
    expect(questionSetChangeWords({ added: 1, removed: 3 })).toBe(
      "one question added and three removed",
    );
    expect(questionSetChangeWords({ added: 0, removed: 12 })).toBe("12 questions removed");
    expect(questionsChangedNote(40, 41, null)).toBe(
      "Questions changed between #40 and #41, so these aren't compared.",
    );
  });
});

describe("portfolio and agency movement", () => {
  const audit = (id: string, questionSetHash: string) => ({
    id,
    engines: ["chatgpt"],
    promptsCount: 10,
    metadata: {},
    methodologyVersion: 4,
    questionSetHash,
    promptPackVersion: 1,
  });
  const models = new Map([
    ["48", { models: { chatgpt: ["gpt-4.1-mini"] }, drift: [] }],
    ["50", { models: { chatgpt: ["gpt-4.1-mini"] }, drift: [] }],
  ]);

  it("not comparable across a change of questions, and says why", () => {
    expect(
      latestMovement({
        latest: audit("50", "v4"),
        previous: audit("48", "v3"),
        latestScore: 32.5,
        previousScore: 25,
        models,
      }),
    ).toEqual({
      kind: "not_comparable",
      reason: "questions_changed",
      label: "Not comparable (questions changed)",
    });
  });

  it("the same questions: the movement", () => {
    expect(
      latestMovement({
        latest: audit("50", "v4"),
        previous: audit("48", "v4"),
        latestScore: 32.5,
        previousScore: 25,
        models,
      }),
    ).toEqual({ kind: "moved", previous: 25, latest: 32.5, delta: 7.5 });
  });
});

describe("the report PDF's chart", () => {
  /** #37 and #38 asked other questions than the basis #39; the note sits on #39. */
  function changedAt39(): ReportData {
    const data = reportDataFixture("39");
    data.trend.points = data.trend.points.map((p) => ({
      ...p,
      otherQuestions: p.auditNumber !== 39,
      comparable: p.auditNumber === 39,
      questionsChange:
        p.auditNumber === 39
          ? "Questions changed between #38 and #39 (one question removed), so these aren't compared."
          : null,
    }));
    return data;
  }

  it("a point with other questions is hollow", () => {
    const points = changedAt39().trend.points;
    expect(points.map(trendPointHollow)).toEqual([true, true, false]);
  });

  it("no line across the change, and none to an audit that isn't compared", () => {
    // 15 Nov (rebrand), part 2: #37 and #38 asked other questions, so neither is compared and neither is joined --
    // to #39 or to each other (this expected [37, 38] joined until then).
    const plotted = changedAt39().trend.points.map((p, i) => ({ p, i }));
    expect(trendSegments(plotted).map((s) => s.map(({ p }) => p.auditNumber))).toEqual([
      [37],
      [38],
      [39],
    ]);
    // The same questions throughout: #38 and #39 joined; #37 (3 of 4 engines) stands alone.
    const same = reportDataFixture("39").trend.points.map((p, i) => ({ p, i }));
    expect(trendSegments(same).map((s) => s.map(({ p }) => p.auditNumber))).toEqual([
      [37],
      [38, 39],
    ]);
  });

  it("the caption and the trend's lines say what changed", () => {
    const data = changedAt39();
    const note =
      "Questions changed between #38 and #39 (one question removed), so these aren't compared.";
    expect(collectPdfText(<ReportDocument data={data} />).join(" ")).toContain(note);
    expect(trendLines(data)).toContain(note);
  });
});
