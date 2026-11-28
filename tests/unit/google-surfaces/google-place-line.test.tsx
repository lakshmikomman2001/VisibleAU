/**
 * S04B part 5 (LLD amendment 110; contract P07.googlePlace): the audit page's Google Search AI card prints the PDF's
 * place line, "{suburb} {STATE} {postcode} · {device} · {date}", when Google was asked at the brand's own postcode (live
 * audits #57 and #58 printed "2161 NSW · desktop · 28 Nov 2026" where the PDF read "Yennora NSW 2161"). Another postcode,
 * a suburb or city location, or a brand with no suburb keeps the provider's place, as before. An invented brand.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleSearchAiSection } from "@/components/domain/audit/google-search-ai-section";
import {
  type GoogleSurfaceSummary,
  summarizeGoogleSurface,
} from "@/lib/audit/google-surfaces/summary";

function summary(
  location: GoogleSurfaceSummary["location"],
  labelLine: string,
): GoogleSurfaceSummary {
  return {
    status: "complete",
    statusReason: null,
    location,
    device: "desktop",
    labelLine,
    locationNote: null,
    countInHeadline: false,
    provider: "dataforseo",
    ranAt: "2026-11-28T03:00:00.000Z",
    rows: [
      summarizeGoogleSurface({
        surface: "google_ai_overviews",
        results: [],
        directories: [],
        status: "complete",
      }),
    ],
  };
}

const OWN = summary(
  { code: 9071111, label: "2758 NSW", kind: "postcode", precise: true, note: null },
  "2758 NSW · desktop · 28 Nov 2026",
);

function placeLine(
  s: GoogleSurfaceSummary,
  brand?: { suburb: string | null; postcode: string | null },
) {
  const html = renderToStaticMarkup(
    <GoogleSearchAiSection auditId="a" summary={s} brand={brand} />,
  );
  return html.match(/data-testid="p07-google-place"[^>]*>([^<]*)</)?.[1];
}

describe("P07.googlePlace", () => {
  it("the brand's own postcode: the PDF's line, suburb first", () => {
    expect(placeLine(OWN, { suburb: "kurrajong heights", postcode: "2758" })).toBe(
      "Kurrajong Heights NSW 2758 · desktop · 28 Nov 2026",
    );
  });

  it("another postcode (an operator's), a suburb location or no suburb: the provider's place, as before", () => {
    expect(placeLine(OWN, { suburb: "Kurrajong Heights", postcode: "2153" })).toBe(
      "2758 NSW · desktop · 28 Nov 2026",
    );
    expect(placeLine(OWN, { suburb: null, postcode: "2758" })).toBe(
      "2758 NSW · desktop · 28 Nov 2026",
    );
    const suburb = summary(
      { code: 1000286, label: "Kurrajong Heights, NSW", kind: "suburb", precise: true, note: null },
      "Kurrajong Heights, NSW · desktop · 28 Nov 2026",
    );
    expect(placeLine(suburb, { suburb: "Kurrajong Heights", postcode: "2758" })).toBe(
      "Kurrajong Heights, NSW · desktop · 28 Nov 2026",
    );
    expect(placeLine(OWN)).toBe("2758 NSW · desktop · 28 Nov 2026");
  });
});
