/**
 * 15 Nov (rebrand), part 2 -- Sri, Hero's audit #50: the PDF's "Visibility across recent audits" captioned #47
 * "used 3 of 4 engines … shown but not compared", yet drew a line from #47 to #48. The line broke only where the
 * everyday questions changed; a partial audit (or one with an earlier methodology, other models, model drift or
 * another Google basis) was still joined to its neighbours. An audit that isn't compared is never joined by a
 * line, on either side: two points are joined only when both are comparable with the basis audit.
 *
 * (The brand page's audit history draws bars, never a line, and the brand's Visibility page draws no audit trend;
 * the PDF -- and the PDF builder, which renders the same document -- is the only place audits are joined.)
 *
 * S03 part 0 (LLD amendment 77): moved from tests/unit/reports/trend-line-not-compared.test.tsx; the chart's report is
 * an invented business seeded as real audits and rendered by the real path (tests/helpers/seeded-report-data.ts), no
 * longer hand-composed report data.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import { trendSegments } from "@/lib/reports/pdf/report-document";
import type { ReportData, ReportTrendPoint } from "@/lib/reports/report-data";
import { IRONSTONE_ALL_ENGINES, seededReportData } from "@/tests/helpers/seeded-report-data";

const seeded = seededReportData({ allEngines: IRONSTONE_ALL_ENGINES });

type Props = { children?: ReactNode; [key: string]: unknown };

/** A trend point as report-data builds it: comparable unless one of the reasons says otherwise. */
function point(
  auditNumber: number,
  value: number,
  over: Partial<ReportTrendPoint> = {},
): ReportTrendPoint {
  const base: ReportTrendPoint = {
    auditId: `audit-${auditNumber}`,
    auditNumber,
    completedAt: `2026-11-${String(auditNumber - 35).padStart(2, "0")}T00:00:00.000Z`,
    value,
    ci: { lower: Math.max(0, value - 10), upper: Math.min(100, value + 10) },
    mentionedCount: Math.round(value / 10),
    sampleCount: 10,
    enginesPlanned: 4,
    enginesAnswered: 4,
    partial: false,
    earlierMethodology: false,
    methodologyChange: null,
    otherModels: null,
    modelDrift: null,
    failedEngines: [],
    otherQuestions: false,
    questionsChange: null,
    comparable: true,
    isBasis: auditNumber === 50,
    inPeriod: true,
  };
  return { ...base, ...over };
}

/** #47's shape: Claude failed, so 3 of 4 engines answered -- shown, hollow, never compared. */
const PARTIAL_47: Partial<ReportTrendPoint> = {
  partial: true,
  enginesAnswered: 3,
  failedEngines: [{ name: "Claude", reason: "Claude's account ran out of credit" }],
  comparable: false,
};

const numbers = (segments: Array<Array<{ p: ReportTrendPoint }>>) =>
  segments.map((s) => s.map(({ p }) => p.auditNumber));

describe("trendSegments: a line joins two points only when both are compared", () => {
  it("#47 (3 of 4 engines) stands alone: #45 and #48 aren't joined to it, and the compared runs either side keep their lines", () => {
    const pts = [
      point(44, 20),
      point(45, 22),
      point(47, 18, PARTIAL_47),
      point(48, 25),
      point(50, 30),
    ];
    expect(numbers(trendSegments(pts.map((p) => ({ p }))))).toEqual([[44, 45], [47], [48, 50]]);
  });

  it("Hero's #50 report: #47 partial, #48 other questions, #50 the basis -- no line at all", () => {
    const pts = [
      point(47, 18, PARTIAL_47),
      point(48, 25, { otherQuestions: true, comparable: false }),
      point(50, 33, {
        questionsChange:
          "Questions changed between #48 and #50 (one question removed), so these aren't compared.",
      }),
    ];
    expect(numbers(trendSegments(pts.map((p) => ({ p }))))).toEqual([[47], [48], [50]]);
  });

  it("every reason an audit isn't compared breaks the line on both sides", () => {
    const reasons: Array<[string, Partial<ReportTrendPoint>]> = [
      ["partial", PARTIAL_47],
      ["earlier methodology", { earlierMethodology: true, comparable: false }],
      ["other models", { otherModels: "Claude Haiku 4.5, not Sonnet 4.6", comparable: false }],
      [
        "model drift",
        {
          modelDrift: "Perplexity answered with sonar instead of sonar-pro (12 of 13 answers)",
          comparable: false,
        },
      ],
      ["other questions", { otherQuestions: true, comparable: false }],
      // Another Google basis: drawn solid, but still not compared.
      ["Google counted in one and not the other", { comparable: false }],
    ];
    for (const [why, over] of reasons) {
      const pts = [point(45, 20), point(46, 21), point(47, 18, over), point(48, 24), point(50, 30)];
      expect(numbers(trendSegments(pts.map((p) => ({ p })))), why).toEqual([
        [45, 46],
        [47],
        [48, 50],
      ]);
    }
  });

  it("two not-compared audits side by side aren't joined to each other either", () => {
    const pts = [point(46, 10, PARTIAL_47), point(47, 18, PARTIAL_47), point(50, 30)];
    expect(numbers(trendSegments(pts.map((p) => ({ p }))))).toEqual([[46], [47], [50]]);
  });

  it("a change of questions still breaks a run of compared audits", () => {
    const pts = [
      point(48, 25),
      point(50, 30, { questionsChange: "Questions changed between #48 and #50." }),
    ];
    expect(numbers(trendSegments(pts.map((p) => ({ p }))))).toEqual([[48], [50]]);
  });
});

/** Every POLYLINE's points and every CIRCLE's centre the document draws (function components expanded). */
function drawn(root: ReactNode) {
  const lines: string[][] = [];
  const circles: Array<{ cx: number; cy: number }> = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const c of n) visit(c);
      return;
    }
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Props>;
    if (typeof el.type === "function") {
      visit((el.type as (p: Props) => ReactNode)(el.props));
      return;
    }
    if (el.type === "POLYLINE") lines.push(String(el.props.points).split(" "));
    if (el.type === "CIRCLE") circles.push({ cx: Number(el.props.cx), cy: Number(el.props.cy) });
    if (typeof el.props.render === "function") return;
    visit(el.props.children);
  };
  visit(root);
  return { lines, circles };
}

describe("the PDF's trend chart (Hero's #50 shape)", () => {
  function report(points: ReportTrendPoint[]): ReportData {
    const data = seeded("allEngines");
    return { ...data, trend: { ...data.trend, points, comparableCount: 4 } };
  }

  it("draws no line through #47: its point is on the chart, with nothing joined to it", () => {
    const pts = [
      point(44, 20),
      point(45, 22),
      point(47, 18, PARTIAL_47),
      point(48, 25),
      point(50, 30),
    ];
    const { lines, circles } = drawn(<ReportDocument data={report(pts)} />);
    // The chart's five points, in order (the other circles on the page aren't the chart's).
    const W = 632 / pts.length;
    const xOf = (i: number) => 40 + W * (i + 0.5);
    const chart = pts.map((_, i) => circles.find((c) => c.cx === xOf(i)));
    expect(chart.every(Boolean)).toBe(true);
    const at = (i: number) => `${chart[i]?.cx},${chart[i]?.cy}`;
    const trendLines = lines.filter((l) => pts.some((_, i) => l.includes(at(i))));
    // Two lines: #44-#45 and #48-#50. None touches #47.
    expect(trendLines).toEqual([
      [at(0), at(1)],
      [at(3), at(4)],
    ]);
    expect(trendLines.flat()).not.toContain(at(2));
  });
});
