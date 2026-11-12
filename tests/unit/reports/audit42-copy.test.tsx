/**
 * Mock-gate and retention follow-ups (9 Nov), part 6 -- leftovers from audit #42 (Omega Services, 7 Nov, v2.2):
 * - the directory action said "They're cited in 32 of 48 directory citations" under evidence counted "of 40
 *   answers": one unit now, answers (lib/directories/cited-in-answers.ts);
 * - source links kept the AI's tracking tags in their hrefs (?utm_source=chatgpt.com): links are rendered without
 *   them, every other parameter kept (lib/urls/strip-tracking.ts); the stored URL is unchanged;
 * - "Make your services easy for AI to match" stated a cause the audit didn't measure: the title says what was
 *   measured, and the subtitle names a reason only where the stored rows show one (lib/reports/search-results.ts).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UrlLink } from "@/components/shared/url-link";
import { citedInAnswers, citedInAnswersList } from "@/lib/directories/cited-in-answers";
import type { ReportEngineRow } from "@/lib/reports/report-data";
import { reportFindings } from "@/lib/reports/report-findings";
import { searchResultsSeen } from "@/lib/reports/search-results";
import { linkHref } from "@/lib/urls/strip-tracking";
import { reportDataFixture } from "../../helpers/report-data-fixture";

describe("directory counts are in answers, the same unit as the evidence above them", () => {
  it("the action lists each directory's answers, never 'k of N directory citations'", () => {
    const data = reportDataFixture("39");
    const finding = reportFindings(data).find((f) => f.rule === "a");
    const n = data.directories.totalAnswers;
    expect(finding?.recommendation.detail).toBe(
      `They're cited in 8, 6 and 5 of ${n} answers; add your profile links in brand settings so we can match them with what AI cites.`,
    );
    expect(finding?.recommendation.detail).not.toMatch(/directory citations/);
    expect(finding?.evidence.map((line) => line[1].text)).toEqual([
      `cited in 8 of ${n} answers`,
      `cited in 6 of ${n} answers`,
      `cited in 5 of ${n} answers`,
    ]);
  });

  it("one formatter: a single directory, a list, and one answer", () => {
    expect(citedInAnswers(12, 40)).toBe("cited in 12 of 40 answers");
    expect(citedInAnswersList([12, 10, 10], 40)).toBe("cited in 12, 10 and 10 of 40 answers");
    expect(citedInAnswersList([12], 40)).toBe("cited in 12 of 40 answers");
    expect(citedInAnswers(1, 1)).toBe("cited in 1 of 1 answer");
  });
});

describe("source links open without the AI's tracking tags", () => {
  it("utm_* and the like are removed; every other parameter and the fragment stay", () => {
    expect(linkHref("https://www.hipages.com.au/connect/omega?utm_source=chatgpt.com")).toBe(
      "https://www.hipages.com.au/connect/omega",
    );
    expect(
      linkHref(
        "https://www.yellowpages.com.au/find?clue=electrician&utm_source=chatgpt.com&utm_medium=referral&gclid=abc#reviews",
      ),
    ).toBe("https://www.yellowpages.com.au/find?clue=electrician#reviews");
    expect(linkHref("https://example.com.au/page?id=7")).toBe("https://example.com.au/page?id=7");
    expect(linkHref("not a url")).toBe("not a url");
  });

  it("the shared link renders the clean href, and its label is unchanged", () => {
    const html = renderToStaticMarkup(
      <UrlLink url="https://www.hipages.com.au/connect/omega?utm_source=chatgpt.com&page=2" />,
    );
    expect(html).toContain('href="https://www.hipages.com.au/connect/omega?page=2"');
    expect(html).not.toContain("utm_source");
    expect(html).toContain(">hipages.com.au/connect/omega<");
  });
});

describe("an engine that never named the brand: what was measured, and only a measured reason", () => {
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
  const silentAction = (engines: ReportEngineRow[]) =>
    reportFindings({ ...reportDataFixture("39"), engines }).find((f) => f.rule === "b")
      ?.recommendation;

  it("the title states the measurement; with no stored search results, no reason at all", () => {
    const action = silentAction([
      row("chatgpt", "ChatGPT", 4),
      row("claude", "Claude", 0),
      row("gemini", "Gemini", 0),
    ]);
    expect(action?.title).toBe("Claude and Gemini didn't name you in any of 20 answers");
    expect(action?.detail).toBeUndefined();
    expect(JSON.stringify(action)).not.toMatch(/easy for AI to match|Strengthen/);
  });

  it("Claude's stored search results without the site: that, and only that, is the reason", () => {
    const action = silentAction([
      row("chatgpt", "ChatGPT", 4),
      row("claude", "Claude", 0, { searchResults: { answers: 10, withYourSite: 0 } }),
    ]);
    expect(action).toEqual({
      title: "Claude didn't name you in any of 10 answers",
      detail: "Your site didn't appear in Claude's search results in any of 10 answers.",
    });
  });

  it("counted from the stored rows: only answers that kept uncited search results, the site cited or not", () => {
    const domain = "omegaservices.com.au";
    const seen = searchResultsSeen(
      [
        // Kept search results, the site among them (uncited).
        {
          citedSources: [
            "https://www.hipages.com.au/x",
            { url: "https://omegaservices.com.au/about", cited: false },
          ],
        },
        // Kept search results, the site not among them.
        { citedSources: [{ url: "https://www.oneflare.com.au/y", cited: false }] },
        // Citations only: no proof the search results were stored, so not counted.
        { citedSources: ["https://omegaservices.com.au/"] },
        { citedSources: [] },
      ],
      domain,
    );
    expect(seen).toEqual({ answers: 2, withYourSite: 1 });
    expect(searchResultsSeen([{ citedSources: ["https://a.com.au"] }], domain)).toBeNull();
  });
});
