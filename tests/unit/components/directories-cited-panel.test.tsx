/**
 * Audit reliability, Part D polish (21 Oct, audit #30 live) -- the
 * panel's own rendering: ties broken by name, the owner-friendly
 * "answers to everyday customer questions" wording (replacing
 * "organic answers/responses" everywhere it showed up), and that a
 * cited entry's link keeps the real url while its visible text is the
 * cleaned displayUrl.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DirectoriesCitedPanel,
  type DirectoryCitedPanelRow,
} from "@/components/domain/audit/directories-cited-panel";

function row(overrides: Partial<DirectoryCitedPanelRow>): DirectoryCitedPanelRow {
  return {
    key: "hipages",
    name: "hipages",
    citedCount: 1,
    citedUrls: [],
    ownerProfileCited: false,
    ...overrides,
  };
}

describe("DirectoriesCitedPanel", () => {
  it('says "answers to everyday customer questions (questions that don\'t name your business)", never "organic"', () => {
    const html = renderToStaticMarkup(
      DirectoriesCitedPanel({ rows: [row({ citedCount: 3 })], totalAnswers: 37 }),
    );
    expect(html).toContain(
      "Out of 37 answers to everyday customer questions (questions that don&#x27;t name your business).",
    );
    expect(html).not.toContain("organic");
  });

  it("the zero-answers state also avoids the word \"organic\"", () => {
    const html = renderToStaticMarkup(DirectoriesCitedPanel({ rows: [], totalAnswers: 0 }));
    expect(html).not.toContain("organic");
    expect(html).toContain("No answers to everyday customer questions");
  });

  it("ties in citedCount are broken by name (alphabetical), not left in input order", () => {
    const html = renderToStaticMarkup(
      DirectoriesCitedPanel({
        rows: [
          row({ key: "oneflare", name: "Oneflare", citedCount: 2 }),
          row({ key: "airtasker", name: "Airtasker", citedCount: 2 }),
          row({ key: "hipages", name: "hipages", citedCount: 2 }),
        ],
        totalAnswers: 10,
      }),
    );
    const positions = ["Airtasker", "hipages", "Oneflare"].map((name) => html.indexOf(name));
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
  });

  it("a higher citedCount still sorts first regardless of name", () => {
    const html = renderToStaticMarkup(
      DirectoriesCitedPanel({
        rows: [
          row({ key: "airtasker", name: "Airtasker", citedCount: 1 }),
          row({ key: "hipages", name: "hipages", citedCount: 9 }),
        ],
        totalAnswers: 10,
      }),
    );
    expect(html.indexOf("hipages")).toBeLessThan(html.indexOf("Airtasker"));
  });

  // Task 14 (phones): the visible text is the cleaned displayUrl's host
  // and path, on one line with an ellipsis; the full url stays in the
  // href and the title, and the accessible name says where it goes.
  it("a cited entry's link href is the real url; its visible text is the cleaned displayUrl's host and path", () => {
    const html = renderToStaticMarkup(
      DirectoriesCitedPanel({
        rows: [
          row({
            citedCount: 1,
            citedUrls: [
              {
                url: "https://hipages.com.au/connect/norwestelectricalgroup?utm_source=openai",
                displayUrl: "https://hipages.com.au/connect/norwestelectricalgroup",
              },
            ],
          }),
        ],
        totalAnswers: 10,
      }),
    );
    expect(html).toContain('href="https://hipages.com.au/connect/norwestelectricalgroup?utm_source=openai"');
    expect(html).toContain(">hipages.com.au/connect/norwestelectricalgroup<");
    expect(html).not.toContain("utm_source=openai<");
    expect(html).toContain(
      'title="https://hipages.com.au/connect/norwestelectricalgroup?utm_source=openai"',
    );
    expect(html).toContain(
      'aria-label="Open hipages.com.au/connect/norwestelectricalgroup in a new tab"',
    );
    expect(html).toContain("white-space:nowrap");
    expect(html).toContain("text-overflow:ellipsis");
  });
});
