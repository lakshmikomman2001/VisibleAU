/**
 * 14 Nov, part 4 (Sri's review of audit #48): page 6, finding 2's action line ("…helpfully rather than as an ad")
 * ran off the right edge. Its <Text> sat in a flexDirection "row" <View> next to the tick, with nothing letting it
 * narrow, so react-pdf laid it out at its full width. Every text block in the report wraps now: no long text
 * directly in a row can't narrow (tests/helpers/pdf-text.ts textThatCannotWrap), across the report's shapes:
 * both fixture audits, with Google, with competitors, and with long names and long advice.
 *
 * The renderer's own layout boxes aren't reachable from a test here (@react-pdf/layout is only a transitive
 * dependency), so this checks the cause -- a row child that can't shrink -- rather than measuring each line.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { googleSurfaceBlock, summarizeGoogleSurface } from "@/lib/audit/google-surfaces/summary";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import type { ReportData } from "@/lib/reports/report-data";
import { textThatCannotWrap } from "@/tests/helpers/pdf-text";
import { reportDataFixture, withCompetitors } from "@/tests/helpers/report-data-fixture";

function withGoogle(data: ReportData): ReportData {
  const results = [0, 1, 2].map((i) => ({
    promptIndex: i,
    prompt: `A long everyday question about handymen and small repairs in Yennora, NSW, number ${i + 1}?`,
    isBranded: i === 2,
    outcome: "shown" as const,
    reason: null,
    mentioned: i === 2,
    verified: i === 2,
    links: 2,
    googleLinks: 0,
  }));
  data.google = googleSurfaceBlock({
    status: "complete",
    statusReason: null,
    location: { code: 9071744, label: "2161 NSW", kind: "postcode", precise: true, note: null },
    device: "desktop",
    labelLine: "2161 NSW · desktop · 14 Nov 2026",
    locationNote: null,
    countInHeadline: false,
    provider: "dataforseo",
    ranAt: "2026-11-14T00:00:00.000Z",
    rows: (["google_ai_overviews", "google_ai_mode"] as const).map((surface) =>
      summarizeGoogleSurface({
        surface,
        results,
        directories: ["Localsearch"],
        status: "complete",
      }),
    ),
  });
  return data;
}

function withLongNames(data: ReportData): ReportData {
  data.brand.name = "Hero Home Services and Handyman Repairs of Western Sydney";
  data.directories.rows = data.directories.rows.map((r) => ({
    ...r,
    name: `${r.name} Australian Business Directory`,
  }));
  return data;
}

const SHAPES: Array<[string, () => ReportData]> = [
  ["audit #39", () => reportDataFixture("39")],
  ["audit #37", () => reportDataFixture("37")],
  ["with Google", () => withGoogle(reportDataFixture("39"))],
  [
    "with competitors",
    () => {
      const data = reportDataFixture("39");
      data.competitors = withCompetitors(data, [
        { name: "Rival Plumbing and Gas Fitting of Greater Sydney", mentions: 12 },
        { name: "Another Rival Co", mentions: 3 },
      ]);
      return data;
    },
  ],
  ["long names", () => withLongNames(withGoogle(reportDataFixture("39")))],
];

describe("every text block in the report PDF wraps", () => {
  it.each(SHAPES)(
    "%s: no long text in a row that can't narrow",
    (_name, make) => {
      const offenders = textThatCannotWrap(<ReportDocument data={make()} />);
      expect(offenders, JSON.stringify(offenders, null, 1)).toEqual([]);
    },
    30_000,
  );

  it("the check finds the shape that clipped finding 2's action (it isn't vacuous)", () => {
    // A row with a tick and a long text that can't narrow, as the finding's fix line was; then the same with flex.
    const fix =
      "Answer questions in the local Reddit threads where customers ask about your services, as your business, helpfully rather than as an ad";
    const row = (textStyle: Record<string, unknown>) =>
      createElement(
        "VIEW",
        { style: { flexDirection: "row" } },
        createElement("SVG", { width: 13 }),
        createElement("TEXT", { style: textStyle }, fix),
      );
    expect(textThatCannotWrap(row({ fontSize: 10 }))).toEqual([fix]);
    expect(textThatCannotWrap(row({ fontSize: 10, flex: 1 }))).toEqual([]);
    expect(
      textThatCannotWrap(createElement("VIEW", null, createElement("TEXT", null, fix))),
    ).toEqual([]);
  });
});
