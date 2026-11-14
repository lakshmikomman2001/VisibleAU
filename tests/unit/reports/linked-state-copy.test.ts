/**
 * 14 Nov, part 2 (Sri's review of audit #48): Hero Home Services had Localsearch linked -- the PDF's card said "2 of
 * 50 ... 8 of the directories aren't linked yet" -- while the summary (page 2) said "we can't yet see whether any of
 * those citations were Hero Home Services' own listings: the profile links haven't been added" and finding 1 (page
 * 6) "your profile links aren't added yet". Every such sentence now comes from every cited directory's linked state
 * (lib/directories/linked-state.ts), for none, some and all linked: in the summary (report-narrative.ts), the
 * finding (report-findings.ts, which the audit page shows too) and the card.
 */
import { describe, expect, it } from "vitest";
import { linkedStateSentence } from "@/lib/directories/linked-state";
import type { ReportData, ReportDirectoryRow } from "@/lib/reports/report-data";
import { reportFindings } from "@/lib/reports/report-findings";
import { reportNarrative, stripNarrativeMarkup } from "@/lib/reports/report-narrative";
import { reportDataFixture } from "../../helpers/report-data-fixture";

/** Hero's shape: nine directories cited; Localsearch linked, its own profile in 2 of its 10 citations. */
const HERO_ROWS: ReportDirectoryRow[] = [
  ["Yellow Pages", 12],
  ["Localsearch", 10],
  ["hipages", 8],
  ["Word of Mouth", 6],
  ["Oneflare", 5],
  ["Airtasker", 4],
  ["ServiceSeeking", 2],
  ["True Local", 2],
  ["ProductReview", 1],
].map(([name, citedCount]) => ({
  key: String(name).toLowerCase().replace(/\W+/g, "_"),
  name: String(name),
  citedCount: Number(citedCount),
  ownerProfileLinked: name === "Localsearch",
  ownerProfileCitedCount: name === "Localsearch" ? 2 : 0,
  ownerStatus: name === "Localsearch" ? ("listed" as const) : null,
}));

const STALE =
  /profile links haven't been added|profile links aren't added yet|we can't yet see whether any/;

function withRows(rows: ReportDirectoryRow[]): ReportData {
  const data = reportDataFixture("39");
  data.directories.rows = rows;
  return data;
}

function summaryAndFinding(rows: ReportDirectoryRow[]) {
  const data = withRows(rows);
  const narrative = reportNarrative(data, { diagnosisSection: "04" });
  const finding = reportFindings(data).find((f) => f.rule === "a");
  return {
    summary: narrative.paragraphs.map(stripNarrativeMarkup).join("\n"),
    dropped: narrative.dropped,
    explanation: finding?.explanation ?? "",
  };
}

describe("linkedStateSentence", () => {
  it("some linked (Hero): the linked one's count, then how many we can't tell for", () => {
    expect(linkedStateSentence(HERO_ROWS)).toBe(
      "Localsearch is linked: 2 of its 10 citations were your own profile. 8 directories aren't linked yet, so we can't tell for those.",
    );
  });

  it("none linked, one directory or several", () => {
    const none = HERO_ROWS.map((r) => ({
      ...r,
      ownerProfileLinked: false,
      ownerProfileCitedCount: 0,
    }));
    expect(linkedStateSentence(none)).toBe(
      "None of your directory profiles are linked yet, so we can't tell whether any of these citations were your own listings.",
    );
    expect(linkedStateSentence([none[1]])).toBe(
      "Your Localsearch profile isn't linked yet, so we can't tell whether its citations were your own listing.",
    );
  });

  it("all linked: each one's count, one with none of its own, and nothing about unlinked ones", () => {
    const all = HERO_ROWS.slice(0, 2).map((r) => ({ ...r, ownerProfileLinked: true }));
    expect(linkedStateSentence(all)).toBe(
      "Yellow Pages is linked: none of its 12 citations were your own profile. Localsearch is linked: 2 of its 10 citations were your own profile.",
    );
    expect(linkedStateSentence([])).toBeNull();
  });
});

describe("the PDF's summary and finding 1 say what's linked", () => {
  it("some linked (Hero): neither says the links haven't been added", () => {
    const { summary, explanation, dropped } = summaryAndFinding(HERO_ROWS);
    for (const text of [summary, explanation]) {
      expect(text).not.toMatch(STALE);
      expect(text).toContain(
        "Localsearch is linked: 2 of its 10 citations were your own profile. 8 directories aren't linked yet, so we can't tell for those.",
      );
    }
    expect(dropped).toBe(0);
  });

  it("none linked: both say so", () => {
    const none = HERO_ROWS.map((r) => ({
      ...r,
      ownerProfileLinked: false,
      ownerProfileCitedCount: 0,
      ownerStatus: null,
    }));
    const { summary, explanation } = summaryAndFinding(none);
    // True when nothing is linked; only wrong where one is.
    expect(summary).toMatch(/the profile links haven't been added/);
    expect(explanation).toContain(
      "None of your directory profiles are linked yet, so we can't tell whether any of these citations were your own listings.",
    );
  });

  it("all linked, none of them cited as yours: each one's count, and nothing about unlinked ones", () => {
    const all = HERO_ROWS.map((r) => ({
      ...r,
      ownerProfileLinked: true,
      ownerProfileCitedCount: 0,
      ownerStatus: "listed" as const,
    }));
    const { summary, explanation } = summaryAndFinding(all);
    for (const text of [summary, explanation]) {
      expect(text).not.toMatch(STALE);
      expect(text).not.toMatch(/aren't linked yet/);
      expect(text).toContain(
        "Localsearch is linked: none of its 10 citations were your own profile.",
      );
    }
  });
});
